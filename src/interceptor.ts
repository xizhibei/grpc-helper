import * as grpc from 'grpc';

export function getGlobalDeadlineInterceptor(deadlineInSecs) {
  return function globalDeadline(options: any, nextCall: any) {
    if (!options.deadline) {
      options.deadline = Date.now() + deadlineInSecs * 1000;
    }
    return new grpc.InterceptingCall(nextCall(options));
  };
}
