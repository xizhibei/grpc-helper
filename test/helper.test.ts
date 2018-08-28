import * as fs from 'fs';
import * as path from 'path';

import test from 'ava';
import * as _ from 'lodash';
import * as mock from 'mock-require';
import { SrvRecord } from 'dns';

import { startServers } from './server';

let srvRecords = [];
mock('dns', {
  resolveSrv(name, cb) {
    return cb(null, srvRecords);
  },
});

import { GRPCHelper } from '../src/helper';
import { GRPCHelperSslOpts } from '../src';

test('#dns service discovery && load balance', async t => {
  const { servers, stopServers } = startServers(3);

  srvRecords = _.map(servers, s => {
    return <SrvRecord>{
      name: 'localhost',
      port: s.port,
      weight: 1,
      priority: 10,
    };
  });
  t.log(srvRecords);

  const helper = new GRPCHelper({
    packageName: 'helloworld',
    serviceName: 'Greeter',
    protoPath: path.resolve(__dirname, './hello.proto'),
    sdUri: 'dns://_http._tcp.greeter',
  });

  await helper.waitForReady();

  const res1 = await helper.SayHello({
    name: 'foo',
  });

  t.is(res1.message, 'hello foo');

  const res2 = await helper.SayHello({
    name: 'foo',
  });

  t.is(res2.message, 'hello foo');

  const res3 = await helper.SayHello({
    name: 'foo',
  });

  t.is(res3.message, 'hello foo');

  t.log([
    res1.serverId,
    res2.serverId,
    res3.serverId,
  ].sort());

  t.deepEqual([
    res1.serverId,
    res2.serverId,
    res3.serverId,
  ].sort(), [
    servers[0].id,
    servers[1].id,
    servers[2].id,
  ]);

  stopServers();
});

test('#static service discovery && load balance', async t => {
  const { servers, stopServers } = startServers(3);
  const list = _.map(servers, s => `localhost:${s.port}`).join(',');
  t.log(list);

  const helper = new GRPCHelper({
    packageName: 'helloworld',
    serviceName: 'Greeter',
    protoPath: path.resolve(__dirname, './hello.proto'),
    sdUri: `static://${list}`,
  });

  await helper.waitForReady();

  const res1 = await helper.SayHello({
    name: 'foo',
  });

  t.is(res1.message, 'hello foo');

  const res2 = await helper.SayHello({
    name: 'foo',
  });

  t.is(res2.message, 'hello foo');

  const res3 = await helper.SayHello({
    name: 'foo',
  });

  t.is(res3.message, 'hello foo');

  t.log([
    res1.serverId,
    res2.serverId,
    res3.serverId,
  ].sort());

  t.deepEqual([
    res1.serverId,
    res2.serverId,
    res3.serverId,
  ].sort(), [
    servers[0].id,
    servers[1].id,
    servers[2].id,
  ]);

  stopServers();
});

test('#helper health check', async t => {
  const { servers, stopServers } = startServers(3);
  const list = _.map(servers, s => `localhost:${s.port}`).join(',');
  t.log(list);

  const helper = new GRPCHelper({
    packageName: 'helloworld',
    serviceName: 'Greeter',
    protoPath: path.resolve(__dirname, './hello.proto'),
    sdUri: `static://${list}`,
    healthCheck: {
      enable: true,
    },
  });

  await helper.waitForReady();

  const res = await helper.SayHello({
    name: 'foo',
  });

  t.is(res.message, 'hello foo');

  stopServers();
});

test('#helper ssl', async t => {
  const { servers, stopServers } = startServers(3, true);
  const list = _.map(servers, s => `localhost:${s.port}`).join(',');
  t.log(list);

  const helper = new GRPCHelper({
    packageName: 'helloworld',
    serviceName: 'Greeter',
    protoPath: path.resolve(__dirname, './hello.proto'),
    sdUri: `static://${list}`,
    hostNameOverride: 'localhost',
    sslOpts: <GRPCHelperSslOpts>{
      enable: true,
      cacert: fs.readFileSync(path.resolve(__dirname, './fixtures/ca.crt')),
    },
  });

  await helper.waitForReady();

  const res1 = await helper.SayHello({
    name: 'foo',
  });

  t.is(res1.message, 'hello foo');

  const res2 = await helper.SayHello({
    name: 'foo',
  });

  t.is(res2.message, 'hello foo');

  const res3 = await helper.SayHello({
    name: 'foo',
  });

  t.is(res3.message, 'hello foo');

  t.log([
    res1.serverId,
    res2.serverId,
    res3.serverId,
  ].sort());

  t.deepEqual([
    res1.serverId,
    res2.serverId,
    res3.serverId,
  ].sort(), [
    servers[0].id,
    servers[1].id,
    servers[2].id,
  ]);

  stopServers();
});

test('#helper throws error when resolver not supported', async t => {
  try {
    (new GRPCHelper({
      packageName: 'helloworld',
      serviceName: 'Greeter',
      protoPath: path.resolve(__dirname, './hello.proto'),
      sdUri: 'unknown://test',
    }));
  } catch (e) {
    t.is(e.name, 'GRPCHelperError');
    t.is(e.message, 'resolver not implemented: unknown');
  }
});
