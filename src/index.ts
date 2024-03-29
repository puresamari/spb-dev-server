import { Builder, IBuilderOptions, IMainProcessOptions, resolveFilePathOnBase } from '@puresamari/spb-core';
import { ExportType } from '@puresamari/spb-core/lib/builders/utils';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { Subscription } from 'rxjs';

import { CompilationMap, CompilationStatus } from './compilation-map';
import { IDevServerOptions } from './definitions';
import { Server } from './server';
import { Socket } from './socket';

// TODO: Remove chalk, should be used in the cli exclusively
const log = console.log;

export class DevServer {
  private readonly builder: Builder;
  public readonly server?: Server;
  public readonly socket?: Socket;

  private watcherSub?: Subscription;

  private watchers: fs.FSWatcher[] = [];

  private readonly files: CompilationMap;

  public readonly devServerOptions: IDevServerOptions;

  constructor(
    process: IMainProcessOptions,
    public readonly options: IBuilderOptions,
    {
      host = 'localhost',
      port = 5678,
      socketPort = 5679,
      secure = false
    }: Partial<IDevServerOptions> = {}
  ) {
    this.devServerOptions = {
      secure,
      host,
      port,
      socketPort,
    };

    const dir = path.dirname(resolveFilePathOnBase(process.config));
    const output = path.join(dir, options.root || '');
    this.builder = new Builder(
      {
        ...options,
        output // For the dev server only root output is required
      },
      dir
    );

    // throw this.builder.builderContext.options.output;

    this.files = new CompilationMap(options);

    this.socket = new Socket(options, this.Files, this.devServerOptions);
    this.server = new Server(options, this.Files, this.devServerOptions, this.socket.WebSocketURL);
    
    this.start();
  }

  public get Files() {
    return this.files.asObservable();
  }

  private getRelativeSourceFileName(file: string) {
    return path.relative(this.builder.basePath, file);
  }

  private async compileFile(file: string) {
    const exportPath = this.builder.getExportPathOfFile(file);
    if (!exportPath) {
      return;
    }
    const eFile = path.relative(this.builder.options.output, exportPath);

    this.files.changeFile(eFile);

    const result = (
      await this.builder.compile(
        async (localFile: {
          path: string;
          type: ExportType;
          affectedFiles: string[];
        }) =>
          new Promise<void>((resolve) => {
            console.log(chalk.green("compiled", this.getRelativeSourceFileName(file), '->', this.getRelativeSourceFileName(exportPath)));
            resolve();
          }),
        [file]
      )
    )[0];

    const fileOutput = this.files.getValue().get(eFile);
    if (fileOutput) {
      this.files.patchFile(eFile, {
        ...fileOutput,
        output: this.server?.processFile(result).output || result.output,
        compilationStatus: CompilationStatus.Compiled,
        changeAmount: fileOutput.changeAmount,
      });
    } else {
      this.files.patchFile(eFile, {
        ...result,
        output: this.server?.processFile(result).output || result.output,
        compilationStatus: CompilationStatus.Compiled,
        changeAmount: 1,
      });
    }
  }

  private async start() {
    this.watcherSub = this.builder.ContextFiles.subscribe(
      async (contextFiles) => {
        this.watchers.forEach((watcher) => {
          watcher.close();
        });

        await contextFiles.forEach(async (context) => {
          [...context.files].forEach((file) => {
            try {
              this.watchers.push(
                fs.watch(file, (curr: any, prev: any) => {
                  this.compileFile(context.source);
                })
              );
            } catch (e) {
              console.log("FILE", file);
              console.log(e);
            }
          });
          await this.compileFile(context.source);
        });
      }
    );

    log(`
Starded development servers 
  http: ${chalk.blue(this.server?.ServerURL)}
  ws:   ${chalk.blue(this.socket?.WebSocketURL)}
  home: ${chalk.blue(this.server?.ServerURL + '/spb-status')}
`);
  }

  public async destroy() {
    this.watcherSub?.unsubscribe();
    this.server?.destroy();
    this.socket?.destroy();
  }
}

export { IDevServerOptions };