import * as path from 'path';

import * as Bluebird from 'bluebird';
import * as debug from 'debug';

import { GRPCHelperOpts, GRPCHelperClient, GRPCHelperError } from './common';
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

  constructor(opts: GRPCHelperOpts) {

    this.opts = Object.assign({
      timeoutInMillSec: 5000,
    }, opts);

    this.opts.healthCheck = Object.assign({
      enable: false,
      timeoutInMillSec: 5000,
      protoPath: path.resolve(__dirname, 'health.proto'),
      serviceName: 'Health',
      packageName: 'grpc.health.v1',
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

    this.lb = new RoundRobinBalancer(resolver, clientCreator);

    this.lb.start(addr);
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

  public getClient(): GRPCHelperClient {
    return this.lb.get();
  }
}
