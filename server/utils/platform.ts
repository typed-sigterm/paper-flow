import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { file } from 'empathic/find';
import { version } from '~~/package.json';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const root = dirname(file('package.json', { cwd: __dirname })!);
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
if (!import.meta.dev && (pkg.name !== 'paper-flow-cli' || pkg.version !== version))
  throw new Error('Cannot retrieve package root directory');

export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
