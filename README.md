# knowledge-package-manager

`kpm` is an npm-style package manager for wiki-linked Markdown knowledge bases.
It installs small versioned Markdown graphs, composes them into a single
Obsidian-openable vault, and delegates synthesis to external LLM CLIs.

The core split is deliberate:

- `kpm` owns distribution, locking, mechanical copy, and wikilink rewriting.
- Claude Code, Codex, or Gemini own generated synthesis such as `wiki/index.md`
  and bridge notes.
- Authors keep writing normal Markdown with `[[wikilinks]]`.

## Install

```bash
npm install
npm run build
npm test
```

The built CLI entrypoint is `dist/cli.js` and the package exposes `kpm` as its
binary.

## Commands

```bash
kpm init [--name @scope/project]
kpm add github:owner/repo[#ref|#semver:<range>] | file:/path/to/package
kpm install
kpm compose [--fresh] [--no-bridge] [--cli claude|codex|gemini]
kpm pack [--out path]
kpm doctor
kpm audit
kpm describe --to AGENTS.md
```

There is no `build`, `graph`, `remove`, or standalone `update` command in v2.
`kpm install` hydrates from the existing lockfile; it does not re-resolve
manual `knowledge.json` dependency edits when `knowledge.lock` already has
packages. `kpm add` is the command that re-resolves the dependency graph and
rewrites both `knowledge.json` and `knowledge.lock`.

Source specs:

- `github:owner/repo[#ref]` fetches a GitHub tarball. If `#ref` is omitted,
  `HEAD` is used and treated as a mutable branch ref.
- Refs that look like `v1.2.3` or `1.2.3` are treated as tags, 7-40 character
  hex refs are treated as SHAs, and everything else is treated as a branch.
- `github:owner/repo#semver:<range>` resolves the range against GitHub tags
  during `kpm add` or intentional lockfile regeneration. Tags such as `v0.2.4`
  and `0.2.4` are accepted for comparison, and the highest satisfying tag is
  pinned to its commit SHA in `knowledge.lock`.
- `file:/path/to/package` reads a local package directory. Transitive relative
  `file:` dependencies are resolved relative to their local `file:` parent.

## File Model

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

## Install Vs Compose

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

## Wikilink Rules

Compose and doctor resolve links strictly:

- `[[@scope/pkg/path]]` targets an installed package.
- `[[./sibling]]` and `[[../folder/note]]` resolve relative to the current note.
- `[[folder/note]]` resolves as a local package path.
- `[[name]]` resolves by filename slug inside the source package only.

Bare links never cross package boundaries and do not fall back to H1 titles.
Unresolved or ambiguous file targets are hard errors. Aliases and `#heading`
anchors are preserved during rewrite, but heading anchors are not validated.

## LLM Bridge

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

## Pack, Doctor, Audit

`kpm doctor` validates manifests, installed packages, lockfile signals, and
wikilinks. Mutable branch refs are surfaced as info. Root override records are
warnings.

`kpm pack` runs doctor, requires the entrypoint to be included by the package
file globs, and writes `.kpm/pack/<scope>-<name>-<version>.tgz` by default. It
also accepts `--out path`. It refuses to pack packages with mutable dependency
refs such as `github:owner/repo#main`; use a tag or commit SHA for publishable
packages.

`kpm audit` is beta advisory signal only. It scans installed packages for
unexpected file extensions and large text-like files, but it is not a security
boundary and must not be relied on as one.

## Agent File Injection

`kpm describe --to AGENTS.md` injects a marker-wrapped summary of the composed
vault into the selected file. It is opt-in and updates only the managed block on
rerun.

```markdown
<!-- BEGIN KPM-CONTEXT -->
...
<!-- END KPM-CONTEXT -->
```
