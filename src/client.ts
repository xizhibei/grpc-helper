import * as _ from 'lodash';
import * as Bluebird from 'bluebird';
import * as Brakes from 'brakes';
import * as grpc from 'grpc';
import * as protoLoader from '@grpc/proto-loader';
import * as debug from 'debug';


import { GRPCHelperOpts, GRPCHelperClient, GRPCOpts } from './common';
import { getMetricsInterceptor } from './metrics';
import { wrapWithBrake } from './brake';
import { getDeadlineInterceptor } from './interceptor';
import { getBrakeHealthCheckFunc } from './health';

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

      const { cacert, cert, key } = this.opts.sslOpts;

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
      brakeOpts.healthCheck = getBrakeHealthCheckFunc(name, host, {
        timeoutInMS: this.opts.healthCheck.timeoutInMS,
        grpcCredentials: this.grpcCredentials,
        grpcOpts: this.grpcOpts,
      });
    }

    return new Brakes(Object.assign(brakeOpts, this.opts.brakeOpts));
  }

  public createClientFromAddress(host: string): GRPCHelperClient {
    log('Setup client for %s', host);

    const { packageName: pkg, serviceName: svc } = this.opts;

    this.grpcOpts.interceptors = [
      getDeadlineInterceptor(this.opts.timeoutInMS),
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
