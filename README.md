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
kpm add github:owner/repo[#ref] | file:/absolute/path
kpm install
kpm compose [--fresh] [--no-bridge] [--cli claude|codex|gemini]
kpm pack [--out path]
kpm doctor
kpm audit
kpm describe --to AGENTS.md
```

There is no `build`, `graph`, or `remove` command in v2. To remove a package,
edit `knowledge.json` and run `kpm install`.

## File Model

Project roots mirror npm-style package roots:

```text
knowledge.json       # publish contract
kpm.config.json      # consumer policy
knowledge.lock       # resolved graph
knowledge_modules/   # installed packages
wiki/                # composed vault, configurable
.kpm/                # cache, logs, pack artifacts
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
    "@team/sql-guide": "github:team/sql-guide#v0.2.0"
  }
}
```

`kpm.config.json` is local consumer policy:

```json
{
  "vault": "wiki",
  "defaultCli": "claude",
  "audit": { "enabled": false }
}
```

`knowledge.lock` records the resolved graph: exact versions, winning specs,
resolved URLs, ref type, commit SHA, content integrity, tarball integrity,
dependency edges, requesters, and root override records.

## Install Vs Compose

`kpm add` records a direct dependency in `knowledge.json`, resolves transitives,
enforces singleton-by-name dependency semantics, and writes `knowledge.lock`.

`kpm install` hydrates `knowledge_modules/` from the lockfile. It does not build
or synthesize the vault.

`kpm compose` creates the vault:

1. Copies installed packages into `<vault>/<scope>/<name>/`.
2. Rewrites wikilinks to vault-absolute paths.
3. Prunes package folders no longer present in the lockfile.
4. Runs the configured LLM adapter unless `--no-bridge` is set.

Use `--fresh` to wipe the vault before recomposing. Incremental compose clears
derived package folders but preserves generated bridge files and user-authored
notes outside copied package folders.

## Wikilink Rules

Compose and doctor resolve links strictly:

- `[[@scope/pkg/path]]` targets an installed package.
- `[[./sibling]]` and `[[../folder/note]]` resolve relative to the current note.
- `[[name]]` resolves by filename slug inside the source package only.

Bare links never cross package boundaries and do not fall back to H1 titles.
Unresolved or ambiguous links are hard errors.

## LLM Bridge

Built-in adapters:

- `claude`
- `codex`
- `gemini`

`kpm compose --cli codex` overrides the configured default for one run. The
adapter is spawned with `cwd` set to the vault and the kpm-owned bridge prompt
piped to stdin.

Generated files must include:

```yaml
---
kpm-generated: true
kpm-generator: claude
kpm-generated-at: 2026-05-18T14:32:00Z
kpm-sources: ["@team/react-guide", "@team/sql-guide"]
---
```

`kpm compose` refuses to overwrite `wiki/index.md` or `wiki/bridges/*.md` if the
file lacks `kpm-generated: true`.

## Pack, Doctor, Audit

`kpm doctor` validates manifests, installed packages, lockfile signals, and
wikilinks. Mutable branch refs are surfaced as info. Root override records are
warnings.

`kpm pack` writes `.kpm/pack/<scope>-<name>-<version>.tgz` by default. It refuses
to pack packages with mutable dependency refs such as `github:owner/repo#main`.
Use a tag or commit SHA for publishable packages.

`kpm audit` is beta advisory signal only. It flags suspicious package contents
such as unexpected binary-looking files, but it is not a security boundary and
must not be relied on as one.

## Agent File Injection

`kpm describe --to AGENTS.md` injects a marker-wrapped summary of the composed
vault into the selected file. It is opt-in and updates only the managed block on
rerun.

```markdown
<!-- BEGIN KPM-CONTEXT -->
...
<!-- END KPM-CONTEXT -->
```
