import test from 'ava';
import * as Brakes from 'brakes';
import * as _ from 'lodash';
import * as grpc from 'grpc';

import { Resolver, Address, Watcher, Update, UpdateOp } from '../src/naming';
import { RoundRobinBalancer } from '../src/lb';
import { GRPCHelperClient } from '../src/common';
import { EventEmitter } from 'events';
import { ClientFactory } from '../src';

class CustomResoler extends EventEmitter implements Resolver {
  resolve(target: string): Watcher {
    const watcher = new CustomWatcher(async function(): Promise<Address[]> {
      return [];
    });

    this.on('next', () => watcher.emit('next'));

    return watcher;
  }
}

class CustomWatcher extends EventEmitter implements Watcher {
  private resolveAddrs: () => Promise<Address[]>;
  private updates: Update[] = [{
    addr: 'localhost:1111',
    op: UpdateOp.ADD,
  }, {
    addr: 'localhost:2222',
    op: UpdateOp.ADD,
  }, {
    addr: 'localhost:3333',
    op: UpdateOp.ADD,
  }, {
    addr: 'localhost:1111',
    op: UpdateOp.DEL,
  }, {
    addr: 'localhost:4444',
    op: UpdateOp.ADD,
  }, {
    addr: 'localhost:0',
    op: 3,
  }];

  constructor(resolveAddrs: () => Promise<Address[]>) {
    super();

    this.resolveAddrs = resolveAddrs;
  }

  public async next(): Promise<Update[]> {
    return new Promise<Update[]>(resolve => {
      this.once('next', () => {
        if (this.updates.length) {
          resolve([this.updates.shift()]);
        }
      });
    });
  }

  public async close(): Promise<void> {
  }
}

class ClientCreator implements ClientFactory {
  createClient(addr: string) {
    return <GRPCHelperClient>{
      address: addr,
      connected: true,
      brake: new Brakes(),
    };
  }
  closeClient() {
  }
}

async function testlb(t, resolver, lb, addrs) {
  return new Promise(resolve => {
    lb.once('change', clients => {
      const resAddrs = _.map(clients, 'address');
      t.log(resAddrs);
      t.deepEqual(resAddrs.sort(), addrs);
      resolve();
    });
    resolver.emit('next');
  });
}


test('#lb with custom resolver', async t => {
  const resolver = new CustomResoler();
  const lb = new RoundRobinBalancer(resolver, new ClientCreator());

  lb.start('test');
  await testlb(t, resolver, lb, ['localhost:1111']);
  await testlb(t, resolver, lb, ['localhost:1111', 'localhost:2222']);
  await testlb(t, resolver, lb, ['localhost:1111', 'localhost:2222', 'localhost:3333']);
  await testlb(t, resolver, lb, ['localhost:2222', 'localhost:3333']);
  await testlb(t, resolver, lb, ['localhost:2222', 'localhost:3333', 'localhost:4444']);

  await lb.waitForReady();
  lb.on('error', (e) => {
    t.is(e.message, 'unknwon update op, 3');
  });
  resolver.emit('next');

  lb.close();
});
