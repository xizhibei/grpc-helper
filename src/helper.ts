import * as path from 'path';

import * as Bluebird from 'bluebird';
import * as debug from 'debug';
import { each } from 'lodash';

import { GRPCHelperOpts, GRPCHelperError } from './common';
import { RoundRobinBalancer, Balancer } from './lb';
import { HelperClientCreator } from './client';
import { Resolver, DNSResolver, StaticResolver } from './naming';

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

    const clientCreator = new HelperClientCreator(this.opts);

    const { type, addr } = this.parseSDUri(this.opts.sdUri);
    log('service discovery use %s', type);

    let resolver: Resolver;
    if (type === 'dns') {
      resolver = new DNSResolver();
    } else if (type === 'static') {
      resolver = new StaticResolver();
    } else {
      throw new GRPCHelperError(`resolver not implemented: ${type}`);
    }

    const createClient = clientCreator.createClientFromAddress.bind(clientCreator);
    this.lb = new RoundRobinBalancer(resolver, createClient);

    this.lb.start(addr);

    const methodNames = clientCreator.getMethodNames();
    each(methodNames, method => {
      this[method] = (...args) => {
        const client = this.lb.get();
        return client[method](...args);
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
