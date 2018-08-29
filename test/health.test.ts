import test from 'ava';
import * as _ from 'lodash';
import * as grpc from 'grpc';

import { startServer } from './server';
import { getBrakeHealthCheckFunc } from '../src/health';

test('#health check', async t => {
  const { port, stopServer } = startServer(0);
  const healthCheck = getBrakeHealthCheckFunc('test', `localhost:${port}`, {
    timeoutInMS: 5000,
    grpcCredentials: grpc.credentials.createInsecure(),
    grpcOpts: {},
  });

  await healthCheck();

  t.pass();

  stopServer();
});

test('#health check, unhealth', async t => {
  const { port, stopServer } = startServer(0, false, function Check(call, callback) {
    const service = call.request.service;
    callback(null, {
      status: 'NOT_SERVING',
    });
  });
  const healthCheck = getBrakeHealthCheckFunc('test', `localhost:${port}`, {
    timeoutInMS: 5000,
    grpcCredentials: grpc.credentials.createInsecure(),
    grpcOpts: {},
  });

  try {
    await healthCheck();
  } catch(e) {
    t.is(e.message, 'health check fail');
  }

  stopServer();
});

test('#health check, error', async t => {
  const { port, stopServer } = startServer(0, false, function Check(call, callback) {
    callback(new Error('test'));
  });
  const healthCheck = getBrakeHealthCheckFunc('test', `localhost:${port}`, {
    timeoutInMS: 5000,
    grpcCredentials: grpc.credentials.createInsecure(),
    grpcOpts: {},
  });

  try {
    await healthCheck();
  } catch(e) {
    t.is(e.message, '2 UNKNOWN: test');
  }

  stopServer();
});

test('#health check, timeout', async t => {
  const { port, stopServer } = startServer(0, false, function Check(call, callback) {
    setTimeout(() => {
      callback(null, {
        status: 'SERVING',
      });
    }, 1000);
  });
  const healthCheck = getBrakeHealthCheckFunc('test', `localhost:${port}`, {
    timeoutInMS: 100,
    grpcCredentials: grpc.credentials.createInsecure(),
    grpcOpts: {},
  });

  try {
    await healthCheck();
  } catch(e) {
    t.is(e.message, '4 DEADLINE_EXCEEDED: Deadline Exceeded');
  }

  stopServer();
});
