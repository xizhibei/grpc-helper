import * as grpc from 'grpc';

export function getDeadlineInterceptor(timeoutInMS) {
  return function globalDeadline(options: any, nextCall: any) {
    if (!options.deadline) {
      options.deadline = Date.now() + timeoutInMS;
    }
    return new grpc.InterceptingCall(nextCall(options));
  };
}
