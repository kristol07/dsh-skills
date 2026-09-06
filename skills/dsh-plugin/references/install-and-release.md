# Installing and releasing

## Profiles, bundles, layers

Two concepts, both described by a `package.json` but answering different
questions:

- A **bundle** is an npm package shipping a configuration layer. Its manifest
  declares `dsh.bundle`, answering "what does this package contribute?"
- A **profile** is a directory at `$DSH_HOME/profiles/<name>` describing one
  runnable composition. Its manifest declares `dsh.profile`, answering "which
  bundles compose this setup, in what order?"

You author bundles; users boot profiles. Nothing is both. `dsh plugin` creates
and maintains profile manifests — never hand-write one.

The effective configuration composes over an empty root by applying, in order:

1. each bundle patch in `dsh.profile.bundles`, in list order;
2. the profile's own `cordis.patch.yml`;
3. the home-level `$DSH_HOME/cordis.patch.yml`;
4. each `--patch <path>` overlay, in argv order.

Later layers win **per row**, and a patch replaces a row's entire `config` rather
than merging keys. Two consequences: your patch can override an earlier row by
`id` but must restate every key that row needs; and users can override your rows
in their own layer without touching your package, so ship defaults they are
likely to keep.

## Your bundle patch

```yaml
- insert:
    - id: my-plugin
      name: dsh-my-plugin
```

Rows reference the package **by name** so Node resolution finds the installed
code. A relative `./`-prefixed name is anchored to the patch file's own
directory and becomes a `file://` URL — useful in a user's own patch layer,
wrong in a published bundle.

Rows can also carry `config`, `disabled` (including a `!!js` expression), and
`inject`.

## Install routes

```bash
dsh plugin --profile web add dsh-my-plugin                 # npm
dsh plugin --profile web add ./dsh-my-plugin-0.1.0.tgz     # tarball
dsh plugin --profile web add link:/abs/path/to/checkout    # symlink, for development
dsh plugin --profile web add github:you/dsh-my-plugin      # git — see below
dsh --profile web --dump-config                            # verify before booting
dsh plugin --profile web remove dsh-my-plugin              # removes dependency and layer
```

`dsh plugin` forwards to pnpm in the profile directory, so every pnpm verb works.
It then reconciles `dsh.profile.bundles` against the **installed state**, which
means a package that gains a `dsh.bundle` declaration in a newer version
activates on `update`.

### The git-install build-script gate

A git install fetches **sources, not build artifacts**. Two things must happen:

- **You** ship a `prepare` script that builds the published entry points
  self-contained.
- **The user** allowlists the build. pnpm ≥10 refuses to run a git dependency's
  `prepare` until it is explicitly allowed, so the first `add` fails and prints
  the exact key. It goes in the profile's `pnpm-workspace.yaml`:

  ```yaml
  allowBuilds:
    dsh-my-plugin: true
  ```

Say plainly in your README what that allowance means: **permission to execute the
package's code on the user's machine at install time**, outside any sandbox the
agent runs under. Recommend pinning a commit (`github:you/repo#<sha>`) so a later
push cannot silently change what runs — or point at the npm/tarball routes, which
need no build permission.

### Local development without installing

Point a patch row at the build output:

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml
- insert:
    - id: my-plugin
      name: ../../plugins/dsh-my-plugin/lib/index.js
```

The relative name anchors to that file's directory. The client-modules scan then
walks up from it to your `package.json` and reads `dsh.client` and
`exports["./client"]`, so the browser half works too. The `web` profile is
`patchReload: live`, so editing the patch needs no restart.

Never combine routes — each inserts its own row, and you get duplicates.

## Release automation

Publish on a pushed version tag: a merge to the default branch publishes
nothing, and the tag is the confirmation gesture.

```yaml
name: Release
on:
  push:
    tags: ['v*']
permissions:
  contents: write     # to create the GitHub release
  id-token: write     # for npm provenance
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          registry-url: https://registry.npmjs.org
      - run: npm ci
      - name: Check the tag matches the manifest
        run: |
          tag="${GITHUB_REF_NAME#v}"
          manifest="$(node -p "require('./package.json').version")"
          [ "$tag" = "$manifest" ] || { echo "::error::tag v$tag != manifest $manifest"; exit 1; }
      - run: npm run release:check
      - run: npm publish --provenance --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

The full workflow in `assets/template/.github/workflows/release.yml` adds a check
that the version is not already on the registry — better than letting `npm
publish` fail halfway through the job — and opens the GitHub release.

One-time setup, and the only manual step: create an **automation** access token
on npm and add it as the repository secret `NPM_TOKEN`. Automation tokens are the
ones that bypass 2FA in CI; a classic publish token with 2FA-on-publish will not
work unattended.

Then a release is:

```bash
npm run release:check
npm version patch            # writes the manifest, commits, and tags in one step
git push --follow-tags
```

Because `npm version` does all three, the tag and the manifest cannot disagree —
and the workflow re-checks anyway, since a hand-edit could split them.

For a manual approval on top of the tag, add `environment: npm-publish` to the
job and configure that environment's reviewers.

If your npm account rejects provenance, drop `--provenance`. Provenance also
requires the `repository.url` in the manifest to match the GitHub repository.

## CI

A plain CI workflow on push and pull_request, across the Node versions your
`engines` claims:

```yaml
strategy:
  matrix:
    node-version: [22, 24]
steps:
  - run: npm ci
  - run: npm test
  - run: npm run verify:pack
  - run: npm pack --dry-run
```

`npm ci` runs `prepare`, which is also the closest local rehearsal of what a git
install does to a consumer.
