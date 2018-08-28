import test from 'ava';
import * as _ from 'lodash';
import * as mock from 'mock-require';
import { SrvRecord } from 'dns';

let srvRecords = [];
mock('dns', {
  resolveSrv(name, cb) {
    return cb(null, srvRecords);
  },
});

import { DNSResolver, UpdateOp } from '../src/naming';

test('#naming dns resolver', async t => {
  const resolver = new DNSResolver();
  const watcher = resolver.resolve('test');

  srvRecords = _.map([1111, 2222, 3333], port => {
    return <SrvRecord>{
      name: 'localhost',
      port,
      weight: 1,
      priority: 10,
    };
  });
  t.log(srvRecords);

  const updates1 = await watcher.next();
  const addrs1 = ['localhost:1111', 'localhost:2222', 'localhost:3333'];

  _.each(updates1, (update, i) => {
    t.is(update.op, UpdateOp.ADD);
    t.is(update.addr, addrs1[i]);
  });

  srvRecords = _.map([2222, 3333], port => {
    return <SrvRecord>{
      name: 'localhost',
      port,
      weight: 1,
      priority: 10,
    };
  });
  t.log(srvRecords);

  const updates2 = await watcher.next();

  _.each(updates2, (update, i) => {
    t.is(update.op, UpdateOp.DEL);
    t.is(update.addr, 'localhost:1111');
  });

  srvRecords = _.map([2222, 3333, 4444], port => {
    return <SrvRecord>{
      name: 'localhost',
      port,
      weight: 1,
      priority: 10,
    };
  });
  t.log(srvRecords);

  const updates3 = await watcher.next();

  _.each(updates3, (update, i) => {
    t.is(update.op, UpdateOp.ADD);
    t.is(update.addr, 'localhost:4444');
  });
});
