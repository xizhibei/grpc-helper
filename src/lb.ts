import * as _ from 'lodash';
import * as debug from 'debug';

import { GRPCHelperClient } from './common';
import { Address, Resolver, Watcher, UpdateOp } from './naming';
import { HelperClientCreator } from './client';
import { EventEmitter } from 'events';

const log = debug('grpcHelper:lb');

export interface Balancer {
  start(target: string);
  up(addr: Address): () => void;
  get(): GRPCHelperClient;
  close(): Promise<void>;
  waitForReady(): Promise<void>;
}

export class RoundRobinBalancer extends EventEmitter implements Balancer {
  private next: number = 0;
  private clients: GRPCHelperClient[] = [];
  private resolver: Resolver;
  private watcher: Watcher;
  private clientCreator: HelperClientCreator;
  private isReady: boolean = false;

  constructor(resolver: Resolver, clientCreator: HelperClientCreator) {
    super();

    this.resolver = resolver;
    this.clientCreator = clientCreator;
  }

  public waitForReady(): Promise<void> {
    if (this.isReady) return;
    return new Promise<void>(resolve => {
      this.once('ready', () => resolve());
    });
  }

  private createClient(addr: string): GRPCHelperClient {
    return this.clientCreator.createClientFromAddress(addr);
  }

  private async watchUpdates() {
    log('start watch updates');
    while(true) {
      const updates = await this.watcher.next();
      log('got addrs %j', updates);

      _.each(updates, update => {
        switch(update.op) {
          case UpdateOp.ADD:
          log('add address %s', update.addr);
          this.clients.push(this.createClient(update.addr));
          break;
          case UpdateOp.DEL:
          log('remove address %s', update.addr);
          this.clients = _.reject(this.clients, (client) => client.address === update.addr);
          break;
          default:
            console.error('Error update op', update.op);
        }
      });

      if (!this.isReady) {
        this.isReady = true;
        this.emit('ready');
      }
    }
  }

  public start(target: string) {
    this.watcher = this.resolver.resolve(target);
    this.watchUpdates();
  }

  public up(addr: Address): () => void {
    _.each(this.clients, client => {
      if (client.address === addr.addr) {
        client.connected = true;
      }
    });

    return function down(): void {
      this.down(addr);
    };
  }

  public down(addr: Address): void {
    _.each(this.clients, client => {
      if (client.address === addr.addr) {
        client.connected = false;
      }
    });
  }

  public get(): GRPCHelperClient {
    const availableClients = _.filter(this.clients, client => !client.brake.isOpen() && client.connected);
    if (availableClients.length === 0) throw new Error('no client available');
    return availableClients[this.next++ % availableClients.length];
  }

  public async close(): Promise<void> {
    await this.watcher.close();
  }
}
