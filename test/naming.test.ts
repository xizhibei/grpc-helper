import test from 'ava';
import * as _ from 'lodash';
import * as mock from 'mock-require';
import { SrvRecord } from 'dns';
import * as etcdv3 from 'etcd3';

let srvRecords = [];
mock('dns', {
  resolveSrv(name, cb) {
    return cb(null, srvRecords);
  },
});
let srvEtcds = [];

import { DNSResolver, UpdateOp, EtcdV3Resolver } from '../src/naming';
test('#naming dns resolver', async t => {
  const resolver = new DNSResolver();
  const watcher = resolver.resolve('_grpc._tcp.test?intervalMs=100');

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

  watcher.close();
});

test('#naming etcd3 resolver', async t => {
  const pathKey: string = 'test-user';
  const client: etcdv3.Etcd3 = new etcdv3.Etcd3({ hosts: 'localhost:2379'});
  const lease = client.lease(10);
  await Promise.all(_.map([1111, 2222, 3333], async port => {
    const pathValue = {
      name: pathKey,
      addr: `localhost:${port}`,
      version: "",
      weight: 0,
    };
    await lease.put(`/${pathKey}/localhost:${port}`).value(JSON.stringify(pathValue));
  }))

  const resolver = new EtcdV3Resolver();
  const watcher = resolver.resolve(`${pathKey}?localhost:2379`);

  const updates1 = await watcher.next();
  const addrs1 = ['localhost:1111', 'localhost:2222', 'localhost:3333'];

  _.each(updates1, (update, i) => {
    t.is(update.op, UpdateOp.ADD);
    t.is(update.addr, addrs1[i]);
  });

  const lease2 = client.lease(10);
  await Promise.all(_.map([6666], async port => {
    const pathValue = {
      name: pathKey,
      addr: `localhost:${port}`,
      version: "",
      weight: 0,
    };
    await lease2.put(`/${pathKey}/localhost:${port}`).value(JSON.stringify(pathValue));
  }))
  const updates2 = await watcher.next();

  _.each(updates2, (update, i) => {
    t.is(update.op, UpdateOp.ADD);
    t.is(update.addr, 'localhost:6666');
  });

  await Promise.all(_.map([6666], async port => {
    const pathValue = {
      name: pathKey,
      addr: `localhost:${port}`,
      version: "",
      weight: 0,
    };
    await lease2.revoke();
  }))
  const updates3 = await watcher.next();

  _.each(updates3, (update, i) => {
    t.is(update.op, UpdateOp.DEL);
    t.is(update.addr, 'localhost:6666');
  });

  watcher.close();
});
