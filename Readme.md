# gRPC helper

gRPC helper is an improved gRPC client with lots of helpful features.

[![Build Status](https://travis-ci.org/xizhibei/grpc-helper.svg?branch=master&style=flat)](https://travis-ci.org/xizhibei/grpc-helper)
[![Coverage Status](https://coveralls.io/repos/github/xizhibei/grpc-helper/badge.svg?branch=master)](https://coveralls.io/github/xizhibei/grpc-helper?branch=master)
[![npm version](https://badge.fury.io/js/grpc-helper.svg?style=flat)](http://badge.fury.io/js/grpc-helper)
[![Dependency Status](https://img.shields.io/david/xizhibei/grpc-helper.svg?style=flat)](https://david-dm.org/xizhibei/grpc-helper)
[![npm](https://img.shields.io/npm/l/grpc-helper.svg)](https://github.com/xizhibei/grpc-helper/blob/master/LICENSE)

### Getting Started

### Installing

```bash
npm i grpc-helper --save
```

or

```bash
yarn add grpc-helper
```

### Features

- Promised unary & client stream call
- Client Load balance
- Service health checking
- Service discovery (static, dns srv)
- Circuit breaker based on [Brakes](https://github.com/awolden/brakes)
- Retry based on [async-retry](https://github.com/zeit/async-retry)
- Metrics for [prometheus](https://prometheus.io/) based on [prom-client](https://github.com/siimon/prom-client)
- Highly custom [options](src/common.ts)

### Usage

#### DNS Service discovery
```ts
const helper = new GRPCHelper({
  packageName: 'helloworld',
  serviceName: 'Greeter',
  protoPath: path.resolve(__dirname, './fixtures/hello.proto'),
  // intervalMs will determine how frequent the resolver lookup the records
  sdUri: 'dns://_grpc._tcp.greeter?intervalMs=5000',
});

await helper.waitForReady();

const res = await helper.SayHello({
  name: 'foo',
});
```

#### Static Service discovery
```ts
const helper = new GRPCHelper({
  packageName: 'helloworld',
  serviceName: 'Greeter',
  protoPath: path.resolve(__dirname, './fixtures/hello.proto'),
  sdUri: 'static://localhost:50051,localhost:50052,localhost:50053',
});

await helper.waitForReady();

const res = await helper.SayHello({
  name: 'foo',
});
```

#### Resolve with full response
```ts
const helper = new GRPCHelper({
  packageName: 'helloworld',
  serviceName: 'Greeter',
  protoPath: path.resolve(__dirname, './fixtures/hello.proto'),
  sdUri: 'static://localhost:50051',
  resolveFullResponse: true,
});

await helper.waitForReady();

const { message, peer, status, metadata } = await helper.SayHello({
  name: 'foo',
});
```


#### Client stream call
```ts
const stream = new stream.PassThrough({ objectMode: true });

const promise = helper.SayMultiHello(stream);

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

const result = await promise; // { message: 'hello foo1,foo2,foo3' }
```

#### Retry
```ts
const helper = new GRPCHelper({
  packageName: 'helloworld',
  serviceName: 'Greeter',
  protoPath: path.resolve(__dirname, './fixtures/hello.proto'),
  sdUri: 'static://localhost:50051',
  retryOpts: {
    enable: true,
    retries: 5,
    bailError(err, attempt) {
      // Just for example !!! It will not retry when code is 2
      return err.code === 2;
    },
  },
});

await helper.waitForReady();

await helper.SayHello({
  name: 'foo',
});
```


#### More

Please take a look at the [test](test/) folder for more examples.

### TODO

- [x] Better api
- [x] Doc
- [x] Test code
- [x] Retry on lb level when error
- [ ] Auto load proto when only one service available
- [ ] Consul/etcd/zk service discovery


### License
This project is licensed under the MIT License - see the LICENSE file for details
