import * as promClient from 'prom-client';

const histogram = new promClient.Histogram({
  name: 'grpc_response_duration_seconds',
  help: 'Histogram of grpc response in seconds',
  labelNames: ['pkg', 'svc', 'peer', 'method', 'state'],
});

export function wrapWithMetrics(func: (...args) => (any), pkg: string, svc: string, peer: string, method: string) {
  return async function(...args) {
    const endTimer = histogram.startTimer({
      pkg,
      svc,
      peer,
      method,
    });

    try {
      const rst = await func(...args);
      endTimer({
        state: 'success',
      });
      return rst;
    } catch (e) {
      endTimer({
        state: 'fail',
      });
      throw e;
    }
  };
}
