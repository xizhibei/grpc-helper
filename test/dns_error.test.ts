import test from 'ava';
import * as _ from 'lodash';
import * as mock from 'mock-require';
import { SrvRecord } from 'dns';

let srvRecords = [];
let dnsLookUpTimes = 0;
mock('dns', {
  resolveSrv(name, cb) {
    dnsLookUpTimes += 1;
    if (dnsLookUpTimes === 1) {
      return cb(new Error('lookup failed'), []);
    }
    return cb(null, srvRecords);
  },
});

import { DNSResolver, DNSWatcher, UpdateOp } from '../src/naming';

test('#naming dns resolver', async t => {
  const resolver = new DNSResolver();
  const watcher = resolver.resolve('_grpc._tcp.test?intervalMs=100');

  t.plan(7);

  (<DNSWatcher>watcher).on('error', (e) => {
    t.is(e.message, 'lookup failed');
  });

  srvRecords = _.map([1111, 2222, 3333], port => {
    return <SrvRecord>{
      name: 'localhost',
      port,
      weight: 1,
      priority: 10,
    };
  });
  t.log(srvRecords);

  const updates = await watcher.next();
  const addrs = ['localhost:1111', 'localhost:2222', 'localhost:3333'];

  _.each(updates, (update, i) => {
    t.is(update.op, UpdateOp.ADD);
    t.is(update.addr, addrs[i]);
  });

  watcher.close();
});
