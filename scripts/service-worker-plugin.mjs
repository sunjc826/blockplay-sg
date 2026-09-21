// Emits `dist/sw.js` after the app build.
//
// The worker is bundled separately rather than being part of the app graph for
// two reasons: it must land at the site root under a stable name (a worker only
// controls its own directory and below, and the browser compares the bytes of
// the same URL to detect an update), and it must not be a module or carry
// Vite's modulepreload helpers. Building it here — after the app bundle exists
// — is also what lets it precache the hashed filenames of that build.
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { publicShellFiles, shellPaths, versionOf } from './service-worker-manifest.mjs';

export default function serviceWorkerPlugin() {
  let outDir = 'dist', root = process.cwd(), publicDir, shell = [];
  return {
    name: 'blockplay-service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir; root = config.root; publicDir = config.publicDir;
    },
    // Ordered last: Vite's HTML plugin adds index.html during this same hook,
    // and the shell is not the shell without it.
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        shell = shellPaths(Object.keys(bundle), publicShellFiles(new URL(`file://${publicDir}/`)));
        if (!shell.includes('/index.html')) this.error('service worker: the build emitted no index.html to use as the app shell');
      },
    },
    async closeBundle() {
      if (!shell.length) return; // Nothing was emitted: leave any previous sw.js alone.
      const version = versionOf(shell);
      await build({
        configFile: false, root, logLevel: 'warn',
        define: { __PRECACHE__: JSON.stringify(shell), __VERSION__: JSON.stringify(version) },
        build: {
          outDir, emptyOutDir: false, copyPublicDir: false, target: 'es2020', minify: true,
          rollupOptions: {
            input: fileURLToPath(new URL('../src/sw/service-worker.ts', import.meta.url)),
            // An IIFE is the one format guaranteed to hold no import or export
            // statement, which a classic service worker cannot parse.
            output: { format: 'iife', entryFileNames: 'sw.js', inlineDynamicImports: true },
          },
        },
      });
      this.info?.(`service worker: ${shell.length} shell files, cache blockplay-shell-${version}`);
    },
  };
}
