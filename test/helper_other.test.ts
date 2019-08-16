import * as path from 'path';

import anyTest, {TestInterface} from 'ava';
import * as _ from 'lodash';
import * as grpc from 'grpc';

import { startMethoodTestServer } from './server';
import { GRPCHelper } from '../src';

interface Context {
  port: number;
  stopServer: any;
  helper: GRPCHelper;
  metadata: grpc.Metadata;
}

const test = anyTest as TestInterface<Context>;

test.beforeEach(async t => {
  const { port, stopServer } = startMethoodTestServer();
  t.context.port = port;
  t.context.stopServer = stopServer;

  t.context.metadata = new grpc.Metadata();
  t.context.metadata.set('key', 'value');

  const helper = new GRPCHelper({
    packageName: 'test',
    serviceName: 'TestService',
    protoPath: path.resolve(__dirname, './test.proto'),
    sdUri: `static://localhost:${port}`,
  });

  await helper.waitForReady();

  t.context.helper = helper;
});

test.afterEach.always(async t => {
  t.context.stopServer();
});

test.cb('#test service unary', t => {
  const call = t.context.helper.cbUnary({}, t.context.metadata, function (err, data) {
    t.falsy(err);
  });
  call.on('metadata', function (metadata) {
    t.deepEqual(metadata.get('key'), ['value']);
    t.end();
  });
});

test.cb('#test service clientStream', t => {
  const call = t.context.helper.cbClientStream(t.context.metadata, function (err, data) {
    t.falsy(err);
  });
  call.on('metadata', function (metadata) {
    t.deepEqual(metadata.get('key'), ['value']);
    t.end();
  });
  call.end();
});

test.cb('#test service serverStream', t => {
  const call = t.context.helper.ServerStream({}, t.context.metadata);
  call.on('data', function () { });
  call.on('metadata', function (metadata) {
    t.deepEqual(metadata.get('key'), ['value']);
    t.end();
  });
});

test.cb('#test service bidiStream', t => {
  const call = t.context.helper.BidiStream(t.context.metadata);
  call.on('data', function () { });
  call.on('metadata', function (metadata) {
    t.deepEqual(metadata.get('key'), ['value']);
    t.end();
  });
  call.end();
});
