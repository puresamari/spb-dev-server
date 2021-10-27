import path from 'path';
import fs from 'fs';
import { Builder, getConfigFromFile } from '@puresamari/spb-core';
import { DevServer } from '../../src';

const configPath = path.resolve(__dirname, './hello-world.config.spb.json');
const config = getConfigFromFile(configPath);

const devServer = new DevServer({ config: configPath }, config, {
  host: process.env.DEBUG_HOST || 'localhost',
  secure: true
});