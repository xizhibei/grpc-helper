import * as dns from 'dns';
import * as url from 'url';
import * as qs from 'qs';
import { EventEmitter } from 'events';

import * as Bluebird from 'bluebird';
import * as debug from 'debug';
import * as _ from 'lodash';
import { GRPCHelperError } from './common';

Promise = Bluebird as any;

const log = debug('grpcHelper:naming');

export interface Address {
  addr: string;
}

export enum UpdateOp {
  ADD,
  DEL,
}

export interface Update {
  op: UpdateOp;
  addr: string;
}

export interface Watcher {
  next(): Promise<Update[]>;
  close(): Promise<void>;
}

export interface Resolver {
  resolve(target: string): Watcher;
}

export class DNSResolver implements Resolver {
  parseUrl(target: string): any {
    const { query, pathname } = url.parse(target);
    if (!pathname) throw new GRPCHelperError('invalid pathname');
    return { pathname, query: qs.parse(query) };
  }

  /**
   * Resolve the dns src records
   * #### Curreny available query params:
   *   - [intervalMs=5000] number, determines how frequent the dns resolver lookup the srv records
   * @param {string} target In the format of _grpc._tcp.service-name[?intervalMs=5000]
   */
  resolve(target: string): Watcher {
    const { pathname, query } = this.parseUrl(target);
    log('parse target into basename %s, query %j', pathname, query);

    return new DNSWatcher(async function(): Promise<Address[]> {
      const resolveSrv = Promise.promisify(dns.resolveSrv);
      const recoreds = await resolveSrv(pathname);

      return _.map(recoreds, record => {
        return <Address>{
          addr: `${record.name}:${record.port}`,
        };
      });
    }, query.intervalMs);
  }
}

export class StaticResolver implements Resolver {
  resolve(target: string): Watcher {
    return new StaticWatcher(async function(): Promise<Address[]> {
      const hosts = target.split(',');

      return _.map(hosts, host => {
        return <Address>{
          addr: host,
        };
      });
    });
  }
}

interface AddrMap {
  [addr: string]: Address;
}

export class DNSWatcher extends EventEmitter implements Watcher {
  private intervalMs: number;
  private addrMap: AddrMap = {};
  private resolveAddrs: () => Promise<Address[]>;
  private updates: Update[] = [];

  constructor(resolveAddrs: () => Promise<Address[]>, intervalMs: number = 5000) {
    super();

    this.intervalMs = intervalMs;
    this.resolveAddrs = resolveAddrs;

    this.update();
  }

  private async update(): Promise<void> {
    let addrs = _.values(this.addrMap)
    try {
      addrs = await this.resolveAddrs();
    } catch (err) {
      log('dns resolve error: %s', err.message);
    }

    const newAddrMap = _.keyBy(addrs, 'addr');

    _.each(this.addrMap, (a, k) => {
      if (!newAddrMap[k]) {
        this.updates.push(<Update>{
          op: UpdateOp.DEL,
          addr: k,
        });
      }
    });

    _.each(newAddrMap, (a, k) => {
      if (!this.addrMap[k]) {
        this.updates.push(<Update>{
          op: UpdateOp.ADD,
          addr: k,
        });
      }
    });

    if (this.updates.length) {
      this.emit('updates');
    }

    this.addrMap = newAddrMap;

    setTimeout(this.update.bind(this), this.intervalMs);
  }

  public async next(): Promise<Update[]> {
    log('wait for updates');
    return new Promise<Update[]>(resolve => {
      this.once('updates', () => {
        if (this.updates.length) {
          resolve(this.updates);
          this.updates = [];
        }
      });
    });
  }

  public async close(): Promise<void> {
  }
}

export class StaticWatcher extends EventEmitter implements Watcher {
  private resolveAddrs: () => Promise<Address[]>;
  private updates: Update[] = [];

  constructor(resolveAddrs: () => Promise<Address[]>) {
    super();

    this.resolveAddrs = resolveAddrs;
    this.update();
  }

  private async update() {
    const addrs = await this.resolveAddrs();
    this.updates = _.map(addrs, a => {
      return <Update>{
        addr: a.addr,
        op: UpdateOp.ADD,
      };
    });

    this.emit('updates');
  }

  public async next(): Promise<Update[]> {
    return new Promise<Update[]>(resolve => {
      this.once('updates', () => {
        if (this.updates.length) {          resolve(this.updates);
          this.updates = [];
        }
      });
    });
  }

  public async close(): Promise<void> {
  }
}
