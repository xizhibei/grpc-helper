import * as path from 'path';

import test from 'ava';
import * as _ from 'lodash';
import * as grpc from 'grpc';

import { startServer, startMethoodTestServer } from './server';
import { getBrakeHealthCheckFunc } from '../src/health';
import { GRPCHelper } from '../src';

test.beforeEach(async t => {
  const { port, stopServer } = startMethoodTestServer();
  t.context.port = port;
  t.context.stopServer = stopServer;

  t.context.metadata = new grpc.Metadata();
  t.context.metadata.set('key', 'value');
});

test.afterEach.always(async t => {
  t.context.stopServer();
});

test.cb('#test service unary', t => {
  const helper = new GRPCHelper({
    packageName: 'test',
    serviceName: 'TestService',
    protoPath: path.resolve(__dirname, './test.proto'),
    sdUri: `static://localhost:${t.context.port}`,
  });

  helper.waitForReady()
    .then(() => {
      const call = helper.cbUnary({}, t.context.metadata, function (err, data) {
        t.ifError(err);
      });
      call.on('metadata', function (metadata) {
        t.deepEqual(metadata.get('key'), ['value']);
        t.end();
      });
    })
    .catch(t.end);
});

test.cb('#test service clientStream', t => {
  const helper = new GRPCHelper({
    packageName: 'test',
    serviceName: 'TestService',
    protoPath: path.resolve(__dirname, './test.proto'),
    sdUri: `static://localhost:${t.context.port}`,
  });

  helper.waitForReady()
    .then(() => {
      const call = helper.ClientStream(t.context.metadata, function(err, data) {
        t.ifError(err);
      });
      call.on('metadata', function(metadata) {
        t.deepEqual(metadata.get('key'), ['value']);
        t.end();
      });
      call.end();
    })
    .catch(t.end);
});

test.cb('#test service serverStream', t => {
  const helper = new GRPCHelper({
    packageName: 'test',
    serviceName: 'TestService',
    protoPath: path.resolve(__dirname, './test.proto'),
    sdUri: `static://localhost:${t.context.port}`,
  });

  helper.waitForReady()
    .then(() => {
      const call = helper.ServerStream({}, t.context.metadata);
      call.on('data', function() {});
      call.on('metadata', function(metadata) {
        t.deepEqual(metadata.get('key'), ['value']);
        t.end();
      });
    })
    .catch(t.end);
});

test.cb('#test service bidiStream', t => {
  const helper = new GRPCHelper({
    packageName: 'test',
    serviceName: 'TestService',
    protoPath: path.resolve(__dirname, './test.proto'),
    sdUri: `static://localhost:${t.context.port}`,
  });

  helper.waitForReady()
    .then(() => {
      const call = helper.BidiStream(t.context.metadata);
      call.on('data', function() {});
      call.on('metadata', function(metadata) {
        t.deepEqual(metadata.get('key'), ['value']);
        t.end();
      });
      call.end();
    })
    .catch(t.end);
});
