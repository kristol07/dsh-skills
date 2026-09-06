# __PLUGIN_NAME__

__PLUGIN_DESCRIPTION__

## Compatibility

| | |
|---|---|
| Node | `^22.19.0 \|\| >=24.0.0` |
| DSH | `>= 0.1.2-rc.1`, on a `web` profile |
| Runtime dependencies | none |

## Install

```bash
dsh plugin --profile web add __PLUGIN_NAME__
dsh --profile web --dump-config     # verify the layer before booting
```

Other routes: `./dir`, `link:/abs/dir`, `./x.tgz`, `github:__PLUGIN_REPO__`.
A git install needs the package allowlisted in the profile's
`pnpm-workspace.yaml` under `allowBuilds`, because pnpm has to run this
package's `prepare` script — which is permission to execute its code at install
time. Prefer npm or a tarball, or pin a commit.

## Develop

```bash
npm install && npm test
npm run verify:pack     # publint + attw
```

## Release

Create an npm **automation** token and add it as the repository secret
`NPM_TOKEN`. Then:

```bash
npm run release:check
npm version patch
git push --follow-tags
```

## License

MIT
