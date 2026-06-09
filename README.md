# knowledge-package-manager (`kpm`)

`kpm` is an alpha CLI for sharing small, versioned Markdown knowledge bases the
way developers share npm packages. It installs wiki-linked Markdown packages,
locks their exact sources, composes them into an Obsidian-openable `wiki/`
vault, and can hand that vault to an external LLM CLI for synthesis.

Alpha status: the local CLI, GitHub/file installs, locking, compose, pack,
doctor, audit, and describe/agent-context injection commands exist. A public npm
release, hosted registry, publish workflow, and graph command are not
implemented yet.

Use `kpm` when you want to:

- keep reusable knowledge as normal Markdown with `[[wikilinks]]`;
- pin exact GitHub tags, commits, or local package directories in a lockfile;
- compose several knowledge packages into one vault for humans or agents; and
- make generated LLM bridge notes explicit and replaceable.

Do not use `kpm` as:

- a hosted package registry or publishing service;
- a replacement for npm, pnpm, Obsidian Sync, or Git;
- a security sandbox for untrusted content; or
- a general Markdown site generator.

## Install and local development

Requirements:

- Node.js >=20
- npm

This repository is not published to npm yet. Until it is, install from a clone
and run the built CLI locally:

```bash
git clone https://github.com/0xLT/kpm.git
cd kpm
npm ci
npm run build
npm test
npm run typecheck
```

The built CLI entrypoint is `dist/cli.js`. During local development you can run
it with `node dist/cli.js ...`, or create a temporary shell alias:

```bash
alias kpm="node $(pwd)/dist/cli.js"
kpm --help
```

Future npm install shape, once publishing is ready:

```bash
npm install -g knowledge-package-manager
kpm --help
```

The npm package name is currently `knowledge-package-manager`; the exposed
binary name is `kpm`.

## 5-minute quickstart

This quickstart creates an empty knowledge package, validates it, and composes an
empty local vault without invoking an LLM bridge.

```bash
# From a built clone of this repository.
mkdir /tmp/kpm-demo
cd /tmp/kpm-demo
node /path/to/kpm/dist/cli.js init --name @demo/ai-handbook
node /path/to/kpm/dist/cli.js doctor
node /path/to/kpm/dist/cli.js compose --no-bridge
```

Expected output:

```text
Initialized knowledge package.
Doctor ok.
copy phase complete -> wiki/
compose complete (bridge phase skipped)
Composed vault.
```

Expected project files for the empty-package quickstart:

```text
.gitignore
knowledge.json        # package contract
kpm.config.json       # local consumer policy
```

Because this package has no dependencies yet, `compose --no-bridge` prints the
vault target but does not need to copy any package files.

A fresh `knowledge.json` looks like this:

```json
{
  "name": "@demo/ai-handbook",
  "version": "0.1.0",
  "type": "knowledge-package"
}
```

To install package content, add a GitHub or local file dependency, then compose
again:

```bash
kpm add github:owner/repo#v0.1.0
kpm compose --no-bridge
```

Use a real repository that contains a valid `knowledge.json`. For publishable
packages, prefer tags, commit SHAs, or `#semver:<range>` over mutable branch refs
such as `#main`.

## Commands

```bash
kpm init [--name @scope/project]
kpm add github:owner/repo[#ref|#semver:<range>] | file:/path/to/package
kpm remove <name>
kpm install
kpm update [name]
kpm compose [--fresh] [--no-bridge] [--cli claude|codex|gemini]
kpm pack [--out path]
kpm doctor
kpm audit
kpm describe --to AGENTS.md
```

There is no `build` or `graph` command in v2.
`kpm install` hydrates from the existing lockfile; it does not re-resolve manual
`knowledge.json` dependency edits when `knowledge.lock` already has packages.
`kpm add` is the command that re-resolves the dependency graph and rewrites both
`knowledge.json` and `knowledge.lock`.

`kpm remove <name>` drops a direct dependency from `knowledge.json`, then
re-resolves and rewrites `knowledge.lock` and `knowledge_modules/`.

`kpm update` re-resolves every direct dependency from its `knowledge.json` spec
and rewrites the lockfile; dependencies pinned to a tag or commit SHA stay put,
while `#semver:<range>` and branch refs move to the newest match. `kpm update
<name>` re-resolves only the named direct dependency, keeping every other direct
dependency and its locked dependency chain pinned to the current lockfile
baseline.

Source specs:

- `github:owner/repo[#ref]` fetches a GitHub tarball. If `#ref` is omitted,
  `HEAD` is used and treated as a mutable branch ref.
- Refs that look like `v1.2.3` or `1.2.3` are treated as tags, 7-40 character
  hex refs are treated as SHAs, and everything else is treated as a branch.
- `github:owner/repo#semver:<range>` resolves the range against GitHub tags
  during `kpm add` or intentional lockfile regeneration. Tags such as `v0.2.4`
  and `0.2.4` are accepted for comparison, and the highest satisfying tag is
  pinned to its commit SHA in `knowledge.lock`.
  Quote source specs with spaces when passing them through a shell, such as
  `kpm add 'github:owner/repo#semver:>=1.2.0 <2.0.0'`.
- `file:/path/to/package` reads a local package directory. Transitive relative
  `file:` dependencies are resolved relative to their local `file:` parent.

## File model

Project roots mirror npm-style package roots:

```text
knowledge.json       # publish contract
kpm.config.json      # consumer policy
knowledge.lock       # resolved graph
knowledge_modules/   # installed packages
wiki/                # composed vault, configurable
.kpm/                # project logs and pack artifacts
```

`knowledge.json` is the package contract:

```json
{
  "name": "@team/react-guide",
  "version": "0.1.0",
  "description": "React guidance as linked Markdown.",
  "license": "MIT",
  "type": "knowledge-package",
  "files": ["**/*.md"],
  "entrypoint": "README.md",
  "knowledgeDependencies": {
    "@team/sql-guide": "github:team/sql-guide#v0.2.0",
    "@team/solana": "github:team/solana#semver:^0.2.0"
  }
}
```

Only the fields shown above are accepted. `files` defaults to `["**/*.md"]`
and supports leading `!` exclude patterns. `entrypoint` defaults to `README.md`
and must be included by the publish globs for `kpm pack` to succeed.

`kpm.config.json` is local consumer policy:

```json
{
  "vault": "wiki",
  "defaultCli": "claude",
  "audit": { "enabled": false }
}
```

If `kpm.config.json` is missing, commands use the same defaults shown above.
Fetched GitHub tarballs are cached globally under `~/.kpm/cache/`.

`knowledge.lock` records the resolved graph: exact versions, winning specs,
resolved URLs, ref type, commit SHA, content integrity, tarball integrity,
dependency edges, requesters, and root override records.

## Install vs compose

`kpm add` records a direct dependency in `knowledge.json`, resolves transitives,
enforces singleton-by-name dependency semantics, writes `knowledge.lock`, and
hydrates `knowledge_modules/`.

`kpm install` hydrates `knowledge_modules/` from the lockfile. It does not
re-resolve `knowledge.json`, build, or synthesize the vault. If the lockfile is
missing or empty while `knowledge.json` declares dependencies, `kpm install`
errors instead of inventing a new lockfile implicitly.

For semver GitHub dependencies, `kpm add` resolves the range once, records the
original `#semver:<range>` spec plus the selected tag, commit SHA, commit-pinned
tarball URL, and integrity values in `knowledge.lock`. Later `kpm install` runs
only from that exact lockfile metadata and does not list tags or choose a newer
matching version.

`kpm compose` creates the vault:

1. Copies installed packages into `<vault>/<scope>/<name>/`.
2. Rewrites wikilinks to vault-absolute paths.
3. Prunes package folders no longer present in the lockfile.
4. Runs the configured LLM adapter unless `--no-bridge` is set.

Use `--fresh` to wipe the vault before recomposing. Incremental compose clears
derived package folders but preserves generated bridge files and user-authored
notes outside copied package folders. If the lockfile has no packages, compose
skips the bridge phase.

## Wikilink rules

Compose and doctor resolve links strictly:

- `[[@scope/pkg/path]]` targets an installed package.
- `[[./sibling]]` and `[[../folder/note]]` resolve relative to the current note.
- `[[folder/note]]` resolves as a local package path.
- `[[name]]` resolves by filename slug inside the source package only.

Bare links never cross package boundaries and do not fall back to H1 titles.
Unresolved or ambiguous file targets are hard errors. Aliases and `#heading`
anchors are preserved during rewrite, but heading anchors are not validated.

## LLM bridge

Built-in adapters:

- `claude` runs `claude --print`
- `codex` runs `codex exec -`
- `gemini` runs `gemini --prompt -`

`kpm compose --cli codex` overrides the configured default for one run. The
adapter is spawned with `cwd` set to the vault and the kpm-owned bridge prompt
piped to stdin. Adapter output is logged to `.kpm/logs/compose-<timestamp>.log`.

Generated files must include:

```yaml
---
kpm-generated: true
kpm-generator: claude
kpm-generated-at: 2026-05-18T14:32:00Z
kpm-sources: ["@team/react-guide", "@team/sql-guide"]
---
```

When the bridge phase runs, `kpm compose` refuses to proceed if existing
`wiki/index.md` or `wiki/bridges/*.md` files lack `kpm-generated: true`. After
the adapter exits, kpm verifies that `wiki/index.md` exists and has that marker.

## Pack, doctor, and audit

`kpm doctor` validates manifests, installed packages, lockfile signals, and
wikilinks. Mutable branch refs are surfaced as info. Root override records are
warnings.

`kpm pack` runs doctor, requires the entrypoint to be included by the package
file globs, and writes `.kpm/pack/<scope>-<name>-<version>.tgz` by default. It
also accepts `--out path`. It refuses to pack packages with mutable dependency
refs such as `github:owner/repo#main`; use a tag, commit SHA, or semver range
for publishable packages.

`kpm audit` is beta advisory signal only. It scans installed packages for
unexpected file extensions and large text-like files, but it is not a security
boundary and must not be relied on as one.

## Agent file injection

`kpm describe --to AGENTS.md` injects a marker-wrapped summary of the composed
vault into the selected file. It is opt-in and updates only the managed block on
rerun.

```markdown
<!-- BEGIN KPM-CONTEXT -->
...
<!-- END KPM-CONTEXT -->
```

## Contributing and security

- [CONTRIBUTING.md](CONTRIBUTING.md) explains local setup, test commands, PR expectations, and fixture conventions.
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) sets community participation expectations.
- [SECURITY.md](SECURITY.md) explains supported alpha versions, vulnerability reporting, and the current security model.
- GitHub issue and pull request templates live under [.github/](.github/).

## License

`knowledge-package-manager` is released under the MIT License. See
[LICENSE](LICENSE).

## OSS roadmap

Open-source readiness work is being staged before a broader registry effort:

1. README quickstart and honest alpha positioning.
2. License and package metadata.
3. Contributor governance, security policy, and GitHub templates.
4. GitHub Actions quality gates.
5. Changelog, release checklist, and roadmap docs.
6. Public examples and end-to-end tutorial.
7. GitHub repository settings polish.

Use the linked contributor and security docs for project participation details;
this README remains the source of truth for current CLI behavior.
