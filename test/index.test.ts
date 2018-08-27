import * as path from 'path';

import test from 'ava';

import { startServer } from './server';

import * as mock from 'mock-require';
import { map } from 'lodash';
import { SrvRecord } from 'dns';

let srvRecords = [];
mock('dns', {
  resolveSrv(name, cb) {
    return cb(null, srvRecords);
  },
});

import { GRPCHelper } from '../src/index';

test('#sayHello dns', async t => {
  const { port: port1 } = startServer();
  const { port: port2 } = startServer();
  const { port: port3 } = startServer();

  srvRecords = map([port1, port2, port3], port => {
    return <SrvRecord>{
      name: 'localhost',
      port,
      weight: 1,
      priority: 10,
    };
  });

  const helper = new GRPCHelper({
    packageName: 'helloworld',
    serviceName: 'Greeter',
    protoPath: path.resolve(__dirname, './hello.proto'),
    sdUri: 'dns://_http._tcp.greeter',
  });

  await helper.waitForReady();

  const res = await helper.SayHello({
    name: 'foo',
  });
  t.is(res.message, 'hello foo');
});

test('#sayHello static', async t => {
  const { port: port1 } = startServer();
  const { port: port2 } = startServer();
  const { port: port3 } = startServer();

  const helper = new GRPCHelper({
    packageName: 'helloworld',
    serviceName: 'Greeter',
    protoPath: path.resolve(__dirname, './hello.proto'),
    sdUri: `static://localhost:${port1},localhost:${port2},localhost:${port3}`,
  });

  await helper.waitForReady();

  const res = await helper.SayHello({
    name: 'foo',
  });
  t.is(res.message, 'hello foo');
});
