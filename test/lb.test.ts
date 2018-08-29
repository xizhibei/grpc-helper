import test from 'ava';
import * as Brakes from 'brakes';
import * as _ from 'lodash';

import { StaticResolver } from '../src/naming';
import { RoundRobinBalancer } from '../src/lb';
import { GRPCHelperClient } from '../src/common';

async function testlb(t, lb, addrs) {
  const resAddrs = _.uniq(_.map(_.times(6, () => lb.get()), 'address'));
  t.log(resAddrs);
  t.deepEqual(resAddrs.sort(), addrs);
}

test('#lb with static resolver', async t => {
  const resolver = new StaticResolver();
  const lb = new RoundRobinBalancer(resolver, (addr: string) => {
    return <GRPCHelperClient>{
      address: addr,
      connected: true,
      brake: new Brakes(),
    };
  });

  lb.start(['localhost:1111', 'localhost:2222', 'localhost:3333'].join(','));

  await lb.waitForReady();

  testlb(t, lb, ['localhost:1111', 'localhost:2222', 'localhost:3333']);

  lb.down('localhost:1111');
  testlb(t, lb, ['localhost:2222', 'localhost:3333']);

  const down = lb.up('localhost:1111');
  testlb(t, lb, ['localhost:1111', 'localhost:2222', 'localhost:3333']);

  down();
  testlb(t, lb, ['localhost:2222', 'localhost:3333']);

  lb.close();
});

test('#lb no client available', async t => {
  const resolver = new StaticResolver();
  const lb = new RoundRobinBalancer(resolver, (addr: string) => {
    return <GRPCHelperClient>{
      address: addr,
      connected: true,
      brake: new Brakes(),
    };
  });

  lb.start('');

  try {
    lb.get();
  } catch (e) {
    t.is(e.message, 'no client available');
  }

  lb.close();
});
