import * as fs from 'fs';
import * as path from 'path';
import { SrvRecord } from 'dns';
import { PassThrough } from 'stream';

import test from 'ava';
import * as grpc from 'grpc';
import * as _ from 'lodash';
import * as mock from 'mock-require';

import { startServers } from './server';

let srvRecords = [];
mock('dns', {
  resolveSrv(name, cb) {
    return cb(null, srvRecords);
  },
});

import { GRPCHelper, GRPCHelperSslOpts } from '../src';

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
    protoPath: path.resolve(__dirname, './fixtures/hello.proto'),
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
    protoPath: path.resolve(__dirname, './fixtures/hello.proto'),
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
    protoPath: path.resolve(__dirname, './fixtures/hello.proto'),
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
  const { servers, stopServers } = startServers(3, { secure: true });
  const list = _.map(servers, s => `localhost:${s.port}`).join(',');
  t.log(list);

  const helper = new GRPCHelper({
    packageName: 'helloworld',
    serviceName: 'Greeter',
    protoPath: path.resolve(__dirname, './fixtures/hello.proto'),
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

test('#helper package name contains dot', async t => {
  const { servers, stopServers } = startServers(3, { secure: true });
  const list = _.map(servers, s => `localhost:${s.port}`).join(',');
  t.log(list);

  const helper = new GRPCHelper({
    packageName: 'hello.world.v1',
    serviceName: 'Greeter',
    protoPath: path.resolve(__dirname, './fixtures/hello.world.proto'),
    sdUri: `static://${list}`,
    hostNameOverride: 'localhost',
    sslOpts: <GRPCHelperSslOpts>{
      enable: true,
      cacert: fs.readFileSync(path.resolve(__dirname, './fixtures/ca.crt')),
    },
  });

  await helper.waitForReady();

  stopServers();

  t.pass();
});

test('#helper throws error when resolver not supported', async t => {
  try {
    (new GRPCHelper({
      packageName: 'helloworld',
      serviceName: 'Greeter',
      protoPath: path.resolve(__dirname, './fixtures/hello.proto'),
      sdUri: 'unknown://test',
    }));
  } catch (e) {
    t.is(e.name, 'GRPCHelperError');
    t.is(e.message, 'resolver not implemented: unknown');
  }
});

test('#helper throws error when dns add error', async t => {
  try {
    (new GRPCHelper({
      packageName: 'helloworld',
      serviceName: 'Greeter',
      protoPath: path.resolve(__dirname, './fixtures/hello.proto'),
      sdUri: 'dns://?a=a',
    }));
  } catch (e) {
    t.is(e.name, 'GRPCHelperError');
    t.is(e.message, 'invalid pathname');
  }
});

test('#helper server error', async t => {
  const { servers, stopServers } = startServers(1, { alwaysError: true });
  const list = _.map(servers, s => `localhost:${s.port}`).join(',');

  const helper = new GRPCHelper({
    packageName: 'helloworld',
    serviceName: 'Greeter',
    protoPath: path.resolve(__dirname, './fixtures/hello.proto'),
    sdUri: `static://${list}`,
  });

  await helper.waitForReady();

  try {
    await helper.SayHello();
  } catch (e) {
    t.regex(e.message, /2 UNKNOWN: server_error$/);
  }

  const stream = new PassThrough({ objectMode: true });
  const promise = helper.SayMultiHello(stream);

  stream.write({
    name: 'foo',
  });

  stream.end();

  try {
    await promise;
  } catch (e) {
    t.regex(e.message, /2 UNKNOWN: server_error$/);
  }

  stopServers();
});

test('#helper full response', async t => {
  const { servers, stopServers } = startServers(1);
  const list = _.map(servers, s => `localhost:${s.port}`).join(',');

  const helper = new GRPCHelper({
    packageName: 'helloworld',
    serviceName: 'Greeter',
    protoPath: path.resolve(__dirname, './fixtures/hello.proto'),
    sdUri: `static://${list}`,
    resolveFullResponse: true,
  });

  await helper.waitForReady();

  const md = new grpc.Metadata();
  md.set('key', 'value');
  const { message, peer, status, metadata } = await helper.SayHello({
    name: 'foo',
  }, md);

  t.is(message.message, 'hello foo');
  t.is(peer, list);
  t.is(status.code, grpc.status.OK);
  t.is(metadata.get('key')[0], 'value');

  stopServers();
});

test('#helper client stream full response', async t => {
  const { servers, stopServers } = startServers(1);
  const list = _.map(servers, s => `localhost:${s.port}`).join(',');

  const helper = new GRPCHelper({
    packageName: 'helloworld',
    serviceName: 'Greeter',
    protoPath: path.resolve(__dirname, './fixtures/hello.proto'),
    sdUri: `static://${list}`,
    resolveFullResponse: true,
  });

  await helper.waitForReady();

  const md = new grpc.Metadata();
  md.set('key', 'value');

  const stream = new PassThrough({ objectMode: true });
  const promise = helper.SayMultiHello(stream, md);

  stream.write({
    name: 'foo1',
  });

  stream.write({
    name: 'foo2',
  });

  stream.write({
    name: 'foo3',
  });

  stream.end();

  const { message, peer, status, metadata } = await promise;

  t.is(message.message, 'hello foo1,foo2,foo3');
  t.is(peer, list);
  t.is(status.code, grpc.status.OK);
  t.is(metadata.get('key')[0], 'value');

  stopServers();
});
