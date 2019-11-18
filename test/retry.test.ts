import * as path from 'path';

import test from 'ava';
import * as _ from 'lodash';

import { startServer } from './server';

import { GRPCHelper } from '../src';

test('#retry when error', async t => {
  const { port: port1, stopServer: stopServer1 } = startServer(1, { alwaysError: true });
  const { port: port2, stopServer: stopServer2 } = startServer(2, { alwaysError: true });
  const { port: port3, stopServer: stopServer3 } = startServer(3);

  const list = _.map([port1, port2, port3], port => `localhost:${port}`).join(',');

  t.plan(2);

  const helper = new GRPCHelper({
    packageName: 'helloworld',
    serviceName: 'Greeter',
    protoPath: path.resolve(__dirname, './fixtures/hello.proto'),
    sdUri: `static://${list}`,
    retryOpts: {
      enable: true,
      retries: 5,
      onRetry(e) {
        t.regex(e.message, /2 UNKNOWN: server_error/i);
      },
    },
  });

  await helper.waitForReady();

  await helper.SayHello();

  stopServer1();
  stopServer2();
  stopServer3();
});

test('#retry ignore error', async t => {
  const { port: port1, stopServer: stopServer1 } = startServer(1, { alwaysError: true });
  const { port: port2, stopServer: stopServer2 } = startServer(2, { alwaysError: true });
  const { port: port3, stopServer: stopServer3 } = startServer(3);

  const list = _.map([port1, port2, port3], port => `localhost:${port}`).join(',');

  t.plan(2);

  const helper = new GRPCHelper({
    packageName: 'helloworld',
    serviceName: 'Greeter',
    protoPath: path.resolve(__dirname, './fixtures/hello.proto'),
    sdUri: `static://${list}`,
    retryOpts: {
      enable: true,
      retries: 5,
      bailError(err, attempt) {
        return attempt === 2;
      },
      onRetry(e) {
        t.regex(e.message, /2 UNKNOWN: server_error/i);
      },
    },
  });

  await helper.waitForReady();

  try {
    await helper.SayHello();
  } catch (e) {
    t.regex(e.message, /2 UNKNOWN: server_error/i);
  }

  stopServer1();
  stopServer2();
  stopServer3();
});
