import * as _ from 'lodash';
import * as Bluebird from 'bluebird';
import * as Brakes from 'brakes';
import * as grpc from 'grpc';
import * as protoLoader from '@grpc/proto-loader';
import * as debug from 'debug';


import { GRPCHelperOpts, GRPCHelperError, GRPCHelperClient, GRPCOpts } from './common';
import { getMetricsInterceptor } from './metrics';
import { wrapWithBrake } from './brake';

const log = debug('grpcHelper:client');

Promise = Bluebird as any;

export class HelperClientCreator {
  private opts: GRPCHelperOpts;
  private grpcCredentials: grpc.ChannelCredentials;
  private grpcOpts: GRPCOpts;
  private Service: any;
  private methodNames: string[] = [];
  private serviceDefinition: protoLoader.ServiceDefinition;

  constructor(opts: GRPCHelperOpts) {
    this.opts = opts;
    this.setupGRPCCredentials();
    this.setupGRPCOpts();

    const { packageName: pkg, serviceName: svc } = this.opts;
    const packageDefinition = protoLoader.loadSync(
      this.opts.protoPath,
      {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true
      }
    );
    this.Service = grpc.loadPackageDefinition(packageDefinition)[pkg][svc];

    this.serviceDefinition = packageDefinition[`${pkg}.${svc}`];
  }

  public getMethodNames(): string[] {
    if (this.methodNames.length) {
      return this.methodNames;
    }
    _.each(this.serviceDefinition, (md, methodName) => {
      this.methodNames.push(methodName);
      if (md.originalName) {
        this.methodNames.push(methodName);
      }

      if (md.requestStream || md.responseStream) {
        return;
      }

      // keep callback style call
      const callbackMethod = `cb${methodName}`;
      this.methodNames.push(callbackMethod);
    });
    return this.methodNames;
  }

  private setupGRPCCredentials() {
    if (this.opts.sslOpts && this.opts.sslOpts.enable) {
      log('ssl enabled %s.%s', this.opts.packageName, this.opts.serviceName);

      let cacert: Buffer;
      if (this.opts.sslOpts.cacert) {
        cacert = Buffer.from(this.opts.sslOpts.cacert);
      }

      let cert: Buffer;
      if (this.opts.sslOpts.cert) {
        cert = Buffer.from(this.opts.sslOpts.cert);
      }

      let key: Buffer;
      if (this.opts.sslOpts.key) {
        key = Buffer.from(this.opts.sslOpts.key);
      }

      this.grpcCredentials = grpc.credentials.createSsl(cacert, cert, key);
    } else {
      log('ssl disabled %s.%s', this.opts.packageName, this.opts.serviceName);
      this.grpcCredentials = grpc.credentials.createInsecure();
    }
  }

  private setupGRPCOpts() {
    this.grpcOpts = this.opts.grpcOpts || {};
    if (this.opts.hostNameOverride) {
      log('override hostname %s', this.opts.hostNameOverride);
      this.grpcOpts = _.extend(this.grpcOpts, {
        'grpc.ssl_target_name_override': this.opts.hostNameOverride,
        'grpc.default_authority': this.opts.hostNameOverride,
      });
    }
  }

  private getBrake(pkg, svc, host) {
    const name = `${pkg}.${svc}`;

    const brakeOpts: any = {
      name: `${name}-${host}-brake`,
      healthCheck: null,
    };

    if (this.opts.healthCheck.enable) {
      brakeOpts.healthCheck = this.getBrakeHealthCheckFunc(name, host);
    }

    return new Brakes(Object.assign(brakeOpts, this.opts.brakeOpts));
  }

  public getDeadline(timeoutInMillSec: number): grpc.Deadline {
    return new Date(_.now() + timeoutInMillSec);
  }

  private getBrakeHealthCheckFunc(service: string, host: string): () => void {
    const { protoPath: proto, packageName: pkg, serviceName: svc } = this.opts.healthCheck;

    log('get health check func for %s %s', service, host);

    const packageDefinition = protoLoader.loadSync(
      proto,
      {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true
      }
    );

    const HealthService = grpc.loadPackageDefinition(packageDefinition)[pkg][svc];

    let healthClient = new HealthService(host, this.grpcCredentials, this.grpcOpts);
    healthClient = Promise.promisifyAll(healthClient);

    const _this = this;

    return async function healthCheck() {
      let rst;
      try {
        const deadline = _this.getDeadline(this.opts.healthCheck.timeoutInMillSec);

        rst = await healthClient.checkAsync({ service }, { deadline });

        log('health check success: %j', JSON.stringify(rst));

        if (rst.status === 'SERVING') return;
      } catch (e) {
        log('health check fail %j', e);
        throw e;
      }

      throw new GRPCHelperError('health check fail', rst);
    };
  }

  public createClientFromAddress(host: string): GRPCHelperClient {
    log('Setup client for %s', host);

    const { packageName: pkg, serviceName: svc } = this.opts;

    const _this = this;
    this.grpcOpts.interceptors = [
      function deadlineInterceptor(options: any, nextCall: any) {
        options.deadline = options.deadline || _this.getDeadline(_this.opts.timeoutInMillSec);
        return new grpc.InterceptingCall(nextCall(options));
      },
      getMetricsInterceptor(host),
    ];

    let grpcClient: grpc.Client = new this.Service(host, this.grpcCredentials, this.grpcOpts);

    const brake = this.getBrake(pkg, svc, host);

    const client = <GRPCHelperClient>{
      grpcClient,
      brake,
      connected: true,
    };


    _.each(this.serviceDefinition, (md, method) => {
      client[method] = grpcClient[method].bind(grpcClient);

      // only deal with client unary call
      if (md.requestStream || md.responseStream) {
        if (md.originalName) {
          client[md.originalName] = client[method];
        }
        return;
      }

      // keep callback style call
      const callbackMethod = `cb${method}`;
      client[callbackMethod] = client[method];

      // Start promisify and add brake for client unary call
      client[method] = Promise.promisify(client[method]);
      client[method] = wrapWithBrake(client[method], brake);

      if (md.originalName) {
        client[md.originalName] = client[method];
      }
    });

    return client;
  }
}
