import * as path from 'path';

import * as Bluebird from 'bluebird';
import * as debug from 'debug';
import { each } from 'lodash';
import * as retry from 'async-retry';

import { GRPCHelperOpts, GRPCHelperError } from './common';
import { RoundRobinBalancer, Balancer } from './lb';
import { HelperClientCreator, ClientFactory } from './client';
import { Resolver, DNSResolver, StaticResolver, EtcdV3Resolver } from './naming';

const log = debug('grpcHelper:helper');

Promise = Bluebird as any;

export interface ServiceDiscoveryOpts {
  type: string;
  addr: string;
}

export class GRPCHelper {
  private opts: GRPCHelperOpts;
  private lb: Balancer;

  [method: string]: Function | any;

  constructor(opts: GRPCHelperOpts) {

    this.opts = Object.assign({
      timeoutInMS: 5000,
      metrics: true,
    }, opts);

    this.opts.healthCheck = Object.assign({
      enable: false,
      timeoutInMS: 5000,
      protoPath: path.resolve(__dirname, 'health.proto'),
    }, opts.healthCheck);

    this.opts.retryOpts = Object.assign({
      enable: false,
    }, opts.retryOpts);

    this.opts.grpcProtoLoaderOpts = Object.assign({
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true
    }, opts.grpcProtoLoaderOpts);

    const clientCreator: HelperClientCreator = new HelperClientCreator(this.opts);

    const { type, addr } = this.parseSDUri(this.opts.sdUri);
    log('service discovery use %s', type);

    let resolver: Resolver;
    if (type === 'dns') {
      resolver = new DNSResolver();
    } else if (type === 'static') {
      resolver = new StaticResolver();
    } else if (type === 'etcdv3') {
      resolver = new EtcdV3Resolver();
    } else {
      throw new GRPCHelperError(`resolver not implemented: ${type}`);
    }

    this.lb = new RoundRobinBalancer(resolver, clientCreator);

    this.lb.start(addr);

    const methodNames = clientCreator.getMethodNames();

    const { retryOpts } = this.opts;
    each(methodNames, method => {
      if (!retryOpts.enable) {
        this[method] = (...args) => {
          const client = this.lb.get();
          return client[method](...args);
        };
        return;
      }

      // Implement retry logic by async-retry
      this[method] = (...args) => {
        return retry(async (bail, attempt: number) => {
          const client = this.lb.get();
          let res;
          try {
            res = await client[method](...args);
          } catch (e) {
            if (retryOpts.bailError && retryOpts.bailError(e, attempt)) {
              bail(e);
              return;
            }
            throw e;
          }
          return res;
        }, retryOpts);
      };
    });
  }

  public async waitForReady(): Promise<void> {
    return this.lb.waitForReady();
  }

  private parseSDUri(sdUri: string): ServiceDiscoveryOpts {
    const idx = sdUri.indexOf('://');
    const type = sdUri.slice(0, idx);
    const addr = sdUri.slice(idx + 3);

    return { type, addr };
  }
}
