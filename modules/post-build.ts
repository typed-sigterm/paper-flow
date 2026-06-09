import { cp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defineNuxtModule } from '@nuxt/kit';
import { version } from '../package.json';

function transformManifest(original: Record<string, unknown>) {
  return {
    ...original,
    name: 'paper-flow-cli',
    version,
    type: 'module',
    private: false,
    author: 'Typed SIGTERM',
    license: 'MIT',
    bin: 'server/index.mjs',
    repository: {
      type: 'git',
      url: 'git+https://github.com/typed-sigterm/paper-flow.git',
    },
    engines: {
      node: '24',
    },
    publishConfig: {
      provenance: true,
    },
  };
}

const copiedFiles = ['LICENSE', 'README.md', 'migrations'];
const npmignore = ['node_modules'];

export default defineNuxtModule({
  hooks: {
    async close(nuxt) {
      if (nuxt.options.dev || nuxt.options._prepare)
        return;

      const serverPkgPath = join(import.meta.dirname, '../.output/server/package.json');
      const outputPkgPath = join(import.meta.dirname, '../.output/package.json');
      const original = JSON.parse(await readFile(serverPkgPath, 'utf-8'));
      const transformed = transformManifest(original);
      await rm(serverPkgPath);
      await writeFile(outputPkgPath, `${JSON.stringify(transformed, null, 2)}\n`);

      await Promise.all(copiedFiles.map((f) => {
        const src = join(import.meta.dirname, '../', f);
        const dest = join(import.meta.dirname, '../.output/', f);
        return cp(src, dest, { recursive: true });
      }));

      await writeFile(join(import.meta.dirname, '../.output/.npmignore'), npmignore.join('\n'));
    },
  },
});
