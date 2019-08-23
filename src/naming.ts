import * as dns from 'dns';
import * as url from 'url';
import * as qs from 'qs';
import { EventEmitter } from 'events';

import * as Bluebird from 'bluebird';
import * as debug from 'debug';
import * as _ from 'lodash';
import * as etcd3 from 'etcd3';

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

    return new DNSWatcher(async function (): Promise<Address[]> {
      const resolveSrv = Promise.promisify(dns.resolveSrv);

      const records = await resolveSrv(pathname);

      return _.map(records, record => {
        return <Address>{
          addr: `${record.name}:${record.port}`,
        };
      });
    }, query.intervalMs);
  }
}

export class StaticResolver implements Resolver {
  resolve(target: string): Watcher {
    return new StaticWatcher(async function (): Promise<Address[]> {
      const hosts = target.split(',');

      return _.map(hosts, host => {
        return <Address>{
          addr: host,
        };
      });
    });
  }
}

export class EtcdV3Resolver implements Resolver {
  parseUrl(target: string): any {
    const { query, pathname } = url.parse(target);
    if (!pathname) throw new GRPCHelperError('invalid pathname');
    return { pathname, query: query.split(',') };
  }

  resolve(target: string): Watcher {
    const { pathname, query } = this.parseUrl(target)
    log('parse target into basename %s, query %j', pathname, query);

    return new EtcdV3Watcher(query, `/${pathname}`);
  }
}
interface AddrMap {
  [addr: string]: Address;
}

export class DNSWatcher extends EventEmitter implements Watcher {
  private addrMap: AddrMap = {};
  private resolveAddrs: () => Promise<Address[]>;
  private updates: Update[] = [];
  private interval: NodeJS.Timer;

  constructor(resolveAddrs: () => Promise<Address[]>, intervalMs: number = 5000) {
    super();

    this.resolveAddrs = resolveAddrs;

    this.update();
    this.interval = setInterval(this.update.bind(this), intervalMs);
  }

  private async update(): Promise<void> {
    let addrs = null;
    try {
      addrs = await this.resolveAddrs();
    } catch (e) {
      this.emit('error', e);
      return;
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
    clearInterval(this.interval);
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

export class EtcdV3Watcher extends EventEmitter implements Watcher {
  private updates: Update[] = [];
  private client: etcd3.Etcd3;
  private pathKey: string = '';

  constructor(addr: string[], pathKey: string) {
    super();

    this.pathKey = pathKey;
    this.client = new etcd3.Etcd3({ hosts: addr })
    this.init();
  }

  private async init(): Promise<void> {
    const servers = await this.client.getAll().prefix(this.pathKey).json();
    this.init_server(servers)

    this.emit('updates');
    this.update();
  }

  private async init_server(servers) {
    _.each(servers, (v, k) => {
      this.updates.push(<Update>{
        op: UpdateOp.ADD,
        addr: v.addr,
      });
    })
  }

  private async add_server(server: string) {
    const serverObj = JSON.parse(server)
    this.updates.push(<Update>{
      op: UpdateOp.ADD,
      addr: serverObj.addr,
    });
    this.emit('updates');
  }

  private async del_server(server: string) {
    const arr = server.split('/')
    this.updates.push(<Update>{
      op: UpdateOp.DEL,
      addr: arr[2],
    });

    this.emit('updates');
  }

  private async update(): Promise<void> {
    const watcher = await this.client.watch().prefix(this.pathKey).create();

    watcher
      .on('put', (res) => {
        log('etcdv3 put', res.value.toString());
        this.add_server(res.value.toString())
        this.update()
      })
      .on('delete', (res) => {
        log('etcdv3 delete', res.key.toString());
        this.del_server(res.key.toString())
        this.update()
      })

    this.emit('updates');
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
