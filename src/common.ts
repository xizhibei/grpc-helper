import * as grpc from 'grpc';

export class GRPCHelperError extends Error {
  detail: any;
  constructor(message?: string, detail?: any) {
    super(message);
    this.detail = detail;
  }
}

export interface GRPCHelperSslOpts {
  enable: boolean;
  cacert: string;
  cert: string;
  key: string;
}

export interface GRPCHelperClient {
  address: string;
  weight: number;
  connected: boolean;
  grpcClient: grpc.Client;
  brake: any;
  [method: string]: any;
}

export interface GRPCHelperCheck {
  enable: boolean;
  timeoutInMillSec: number;
  protoPath: string;
  serviceName: string;
  packageName: string;
}

export interface GRPCOpts {
  interceptors?: ((...args) => any)[];
  interceptor_providers?: ((...args) => any)[];
  [key: string]: any;
}

export interface GRPCHelperOpts {
  /**
   * Service discovery uri
   * static://1.1.1.1:1234,2.2.2.2:1234
   * dns://_grpc._tcp.servicename
   */
  sdUri: string;
  protoPath: string;
  packageName: string;
  serviceName: string;
  grpcOpts?: GRPCOpts;
  sslOpts?: GRPCHelperSslOpts;
  hostNameOverride?: string;
  timeoutInMillSec?: number;
  brakeOpts?: object;
  healthCheck?: GRPCHelperCheck;
}

