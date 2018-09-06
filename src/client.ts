import * as _ from 'lodash';
import * as Bluebird from 'bluebird';
import * as Brakes from 'brakes';
import * as grpc from 'grpc';
import * as protoLoader from '@grpc/proto-loader';
import * as debug from 'debug';


import { GRPCHelperOpts, GRPCHelperClient, GRPCOpts, BrakeOpts } from './common';
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
    this.setupSvcDefs();
  }

  public getMethodNames(): string[] {
    return this.methodNames;
  }

  private setupSvcDefs() {
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

    _.each(this.serviceDefinition, (md, methodName) => {
      this.methodNames.push(methodName);
      if (md.originalName) {
        this.methodNames.push(md.originalName);
      }

      if (md.responseStream) {
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

    const brakeOpts: BrakeOpts = {
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

    const {
      packageName: pkg,
      serviceName: svc,
      timeoutInMS,
      metrics,
      resolveFullResponse,
    } = this.opts;

    this.grpcOpts.interceptors = this.grpcOpts.interceptors || [];

    if (metrics) {
      log('enable metrics for %s', host);
      this.grpcOpts.interceptors.push(getMetricsInterceptor(host));
    }

    if (timeoutInMS) {
      log('enable global timeout: %d ms', timeoutInMS);
      this.grpcOpts.interceptors.push(getDeadlineInterceptor(timeoutInMS));
    }

    let grpcClient: grpc.Client = new this.Service(host, this.grpcCredentials, this.grpcOpts);

    const brake = this.getBrake(pkg, svc, host);

    const client = <GRPCHelperClient>{
      grpcClient,
      brake,
      connected: true,
    };


    _.each(this.serviceDefinition, (md, method) => {
      const methodCall = grpcClient[method].bind(grpcClient);

      // only deal with call with callback
      if (md.responseStream) {
        client[method] = methodCall;
        if (md.originalName) {
          client[md.originalName] = methodCall;
        }
        return;
      }

      // keep callback style call
      const callbackMethod = `cb${method}`;
      client[callbackMethod] = methodCall;

      // Start promisify and add brake for call with callback
      function wrappedMethodCall(data: any, ...args) {
        let isStream = _.isFunction(data.read) && _.isFunction(data.on);

        let call;
        const message = new Promise((resolve, reject) => {
          if (isStream) {
            call = methodCall(...args, (err, rst) => {
              if (err) return reject(err);
              resolve(rst);
            });
            data.pipe(call);
            return;
          }
          call = methodCall(data, ...args, (err, rst) => {
            if (err) return reject(err);
            resolve(rst);
          });
        });

        if (!resolveFullResponse) {
          return message;
        }

        // Resolve with full response
        return Promise.props({
          metadata: new Promise(resolve => call.on('metadata', resolve)),
          status: new Promise(resolve => call.on('status', resolve)),
          message,
          peer: call.getPeer(),
        });
      }

      client[method] = wrapWithBrake(wrappedMethodCall, brake);

      if (md.originalName) {
        client[md.originalName] = client[method];
      }
    });

    return client;
  }
}
