# Publishing __PLUGIN_NAME__

This package publishes through [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/):
GitHub Actions mints a short-lived credential over OIDC, so there is no npm
password, no `NPM_TOKEN`, and no `NODE_AUTH_TOKEN` secret.

`.github/workflows/publish.yml` runs on a pushed `v*` tag. It checks the tag
against `package.json` and `package-lock.json`, checks the commit is an ancestor
of `main`, refuses a version already on the registry, runs the tests and the
packaging checks, packs a tarball — and a second job publishes **that tarball**,
so what ships is the artifact the tests ran against. Stable versions go to
`latest`; a prerelease suffix goes to `next`.

## One-time GitHub setup

1. Push the workflow to `main` first — npm matches the run by workflow
   **filename**, so it has to exist on the default branch.
2. **Settings → Environments → New environment**, named **`npm`**.
3. Under **Deployment branches and tags**, choose **Selected branches and tags**
   and add a **Tag** rule `v*`. A branches-only rule blocks the run, because the
   release never runs from a branch.
4. Optional: add yourself under **Required reviewers** for a second gate. Leave
   **Prevent self-review** off, or as the sole maintainer you cannot approve
   your own tag.

Declaring `environment: npm` in the workflow does **not** by itself require
approval — GitHub silently creates an unprotected environment of that name.

## One-time npm setup

Trusted publishing attaches to an existing package, so publish the first version
manually:

```bash
npm login --registry=https://registry.npmjs.org
npm run release:check
npm publish --access public
```

Then **Packages → __PLUGIN_NAME__ → Settings → Trusted publishing → Add trusted
publisher → GitHub Actions**:

| Field | Value |
| --- | --- |
| Organization or user | the owner half of `__PLUGIN_REPO__` |
| Repository | the repo half of `__PLUGIN_REPO__` |
| Workflow filename | `publish.yml` (filename only) |
| Environment name | `npm` |
| Allowed actions | allow direct **`npm publish`** |

A new configuration may default to staged publishing only; this workflow
publishes directly, so allow that explicitly.

## Every release after that

```bash
npm run release:check
npm version patch                 # or minor / major / an explicit x.y.z
git push origin main --follow-tags
```

`npm version` writes the manifest, updates the lockfile, commits, and tags in
one step. Update `CHANGELOG.md` and commit it before tagging. Then watch
**Actions → Publish to npm**, and approve the deployment if you configured
reviewers.

A published version cannot be overwritten and a tag should not be moved. Fix a
configuration failure and re-run the job; for a code or workflow change, cut a
new version.

## Repository topics

The harness README asks plugin authors to add the
[`dsh-plugin`](https://github.com/topics/dsh-plugin) topic, which is how plugins
are found on GitHub:

```bash
gh repo edit __PLUGIN_REPO__ --add-topic dsh-plugin --add-topic deepseek-harness --add-topic dsh
```

npm keywords are a separate index and are already set in `package.json`.
