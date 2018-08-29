# GRPC helper

**WARNING: in beta !!!**

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

- Promised unary call
- Load balancer
- Service health checking
- Service discovery (static, dns srv)
- Circuit breaker

### Usage

#### DNS Service discovery
```ts
const helper = new GRPCHelper({
  packageName: 'helloworld',
  serviceName: 'Greeter',
  protoPath: path.resolve(__dirname, './hello.proto'),
  sdUri: 'dns://_http._tcp.greeter',
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
  protoPath: path.resolve(__dirname, './hello.proto'),
  sdUri: 'static://localhost:50051,localhost:50052,localhost:50053',
});

await helper.waitForReady();

const res = await helper.SayHello({
  name: 'foo',
});
```

### TODO
- Better api
- Doc
- Test code
- Consul/etcd/zk service discovery


### License
This project is licensed under the MIT License - see the LICENSE file for details
