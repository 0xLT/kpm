# kpm examples

These examples are small, public fixtures for learning the current `kpm` package
model. They intentionally use local `file:` sources so you can run them from a
clone without a registry or private repository.

## What is included

```text
examples/
├── minimal-package/      # a reusable knowledge package
├── consumer-project/     # walkthrough for installing and composing it
└── smoke.mjs             # optional validation script
```

The examples cover the first-run happy path implemented today:

1. Initialize a consumer project with `kpm init`.
2. Add a local package with `kpm add file:<path>`.
3. Rehydrate from the generated lockfile with `kpm install`.
4. Compose a vault with `kpm compose --no-bridge`.
5. Validate with `kpm doctor`.
6. Inject package context with `kpm describe --to AGENTS.md`.

`kpm add github:owner/repo#v0.1.0` uses the same package shape when the source is
a public GitHub repository containing a valid `knowledge.json`. Pin tags, commit
SHAs, or `#semver:<range>` for publishable examples instead of mutable branches.

`kpm remove <name>` and `kpm update [name]` are available CLI capabilities, but
this tutorial stays focused on the initial install and compose flow.

## Validate the examples

From a built repository clone:

```bash
npm run build
npm run smoke:examples
```

The smoke script copies the examples to a temporary directory, runs the commands
from the walkthrough, and checks the expected files exist. It does not modify the
example directories in this repository.

Expected smoke output:

```text
examples smoke ok: <temporary-directory>
```

## Next step

Open [consumer-project/README.md](consumer-project/README.md) for the end-to-end
walkthrough.
