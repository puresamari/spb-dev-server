import { IBuilderOptions } from '@puresamari/spb-core';
import { CompilerResult } from '@puresamari/spb-core/lib/builders/compilers/definitions';
import { ExportType } from '@puresamari/spb-core/lib/builders/utils';
import chalk from 'chalk';
import fs from 'fs';
import http, { OutgoingHttpHeaders } from 'http';
import https from 'https';
import path from 'path';
import pug from 'pug';
import { from, Observable, of, Subscription } from 'rxjs';
import { filter, map, tap } from 'rxjs/operators';
import WebSocket from 'ws';

import { IDynamicCompilerResult } from './compilation-map';

export interface IDevServerOptions {
  secure: boolean;
  host: string;
  port: number;
  socketPort: number;
}

const log = console.log;

export class Socket {

  private websocket?: WebSocket.Server;

  private statusSub?: Subscription;

  public get WebSocketURL() { return `ws${this.devServerOptions.secure ? 's' : ''}://${this.devServerOptions.host}:${this.devServerOptions.socketPort}`; }

  constructor(
    private readonly options: IBuilderOptions,
    readonly filesObservable: Observable<Map<string, IDynamicCompilerResult>>,
    private readonly devServerOptions: IDevServerOptions
  ) {

    let statusBefore: 'compiling' | 'reload' | null = null;
    this.statusSub = filesObservable.pipe(
      map(v => [...v.values()].find(e => e.compilationStatus === 0) ? 'compiling' : 'reload'),
      filter(v => v !== statusBefore),
      tap(v => statusBefore = v),
      filter(v => !!v),
    ).subscribe(v => {
      if (v) {
        this.send(v);
      }
    });

    this.websocket = new WebSocket.Server({ port: this.devServerOptions.socketPort, host: this.devServerOptions.host });

    let index = 0;
    this.websocket.on('connection', (ws) => {
      index += 1;
      this.sockets.set('' + index, ws);
      ws.on('close', () => {
        this.sockets.delete('' + index);
      });
    });

  }

  private sockets = new Map<string, WebSocket>();

  private async send(message: string) {
    [...this.sockets.values()].forEach(socket => socket.send(message));
  }

  public async destroy() {

    this.statusSub?.unsubscribe();

    if (!this.websocket) { return of(); }

    return from(new Promise<void>(resolve => this.websocket!.close(() => resolve()))).pipe();
  }
}