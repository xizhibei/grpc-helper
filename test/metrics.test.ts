import * as path from 'path';

import test from 'ava';
import * as _ from 'lodash';

import { startServers } from './server';

import { GRPCHelper, promRegister } from '../src';

test('#metrics', async t => {
  const { servers, stopServers } = startServers(1);
  const list = _.map(servers, s => `localhost:${s.port}`).join(',');

  const helper = new GRPCHelper({
    packageName: 'helloworld',
    serviceName: 'Greeter',
    protoPath: path.resolve(__dirname, './fixtures/hello.proto'),
    sdUri: `static://${list}`,
  });

  await helper.waitForReady();

  await helper.SayHello({
    name: 'foo',
  });

  stopServers();

  const method = '/helloworld.Greeter/SayHello';
  const regs = [
    /^# HELP grpc_response_duration_seconds Histogram of grpc response in seconds$/,
    /^# TYPE grpc_response_duration_seconds histogram$/,
    new RegExp(`^grpc_response_duration_seconds_bucket{le="0.005",peer="${list}",method="${method}",code="0"} \\d$`),
    new RegExp(`^grpc_response_duration_seconds_bucket{le="0.01",peer="${list}",method="${method}",code="0"} \\d$`),
    new RegExp(`^grpc_response_duration_seconds_bucket{le="0.025",peer="${list}",method="${method}",code="0"} \\d$`),
    new RegExp(`^grpc_response_duration_seconds_bucket{le="0.05",peer="${list}",method="${method}",code="0"} \\d$`),
    new RegExp(`^grpc_response_duration_seconds_bucket{le="0.1",peer="${list}",method="${method}",code="0"} \\d$`),
    new RegExp(`^grpc_response_duration_seconds_bucket{le="0.25",peer="${list}",method="${method}",code="0"} \\d$`),
    new RegExp(`^grpc_response_duration_seconds_bucket{le="0.5",peer="${list}",method="${method}",code="0"} \\d$`),
    new RegExp(`^grpc_response_duration_seconds_bucket{le="1",peer="${list}",method="${method}",code="0"} \\d$`),
    new RegExp(`^grpc_response_duration_seconds_bucket{le="2.5",peer="${list}",method="${method}",code="0"} \\d$`),
    new RegExp(`^grpc_response_duration_seconds_bucket{le="5",peer="${list}",method="${method}",code="0"} \\d$`),
    new RegExp(`^grpc_response_duration_seconds_bucket{le="10",peer="${list}",method="${method}",code="0"} \\d$`),
    new RegExp(`^grpc_response_duration_seconds_bucket{le="\\+Inf",peer="${list}",method="${method}",code="0"} \\d$`),
    new RegExp(`^grpc_response_duration_seconds_sum{peer="${list}",method="${method}",code="0"} 0\\.\\d+$`),
    new RegExp(`^grpc_response_duration_seconds_count{peer="${list}",method="${method}",code="0"} \\d$`),
  ];
  const metrics = promRegister.metrics().split('\n');
  _.each(regs, (r, i) => t.regex(metrics[i], r));
});
