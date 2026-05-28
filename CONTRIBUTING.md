# Contributing to kpm

Thanks for helping improve `kpm`. The project is still an alpha CLI, so keep changes small, easy to review, and aligned with the current local/GitHub/file package workflows.

## Local setup

Requirements:

- Node.js >=20
- npm

From a fresh clone:

```bash
git clone https://github.com/0xLT/kpm.git
cd kpm
npm ci
npm run build
npm test
npm run typecheck
```

Before opening a PR, run the checks that match your change:

```bash
npm test
npm run typecheck
npm pack --dry-run
```

Run `npm pack --dry-run` when changing package metadata, files, build output, release docs, or anything that could affect npm package contents.

## Branches and pull requests

- Create a focused branch for one issue or change.
- Keep PRs scoped; avoid mixing refactors with behavior changes.
- Describe user-visible behavior, docs changes, and tests run in the PR body.
- Link the relevant Linear or GitHub issue when one exists.
- Do not document unimplemented registry, publish, graph, or hosted service behavior as available.

## Test and fixture conventions

- Put command-level behavior tests under `tests/commands/`.
- Put manifest parser/validator tests under `tests/manifest/`.
- Put resolver behavior tests under `tests/resolver/`.
- Use `tests/fixtures/` for small package directories that model real `knowledge.json` packages.
- Keep fixtures minimal and deterministic; prefer local `file:` packages over network access.
- Avoid committing generated `dist/`, `.kpm/`, `knowledge_modules/`, `wiki/`, or `knowledge.lock` files unless a test fixture explicitly requires one.

## Documentation expectations

- Keep command examples aligned with the current CLI.
- Mark future npm, registry, publish, and graph workflows as future work unless implemented.
- Be explicit that `kpm audit` is advisory and not a security boundary.
