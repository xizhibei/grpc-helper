import * as path from 'path';

import * as grpc from 'grpc';
import * as protoLoader from '@grpc/proto-loader';

const packageDefinition = protoLoader.loadSync(
  path.resolve(__dirname, './hello.proto'),
  {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
  }
);


const hello = grpc.loadPackageDefinition(packageDefinition).helloworld;

export function startServer() {
  const server = new grpc.Server();
  server.addService(hello.Greeter.service, {
    SayHello(call, callback) {
      const name = call.request.name;
      callback(null, {
        message: `hello ${name}`,
      });
    },
  });

  const port = server.bind('0.0.0.0:0', grpc.ServerCredentials.createInsecure());
  server.start();

  function stopServer() {
    server.forceShutdown();
  }

  return { port, stopServer };
}


