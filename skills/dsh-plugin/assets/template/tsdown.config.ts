import { defineConfig } from 'tsdown'

export default defineConfig([{
  // Host half: plain ESM for Node. Declarations come from tsc into lib/types.
  entry: ['src/index.ts'],
  outDir: 'lib',
  format: 'esm',
  platform: 'node',
  target: 'node22',
  fixedExtension: false,
  dts: false,
  sourcemap: true,
  clean: false,
  deps: { neverBundle: [/^@deepseek-ai\//] },
}, {
  // Browser half: a CJS bundle in the page loader's registration wrapper. The
  // module table answers exactly the platform seed words, so everything else
  // must be inlined — a require it cannot answer throws at materialization.
  entry: { client: 'src/client/index.tsx' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  clean: false,
  dts: false,
  sourcemap: true,
  deps: {
    neverBundle: ['react', 'react/jsx-runtime', 'react-dom', '@deepseek-ai/cordis'],
    alwaysBundle: [/^\.\//, /^\.\.\//],
  },
  outputOptions: {
    entryFileNames: 'client.js',
    // The id MUST equal the package name: the module table is keyed by it.
    banner: 'window.__ModuleLoader__.load({ id: "__PLUGIN_NAME__", factory: (require) => {',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
    footer: 'return module.exports; } });',
  },
}])
