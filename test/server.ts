import * as fs from 'fs';
import * as path from 'path';

import * as grpc from 'grpc';
import * as _ from 'lodash';
import * as protoLoader from '@grpc/proto-loader';

const hello = grpc.loadPackageDefinition(protoLoader.loadSync(
  path.resolve(__dirname, './hello.proto'),
  {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
  }
)).helloworld;

const test = grpc.loadPackageDefinition(protoLoader.loadSync(
  path.resolve(__dirname, './test.proto'),
  {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
  }
)).test;

const health = grpc.loadPackageDefinition(protoLoader.loadSync(
  path.resolve(__dirname, '../src/health.proto'),
  {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
  }
)).grpc.health.v1;

export function startServer(id, secure = false, healthCheck = null) {
  const server = new grpc.Server();
  server.addService(hello.Greeter.service, {
    SayHello(call, callback) {
      const { name, error } = call.request;

      if (error) {
        return callback(new Error('server_error'));
      }

      // echo it back
      call.sendMetadata(call.metadata);
      callback(null, {
        message: `hello ${name}`,
        serverId: id,
      });
    },
    SayMultiHello(call, callback) {
      let names = [];
      let error = false;
      call.on('data', data => {
        names.push(data.name);
        if (data.error) {
          error = true;
        }
      });
      call.on('end', () => {
        if (error) {
          return callback(new Error('server_error'));
        }

        // echo it back
        call.sendMetadata(call.metadata);
        callback(null, {
          message: `hello ${names.join(',')}`,
          count: names.length,
          serverId: id,
        });
      });
    },
  });

  const check = healthCheck || function Check(call, callback) {
    const service = call.request.service;
    callback(null, {
      status: 'SERVING',
    });
  };

  server.addService(health.Health.service, {
    Check: check,
  });

  let creds = grpc.ServerCredentials.createInsecure();
  if (secure) {
    creds = grpc.ServerCredentials.createSsl(null, [<grpc.KeyCertPair>{
      private_key: fs.readFileSync(path.resolve(__dirname, './fixtures/server.key')),
      cert_chain: fs.readFileSync(path.resolve(__dirname, './fixtures/server.crt')),
    }]);
  }

  const port = server.bind('localhost:0', creds);
  server.start();

  function stopServer() {
    server.forceShutdown();
  }

  return { port, stopServer };
}

export function startMethoodTestServer() {
  const server = new grpc.Server();
  server.addService(test.TestService.service, {
    unary(call, cb) {
      call.sendMetadata(call.metadata);
      cb(null, {});
    },
    clientStream(stream, cb) {
      stream.on('data', function(data) {});
      stream.on('end', function() {
        stream.sendMetadata(stream.metadata);
        cb(null, {});
      });
    },
    serverStream(stream) {
      stream.sendMetadata(stream.metadata);
      stream.end();
    },
    bidiStream(stream) {
      stream.on('data', function(data) {});
      stream.on('end', function() {
        stream.sendMetadata(stream.metadata);
        stream.end();
      });
    },
  });

  const port = server.bind('localhost:0', grpc.ServerCredentials.createInsecure());
  server.start();

  function stopServer() {
    server.forceShutdown();
  }

  return { port, stopServer };
}

export function startServers(num: number, secure = false) {
  const servers = [];
  _.times(num, i => {
    const { port, stopServer } = startServer(i, secure);
    servers.push({
      id: i,
      port,
      stopServer,
    });
  });

  return {
    servers,
    stopServers() {
      _.each(servers, s => s.stopServer());
    },
  };
}


