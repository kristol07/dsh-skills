#!/usr/bin/env python3
"""Copy the dsh plugin template into a new package directory.

The template is a working two-half plugin: a host entry that nests its
webServer dependency, a browser entry that contributes a Settings tab through a
slot and registers its dictionaries, contract tests that assert the browser
bundle's module edges, and both CI workflows. Everything is substituted from
one plugin name, so the pieces that must agree — the package name, the
`__ModuleLoader__` factory id, the patch row, the locale namespace — cannot
drift apart at creation time.

    python scaffold.py ../dsh-my-plugin --name dsh-my-plugin --repo you/dsh-my-plugin
    python scaffold.py ../dsh-my-tool --name dsh-my-tool --no-ui
"""

from __future__ import annotations

import argparse
import re
import shutil
import sys
from pathlib import Path

TEMPLATE = Path(__file__).resolve().parent.parent / "assets" / "template"

#: Files that exist only to support a browser half.
UI_ONLY = (
    Path("src/client/index.tsx"),
    Path("src/client/locales.ts"),
    Path("test/plugin.test.mjs"),
)

#: devDependencies only the browser half needs.
UI_DEV_DEPENDENCIES = (
    "@deepseek-ai/dsh-client-locale",
    "@deepseek-ai/dsh-client-modules",
    "@deepseek-ai/dsh-client-ui-renderer",
    "@deepseek-ai/dsh-client-ui-settings",
    "@deepseek-ai/dsh-client-ui-slots",
    "@types/react",
    "react",
)

#: npm's own rule, narrowed: a plugin name is also a path segment and a JS
#: string inside the bundle banner, so keep it boring.
NAME_PATTERN = re.compile(r"^[a-z0-9][a-z0-9._-]*(/[a-z0-9][a-z0-9._-]*)?$")


def die(message: str) -> None:
    """Report a usage problem and stop.

    :param message: what went wrong, in the user's terms.
    """
    print(f"scaffold: {message}", file=sys.stderr)
    raise SystemExit(2)


def short_id(name: str) -> str:
    """Derive the Loader entry id and route prefix from a package name.

    A scope and a leading ``dsh-`` are noise inside a config file that is
    already about dsh, so ``@you/dsh-my-plugin`` reads as ``my-plugin``.

    :param name: the npm package name.
    :returns: the short identifier.
    """
    unscoped = name.split("/")[-1]
    return re.sub(r"^dsh-", "", unscoped) or unscoped


def substitutions(args: argparse.Namespace) -> dict[str, str]:
    """Build the placeholder table.

    :param args: parsed command line.
    :returns: placeholder to replacement.
    """
    identifier = args.id or short_id(args.name)
    return {
        "__PLUGIN_NAME__": args.name,
        "__PLUGIN_ID__": identifier,
        "__PLUGIN_NS__": args.namespace or f"plugin.{identifier}",
        "__PLUGIN_TAB__": args.tab or identifier,
        "__PLUGIN_DESCRIPTION__": args.description,
        "__PLUGIN_AUTHOR__": args.author,
        "__PLUGIN_REPO__": args.repo,
    }


def drop_ui(target: Path) -> None:
    """Remove the browser half from a freshly copied tree.

    A host-only plugin that still declared ``dsh.client`` would fail the client
    scan at activation, so the manifest declaration goes with the files.

    :param target: the new package directory.
    """
    for relative in UI_ONLY:
        (target / relative).unlink(missing_ok=True)
    shutil.rmtree(target / "src" / "client", ignore_errors=True)

    manifest = target / "package.json"
    text = manifest.read_text(encoding="utf-8")
    text = re.sub(r'\n    "\./client": \{[^}]*\},', "", text)
    text = re.sub(r'\n    "lib/client\.js(?:\.map)?",', "", text)
    text = re.sub(r',\n    "client": \{.*?\n    \}', "", text, flags=re.S)
    for dependency in UI_DEV_DEPENDENCIES:
        text = re.sub(rf'\n    "{re.escape(dependency)}": "[^"]*",', "", text)
    manifest.write_text(text, encoding="utf-8")

    config = target / "tsdown.config.ts"
    body = config.read_text(encoding="utf-8")
    body = body.split("}, {", 1)[0].rstrip() + "\n}])\n"
    config.write_text(body, encoding="utf-8")

    tsconfig = target / "tsconfig.json"
    tsconfig.write_text(
        tsconfig.read_text(encoding="utf-8")
        .replace('    "types": ["node", "react"],\n', '    "types": ["node"],\n')
        .replace('    "jsx": "react-jsx"\n', "")
        .replace(",\n  },", "\n  },")
        .replace('"include": ["src/**/*.ts", "src/**/*.tsx"]', '"include": ["src/**/*.ts"]'),
        encoding="utf-8",
    )

    test_dir = target / "test"
    if test_dir.is_dir() and not any(test_dir.iterdir()):
        test_dir.rmdir()


def main() -> None:
    """Run one scaffold."""
    parser = argparse.ArgumentParser(description="Scaffold a DeepSeek Harness plugin.")
    parser.add_argument("target", type=Path, help="directory to create")
    parser.add_argument("--name", required=True, help="npm package name, e.g. dsh-my-plugin")
    parser.add_argument("--id", help="Loader entry id and route prefix (default: name minus dsh-)")
    parser.add_argument("--namespace", help="locale namespace (default: plugin.<id>)")
    parser.add_argument("--tab", help="default tab label (default: <id>)")
    parser.add_argument("--description", default="A DeepSeek Harness plugin.")
    parser.add_argument("--author", default="")
    parser.add_argument("--repo", default="you/your-repo", help="owner/repo on GitHub")
    parser.add_argument("--no-ui", dest="ui", action="store_false", help="host half only")
    parser.set_defaults(ui=True)
    args = parser.parse_args()

    if not NAME_PATTERN.match(args.name):
        die(f"{args.name!r} is not a usable npm package name")
    if not TEMPLATE.is_dir():
        die(f"template missing at {TEMPLATE}")
    target: Path = args.target.resolve()
    if target.exists() and any(target.iterdir()):
        die(f"{target} already exists and is not empty")

    shutil.copytree(TEMPLATE, target, dirs_exist_ok=True)
    if not args.ui:
        drop_ui(target)

    table = substitutions(args)
    for path in target.rglob("*"):
        if not path.is_file():
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        replaced = text
        for placeholder, value in table.items():
            replaced = replaced.replace(placeholder, value)
        if replaced != text:
            path.write_text(replaced, encoding="utf-8")

    print(f"scaffolded {args.name} at {target}")
    print("next:")
    print(f"  cd {target}")
    print("  npm install && npm test")
    print(f"  dsh plugin --profile web add link:{target}")
    print("  dsh --profile web --dump-config")
    print(
        f"  gh repo edit {args.repo} --add-topic dsh-plugin"
        " --add-topic deepseek-harness --add-topic dsh"
    )
    if not args.author:
        print("note: set `author` in package.json before publishing")
    print("note: docs/publishing.md has the one-time trusted-publishing setup")


if __name__ == "__main__":
    main()
