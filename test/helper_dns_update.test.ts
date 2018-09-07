import * as path from 'path';
import { SrvRecord } from 'dns';

import test from 'ava';
import * as _ from 'lodash';
import * as mock from 'mock-require';

import { startServer } from './server';

let srvRecords = [];

function addRecords(port) {
  srvRecords.push(<SrvRecord>{
    name: 'localhost',
    port,
    weight: 1,
    priority: 10,
  });
}

mock('dns', {
  resolveSrv(name, cb) {
    return cb(null, srvRecords);
  },
});

import { GRPCHelper } from '../src';

async function assertServers(t, helper, ids) {
  const res = await Promise.map(_.range(6), () => helper.SayHello({name: 'foo'}));

  const serverIds = _.uniq(_.map(res, 'serverId'));
  t.log(serverIds);
  t.deepEqual(serverIds.sort(), ids.sort());
}

async function waitForUpadate (helper, id) {
  // wait for lb updated
  while(true) {
    try {
      const { serverId } = await helper.SayHello({name: 'foo'});
      if (serverId === id) break;
    } catch (e) {
      // ignore
    }
  }
}

test('#dns service discovery with rolling update server', async t => {
  const { port: port1, stopServer: stopServer1 } = startServer(1);
  const { port: port2, stopServer: stopServer2 } = startServer(2);
  const { port: port3, stopServer: stopServer3 } = startServer(3);
  const { port: port4, stopServer: stopServer4 } = startServer(4);
  const { port: port5, stopServer: stopServer5 } = startServer(5);
  const { port: port6, stopServer: stopServer6 } = startServer(6);

  addRecords(port1);
  addRecords(port2);
  addRecords(port3);

  const helper = new GRPCHelper({
    packageName: 'helloworld',
    serviceName: 'Greeter',
    protoPath: path.resolve(__dirname, './hello.proto'),
    sdUri: 'dns://_http._tcp.greeter',
  });

  await helper.waitForReady();

  await assertServers(t, helper, [1, 2, 3]);

  addRecords(port4);
  stopServer1();
  srvRecords.shift();

  await waitForUpadate(helper, 4);
  await assertServers(t, helper, [2, 3, 4]);

  addRecords(port5);
  stopServer2();
  srvRecords.shift();

  await waitForUpadate(helper, 5);
  await assertServers(t, helper, [3, 4, 5]);

  addRecords(port6);
  stopServer3();
  srvRecords.shift();

  await waitForUpadate(helper, 6);
  await assertServers(t, helper, [4, 5, 6]);

  stopServer4();
  stopServer5();
  stopServer6();
});
