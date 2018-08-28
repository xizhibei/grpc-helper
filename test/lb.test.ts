import test from 'ava';
import * as Brakes from 'brakes';
import * as _ from 'lodash';

import { StaticResolver } from '../src/naming';
import { RoundRobinBalancer } from '../src/lb';
import { GRPCHelperClient } from '../src/common';

test('#lb with StaticResolver', async t => {
  const resolver = new StaticResolver();
  const lb = new RoundRobinBalancer(resolver, (addr: string) => {
    return <GRPCHelperClient>{
      address: addr,
      connected: true,
      brake: new Brakes(),
    };
  });

  const addrs = ['localhost:1111', 'localhost:2222', 'localhost:3333'];
  lb.start(addrs.join(','));

  await lb.waitForReady();

  const resAddrs1 = _.uniq(_.map(_.times(6, () => lb.get()), 'address'));
  t.log(resAddrs1);
  t.deepEqual(resAddrs1.sort(), addrs);

  lb.down('localhost:1111');
  const resAddrs2 = _.uniq(_.map(_.times(6, () => lb.get()), 'address'));
  t.log(resAddrs2);
  t.deepEqual(resAddrs2.sort(), _.without(addrs, 'localhost:1111'));

  const down = lb.up('localhost:1111');
  const resAddrs3 = _.uniq(_.map(_.times(6, () => lb.get()), 'address'));
  t.log(resAddrs3);
  t.deepEqual(resAddrs3.sort(), addrs);

  down();
  const resAddrs4 = _.uniq(_.map(_.times(6, () => lb.get()), 'address'));
  t.log(resAddrs4);
  t.deepEqual(resAddrs4.sort(), _.without(addrs, 'localhost:1111'));

  lb.close();
});
