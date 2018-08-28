import * as path from 'path';

import * as _ from 'lodash';
import * as Bluebird from 'bluebird';
import * as grpc from 'grpc';
import * as protoLoader from '@grpc/proto-loader';
import * as debug from 'debug';

import { GRPCHelperError, GRPCOpts } from './common';

const log = debug('grpcHelper:health');

Promise = Bluebird as any;

export interface GetHealthCheckOpts {
  timeoutInMS: number;
  grpcCredentials: grpc.ChannelCredentials;
  grpcOpts: GRPCOpts;
}

export function getBrakeHealthCheckFunc(service: string, host: string, opts: GetHealthCheckOpts): () => void {
  const protoPath = path.resolve(__dirname, './health.proto');

  log('get health check func for %s %s', service, host);

  const packageDefinition = protoLoader.loadSync(
    protoPath,
    {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true
    }
  );

  const HealthService = grpc.loadPackageDefinition(packageDefinition).grpc.health.v1.Health;

  let healthClient = new HealthService(host, opts.grpcCredentials, opts.grpcOpts);
  healthClient = Promise.promisifyAll(healthClient);

  return async function healthCheck() {
    let rst;
    try {
      const deadline = new Date(Date.now() + opts.timeoutInMS);

      rst = await healthClient.checkAsync({ service }, { deadline });

      log('health check success: %j', JSON.stringify(rst));

      if (rst.status === 'SERVING') return;
    } catch (e) {
      log('health check fail %j', e);
      throw e;
    }

    throw new GRPCHelperError('health check fail', rst);
  };
}
