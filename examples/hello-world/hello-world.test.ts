import path from 'path';
import fs from 'fs';
import { Builder, getConfigFromFile } from '@puresamari/spb-core';
import { DevServer } from '../../src';

const configPath = path.resolve(__dirname, './hello-world.config.spb.json');
const config = getConfigFromFile(configPath);

// const builder = new Builder(config, path.dirname(configPath));

// builder.build().then(() => console.log('built!!'));

const devServer = new DevServer({ config: configPath }, config);