# AI notes example package

This is a minimal `kpm` knowledge package. Its `knowledge.json` declares the
package contract, and the Markdown files under `notes/` are the package content.

Start with [[notes/overview]] and follow the local wikilinks from there.

Package files:

```text
knowledge.json
README.md
notes/
├── overview.md
├── prompt-patterns.md
└── evaluation.md
```

The package uses only local wikilinks:

- `[[notes/overview]]` resolves from this README to `notes/overview.md`.
- `[[prompt-patterns]]` resolves by filename slug inside this package.
- `[[./evaluation]]` resolves relative to the current note.

Those rules match the links that `kpm doctor` validates and `kpm compose` rewrites
when a consumer project composes a vault.
