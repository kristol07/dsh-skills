# dsh-skills

Agent skills for working with the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`).

## Skills

| Skill | What it covers |
|---|---|
| [`dsh-plugin`](skills/dsh-plugin/SKILL.md) | The full plugin lifecycle: the two-half package shape, host services and extension points, browser slots and the module-table rules, locale registration, profile bundles and patch layers, testing against the real harness machinery, and a tag-triggered npm release over Trusted Publishing (OIDC — no tokens). |

## Install

From the [skills.sh](https://www.skills.sh/p/8TnjgYed7CfZZ9pQ) pack:

```bash
npx skills add https://skills.sh/p/8TnjgYed7CfZZ9pQ
```

Or copy a skill directory straight into an agent's own skills directory — for
Claude Code that is `~/.claude/skills/`:

```bash
cp -r skills/dsh-plugin ~/.claude/skills/
```

## Scaffolding a plugin

The `dsh-plugin` skill bundles a working two-half template and a script that
copies it:

```bash
python skills/dsh-plugin/scripts/scaffold.py ../dsh-my-plugin \
  --name dsh-my-plugin --repo you/dsh-my-plugin --description "What it does."
cd ../dsh-my-plugin && npm install && npm test
```

Add `--no-ui` for a host-only plugin (a tool or a hook); it drops the browser
half, its dev dependencies, and the `dsh.client` declaration.

Both variants build, pass their own contract tests, and pass `publint` and
`@arethetypeswrong/cli` as generated. Each ships a `docs/publishing.md` with the
one-time trusted-publishing setup, and the scaffold prints the `gh repo edit`
command for the `dsh-plugin` topic the harness README asks plugin repositories to
carry.

## Why these exist

Most of the work in a dsh plugin is not the feature — it is the seams. The
package has two halves built differently and wired by three manifest
declarations; the browser bundle may only ask the page's module table for a
fixed set of seed modules; UI is contributed into slots another package
declares; copy goes through the harness's locale service rather than the
browser's; and the install and release paths each have a gate that fails
quietly. Each of those is cheap once you know it and expensive to rediscover.

## The skills.sh pack

This repository is published as the pack
[`dsh-skills`](https://www.skills.sh/p/8TnjgYed7CfZZ9pQ). skills.sh builds a pack
from a GitHub repository, including every valid `SKILL.md` it finds, so a second
skill is a second directory under `skills/` rather than a separate artifact.
Binary files and files over 2 MB are skipped, which is why everything here is
plain text.

## License

MIT
