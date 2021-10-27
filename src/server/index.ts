import { IBuilderOptions } from '@puresamari/spb-core';
import { CompilerResult } from '@puresamari/spb-core/lib/builders/compilers/definitions';
import { ExportType } from '@puresamari/spb-core/lib/builders/utils';
import fs from 'fs';
import { OutgoingHttpHeaders } from 'http';
import path from 'path';
import pug from 'pug';
import { from, Observable, of, Subscription } from 'rxjs';
import { filter, map, tap } from 'rxjs/operators';
import WebSocket from 'ws';

import { IDynamicCompilerResult } from '../compilation-map';
import { IDevServerOptions } from './../definitions';
import { FilesMap } from './files-map';
import { GenerateWebServer, WebServer } from './utils';

export class Server {

  private readonly templates = {
    reload: pug.compile(fs.readFileSync(path.resolve(__dirname, 'templates/reload.pug'), 'utf-8')),
    status: pug.compile(fs.readFileSync(path.resolve(__dirname, 'templates/status.pug'), 'utf-8')),
    404: pug.compile(fs.readFileSync(path.resolve(__dirname, 'templates/404.pug'), 'utf-8')),
  }

  private webserver?: WebServer;

  private filesSub?: Subscription;
  private statusSub?: Subscription;

  public get ServerURL() { return `http${this.devServerOptions.secure ? 's' : ''}://${this.devServerOptions.host}:${this.devServerOptions.port}`; }

  private files?: FilesMap;

  public processFile({ output, ...v }: CompilerResult): CompilerResult {

    if (v.type === 'html') {
      output += this.templates.reload({ websocketUrl: this.webSocketURL });
    }

    return { ...v, output };
  }

  public getHeaders(type: ExportType): OutgoingHttpHeaders | undefined {
    switch (type) {
      case 'svg':
        return { 'content-type': 'image/svg+xml' };
      case 'png':
      case 'jpg':
        return { 'content-type': 'image/' + type };
      default:
        return undefined;
    }
  }

  constructor(
    public readonly options: IBuilderOptions,
    readonly filesObservable: Observable<Map<string, IDynamicCompilerResult>>,
    public readonly devServerOptions: IDevServerOptions,
    private readonly webSocketURL: string
  ) {
    this.launch();

    this.filesSub = filesObservable.subscribe(v => {
      this.files = FilesMap.fromDynamic(v);
    });

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
    
  }

  async launch() {
    this.webserver = await GenerateWebServer(this.devServerOptions, (req, res) => {
      if (req.url === '/spb-status') {
        res.end(this.templates.status({
          url: req.url,
          files: [...this.files?.keys() || []].map(v => [v, this.files?.get(v)]),
          websocketUrl: this.webSocketURL
        }));
        return;
      }

      if (!this.files?.has(req.url?.slice(1))) {
        res.writeHead(404);
        res.end(this.templates[404]({
          url: req.url,
          requested_file: (req.url || '/unknown').slice(1) || 'unknown',
          files: [...this.files?.keys() || []]
        }));
        return;
      }

      const requestedFile = this.files?.resolve(req.url?.slice(1))!;

      res.writeHead(200, this.getHeaders(requestedFile.type));
      res.end(requestedFile.output);
    });
  }

  private sockets = new Map<string, WebSocket>();

  private async send(message: string) {
    [...this.sockets.values()].forEach(socket => socket.send(message));
  }


  public async destroy() {

    this.filesSub?.unsubscribe();
    this.statusSub?.unsubscribe();

    if (!this.webserver) { return of(); }

    return from(new Promise<void>(resolve => this.webserver?.close(() => resolve()))).pipe();
  }
}