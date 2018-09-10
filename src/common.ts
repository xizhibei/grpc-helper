import { Client } from 'grpc';
import { Options as NodeRetryOpts } from 'async-retry';

export class GRPCHelperError extends Error {
  name: string = 'GRPCHelperError';
  detail: any;
  constructor(message?: string, detail?: any) {
    super(message);
    this.detail = detail;
  }
}

export interface GRPCHelperSslOpts {
  enable: boolean;
  cacert?: Buffer;
  cert?: Buffer;
  key?: Buffer;
}

export interface GRPCHelperClient {
  address: string;
  weight: number;
  connected: boolean;
  grpcClient: Client;
  brake: any;
  [method: string]: any;
}

export interface GRPCHelperCheck {
  enable: boolean;
  timeoutInMS?: number;
}

export interface GRPCOpts {
  interceptors?: ((...args) => any)[];
  interceptor_providers?: ((...args) => any)[];
  [key: string]: any;
}

/**
 * From https://github.com/awolden/brakes
 */
export interface BrakeOpts {
  /**
   * string to use for name of circuit.
   * This is mostly used for reporting on stats.
   */
  name?: string;

  /**
   * string to use for group of circuit.
   * This is mostly used for reporting on stats.
   */
  group?: string;

  /**
   * time in ms that a specific bucket should remain active
   */
  bucketSpan?: number;

  /**
   * interval in ms that brakes should emit a snapshot event
   */
  statInterval?: number;

  /**
   * array<number> that defines the percentile levels that
   * should be calculated on the stats object
   * (i.e. 0.9 for 90th percentile)
   */
  percentiles?: number[];

  /**
   * # of buckets to retain in a rolling window
   */
  bucketNum?: number;

  /**
   * time in ms that a circuit should remain broken
   */
  circuitDuration?: number;

  /**
   * number of requests to wait before testing circuit health
   */
  waitThreshold?: number;

  /**
   * % threshold for successful calls.
   * If the % of successful calls dips
   * below this threshold the circuit will break
   */
  threshold?: number;

  /**
   * time in ms before a service call will timeout
   */
  timeout?: number;

  /**
   * function that returns true if an error should
   * be considered a failure (receives the error
   * object returned by your command.) This allows
   * for non-critical errors to be ignored
   * by the circuit breaker
   */
  isFailure?: Function;

  /**
   * time in ms interval between each
   * execution of health check function
   */
  healthCheckInterval?: number;

  /**
   * function to call for the health check
   * (can be defined also with calling healthCheck function)
   */
  healthCheck?: Function;

  /**
   * function to call for fallback
   * (can be defined also with calling fallback function)
   */
  fallback?: Function;

  /**
   * boolean to opt out of check for callback in function.
   * This affects the passed in function, health check and fallback
   */
  isPromise?: boolean;

  /**
   * boolean to opt out of check for callback,
   * always promisifying in function.
   * This affects the passed in function,
   * health check and fallback
   */
  isFunction?: boolean;

}

interface RetryOpts extends NodeRetryOpts {
  /**
   * Disabled by default.
   */
  enable: boolean;

  /**
   * Whether ignore some specified errors
   */
  bailError?: (e: Error, attempt: number) => boolean;
}

export interface GRPCHelperOpts {
  /**
   * Service discovery uri
   * static://1.1.1.1:1234,2.2.2.2:1234
   * dns://_grpc._tcp.servicename
   */
  sdUri: string;

  /**
   * Proto file path, absolute
   */
  protoPath: string;

  /**
   * Package name
   */
  packageName: string;

  /**
   * Service name
   */
  serviceName: string;

  /**
   * Should grpc promised call return full response,
   * if true, it will resolve with status, metadata, peer and message
   * default is false, only message will be resolved
   */
  resolveFullResponse?: boolean;

  /**
   * grpc options, used in create new instance of grpc client
   */
  grpcOpts?: GRPCOpts;

  /**
   * grpc ssl options, used in create new instance of grpc client
   */
  sslOpts?: GRPCHelperSslOpts;

  /**
   * hostname override, override the default hostname,
   * by setting following two grpc opts:
   * grpc.ssl_target_name_override
   * grpc.default_authority
   */
  hostNameOverride?: string;

  /**
   * Global timeout is million seconds
   * If set to 0, timeout is disabled
   */
  timeoutInMS?: number;

  /**
   * Brake opts, passing to the Brakes
   */
  brakeOpts?: BrakeOpts;

  /**
   * Grpc health check func, used in Brakes
   */
  healthCheck?: GRPCHelperCheck;

  /**
   * Whether enable prometheus metrics
   *   name: grpc_response_duration_seconds
   *   type: histogram
   *   labels: peer,method,code
   *
   * Default: true
   */
  metrics?: boolean;

  /**
   * Retry options for [async-retry](https://github.com/zeit/async-retry) when error,
   * options is actually based on [node-retry](https://github.com/tim-kos/node-retry)
   */
  retryOpts?: RetryOpts;
}

