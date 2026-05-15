# knowledge-package-manager

`kpm` is a local CLI MVP for installable, versioned Markdown knowledge packages.
It treats public GitHub repositories as the first registry: a package is a repo
with a `knowledge.json` manifest and Markdown files linked with `[[wikilinks]]`.

## Commands

```bash
npm install
npm run build
npm test

kpm init
kpm add github:acme/react-context#v0.1.0
kpm add file:/absolute/path/to/local/package
kpm doctor
kpm build --entry README.md --max-tokens 50000
kpm build --target cursor
kpm pack
```

## Package format

```json
{
  "name": "@scope/package",
  "version": "0.1.0",
  "type": "knowledge-package",
  "exports": {
    ".": "./README.md",
    "./components": "./components.md"
  },
  "context": {
    "entrypoints": ["README.md"],
    "include": ["**/*.md"],
    "exclude": ["drafts/**", "private/**"],
    "requireWikilinks": true
  },
  "knowledgeDependencies": {
    "@scope/other": "github:owner/repo#v0.1.0"
  }
}
```

By default, `kpm doctor` requires packages and their Markdown files to contain
wikilinks. Set `context.requireWikilinks=false` only for intentional standalone
packs. For an individual leaf note, add frontmatter:

```markdown
---
kpmAllowNoWikilinks: true
---
```

## Outputs

`kpm build` writes:

- `dist/context.md`
- `dist/graph.json`
- `dist/citations.json`

Targeted builds also support:

- `--target cursor` -> `.cursor/rules/kpm-context.mdc`
- `--target claude` -> `dist/claude-project-context.md`
- `--target llms-txt` -> `dist/llms.txt`
- `--target rag` -> `dist/chunks.jsonl` and `dist/embeddings-manifest.json`
