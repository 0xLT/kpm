# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
While `kpm` is in alpha, breaking changes may land in any release.

## Unreleased

### Added

- Repository scaffolding: Dependabot configuration, `CODEOWNERS`, `.editorconfig`,
  `.nvmrc`, this changelog, and a release checklist (`RELEASING.md`).

### Changed

- Packaging: `npm pack`/`npm publish` now build `dist/` automatically via a
  `prepare` script, gated by `prepublishOnly` (build + tests + typecheck). The
  published tarball no longer ships source maps or declaration files.

## 2.0.0-alpha.1

Initial public alpha of the v2 CLI.

### Added

- Commands: `init`, `add`, `install`, `compose`, `pack`, `doctor`, `audit`, and
  `describe`.
- Package sources: GitHub (`github:owner/repo[#ref|#semver:<range>]`) and local
  (`file:`) directories, with transitive resolution.
- `knowledge.lock` recording exact versions, resolved URLs, ref type, commit SHA,
  content and tarball integrity, dependency edges, requesters, and root override
  records.
- Singleton-by-name dependency resolution with explicit root overrides.
- Wiki-link rewriting into an Obsidian-openable `wiki/` vault and an opt-in LLM
  bridge with `claude`, `codex`, and `gemini` adapters.
- `kpm describe` agent-context injection and beta `kpm audit` advisory scanning.
