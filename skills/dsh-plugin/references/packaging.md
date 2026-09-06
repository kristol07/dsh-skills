# Packaging

## The manifest

```jsonc
{
  "name": "dsh-my-plugin",
  "version": "0.1.0",
  "description": "One sentence a user reads on npm.",
  "license": "MIT",
  "author": "you <you@example.com>",
  "repository": { "type": "git", "url": "git+https://github.com/you/dsh-my-plugin.git" },
  "homepage": "https://github.com/you/dsh-my-plugin#readme",
  "bugs": { "url": "https://github.com/you/dsh-my-plugin/issues" },
  "keywords": ["deepseek-harness", "dsh", "dsh-plugin"],

  "type": "module",
  "main": "./lib/index.js",
  "types": "./lib/types/index.d.ts",
  "exports": {
    ".": { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" },
    "./client": { "types": "./lib/types/client/index.d.ts", "default": "./lib/client.js" },
    "./package.json": "./package.json"
  },
  "files": [
    "lib/index.js", "lib/index.js.map",
    "lib/client.js", "lib/client.js.map",
    "lib/types/**/*.d.ts",
    "cordis.patch.yml", "README.md", "CHANGELOG.md", "LICENSE"
  ],

  "scripts": {
    "build": "tsc -p tsconfig.build.json && tsdown",
    "test": "npm run build && node --import tsx --test test/*.test.mjs",
    "verify:pack": "publint && attw --pack . --profile node16 --ignore-rules cjs-resolves-to-esm",
    "release:check": "npm test && npm run verify:pack",
    "prepare": "npm run build",
    "prepublishOnly": "npm test"
  },

  "engines": { "node": "^22.19.0 || >=24.0.0" },
  "publishConfig": { "access": "public" },

  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": { "platform": "web", "inject": ["@deepseek-ai/dsh-client-ui-slots"] }
  }
}
```

### `dsh.bundle`

Makes the package installable as a **profile layer**. `dsh plugin add` appends a
package declaring it to `dsh.profile.bundles`; a package without it installs as a
plain dependency and activates nothing (with a warning). That is the right shape
for a library other plugins import, and the wrong shape for a plugin a user
enables.

The patch path is joined on the filesystem, not resolved through `exports`, so
the file only needs to be in `files` — do not add an `exports` entry for it. A
`.yml` export also fails packaging checks, since it is not a module.

### `dsh.client`

- `platform: 'web'` — required, or the scan skips the package.
- `inject: [...]` — package-name edges for factory arrival and composition.
  Naming a package that is not a boot row is harmless (it is skipped).
- `external: [...]` — extra module-table specifiers the bundle requests beyond
  the seeds. Only for a row the graph actually carries.

The package must also export `./client` as a string or as an object with a
string `default`. Anything else fails the scan loudly at activation.

### `prepare` vs `prepack`

`prepare` runs on a local install, before pack, before publish, **and after a
git install**. `prepack` runs only for pack and publish. A git dependency ships
sources, not build output, so a TypeScript plugin without `prepare` installs from
GitHub as a package with no `lib/`. Use `prepare`; `prepack` is then redundant.

Keep `prepare` self-contained — it must not assume a sibling monorepo checkout or
project references, because it runs in the consumer's install.

## Dependency policy

A plugin that reaches everything through `ctx` imports no harness module at
runtime: the host half imports Node builtins, the browser half requires only
seeds. Such a package honestly has **no dependencies**.

Peer dependencies are the conventional way to express host compatibility, but
check the arithmetic before adding them. semver only admits a prerelease version
when the range contains a comparator with the same `[major.minor.patch]`. While
dsh ships prereleases, `>=0.1.2-rc.1` does **not** match `0.1.3-alpha.1`, so a
pinned peer range warns on a healthy install. State compatibility in the README
and add peers once the harness ships stable versions.

Everything you need for types and tests belongs in `devDependencies`: the
harness packages you type against, `typescript`, `tsdown`, `tsx`, `publint`,
`@arethetypeswrong/cli`, `@types/node`, `@types/react`, `react`.

## Types

Emit both halves' declarations with `tsc`, not tsdown:

```jsonc
// tsconfig.build.json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false, "declaration": true, "emitDeclarationOnly": true,
    "rootDir": "src", "outDir": "lib/types"
  }
}
```

Skip `declarationMap` unless you also publish `src/` — otherwise every `.d.ts.map`
in the tarball points at files that are not there.

Annotate a large exported string constant (`export const css: string = …`) or
`tsc` will inline the whole literal as its type and bloat the declaration.

If `@types/node` is not picked up automatically, set `"types": ["node", "react"]`
explicitly in `compilerOptions`.

## Verifying the package

```bash
npm run verify:pack        # publint + attw over a real pack
npm pack --dry-run         # see exactly what ships
npm publish --dry-run      # rehearse the whole lifecycle
```

Two warnings are expected for a UI plugin, and the harness waives both for its
own packages:

- **publint: `exports["./client"]` is CJS but interpreted as ESM.** Node never
  resolves that file; the page evaluates it as a classic script. Renaming to
  `.cjs` would satisfy the linter and diverge from every shipped harness package.
- **attw: `cjs-resolves-to-esm`.** An ESM-only package is the intent. Ignore the
  rule explicitly rather than papering over it.

Run attw with `--profile node16`: `node10` resolution cannot see an exports map
at all, and the package requires Node 22+ anyway.

**Do not put the packaging checks in `prepublishOnly`.** `attw --pack` shells out
to `npm pack`, which inherits `npm_config_dry_run` from `npm publish --dry-run`,
writes no tarball, and fails with ENOENT — making the publish rehearsal
impossible. Keep them in a `release:check` script and in CI.

## Line endings

On Windows, add a `.gitattributes` with `* text=auto eol=lf` early. Without it
every commit reports CRLF conversions and diffs get noisy.
