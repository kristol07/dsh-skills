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

Use **npm Trusted Publishing** rather than a token. GitHub Actions mints a
short-lived credential over OIDC, so there is no npm password, `NPM_TOKEN`, or
`NODE_AUTH_TOKEN` anywhere — the trust lives on the npm side and names the
repository, the workflow **filename**, and a GitHub environment. Those three are
part of the configuration, not free choices: renaming the workflow file breaks
publishing.

`assets/template/.github/workflows/publish.yml` is the whole thing. Its shape is
two jobs, and the split is the point:

1. **validate** — check the tag against `package.json` *and* `package-lock.json`,
   check the commit is an ancestor of `main`, refuse a version already on the
   registry (an npm version cannot be overwritten, so failing early beats failing
   halfway through), run `release:check`, then `npm pack` and upload the tarball.
2. **publish** — `permissions: id-token: write`, `environment: npm`, download the
   artifact, and `npm publish <tarball>`. Publishing the tarball the tests ran
   against removes the window where a rebuild could differ, and publishing a
   tarball runs no lifecycle scripts at all.

Route a prerelease to the `next` dist-tag so a beta cannot displace `latest`:

```bash
case "$version" in *-*) tag=next ;; *) tag=latest ;; esac
```

### One-time setup, and the two things that bite

**On GitHub.** Create the environment (`Settings → Environments`) with the name
the workflow declares. Two traps:

- Declaring `environment: npm` in YAML does **not** require approval. GitHub
  silently creates an unprotected environment of that name. Add **Required
  reviewers** if you want a human gate; leave **Prevent self-review** off, or a
  sole maintainer cannot approve their own tag.
- Under **Deployment branches and tags**, add a **Tag** rule `v*`. A
  branches-only rule blocks every release, because the run comes from a tag.

**On npm.** Package → Settings → Trusted publishing → Add trusted publisher →
GitHub Actions, filling in the owner, repository, workflow filename, and
environment name. Allow direct **`npm publish`** — a new configuration may
default to staged publishing only.

Trusted publishing attaches to an **existing** package, so the first release of
a new name is published manually (`npm login && npm publish --access public`) and
every release after that runs in CI.

OIDC needs npm ≥ 11.5.1, so pin the workflow to Node 24.

### Releasing

```bash
npm run release:check
npm version patch            # writes the manifest and lockfile, commits, and tags
git push origin main --follow-tags
```

Update `CHANGELOG.md` before tagging.

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

## Repository topics

The harness README asks plugin authors to add the
[`dsh-plugin`](https://github.com/topics/dsh-plugin) topic to their repository —
that GitHub topic page is how people find dsh plugins. Set it when the repository
is created, not at release time, since discovery is the point:

```bash
gh repo edit owner/repo --add-topic dsh-plugin --add-topic deepseek-harness --add-topic dsh
```

npm keywords (`deepseek-harness`, `dsh`, `dsh-plugin` in `package.json`) index a
different catalogue. Set both.
