# End-to-end consumer walkthrough

This walkthrough starts from an empty directory, installs the public example
package with a local `file:` source, composes a vault without invoking an LLM
bridge, validates links, and injects agent context.

The commands assume you are in a built clone of this repository.

```bash
npm ci
npm run build
export KPM="node $(pwd)/dist/cli.js"
```

Create a scratch consumer project:

```bash
DEMO_DIR=$(mktemp -d)
cd "$DEMO_DIR"
$KPM init --name @demo/consumer
```

Expected new files:

```text
.gitignore
knowledge.json
kpm.config.json
```

`knowledge.json` starts as a valid package manifest:

```json
{
  "name": "@demo/consumer",
  "version": "0.1.0",
  "type": "knowledge-package"
}
```

Add the example package from the repository clone:

```bash
$KPM add file:/path/to/kpm/examples/minimal-package
```

Expected output:

```text
Added file:/path/to/kpm/examples/minimal-package
```

Expected consumer files after add:

```text
knowledge.json
knowledge.lock
knowledge_modules/@kpm-examples/ai-notes/knowledge.json
knowledge_modules/@kpm-examples/ai-notes/README.md
knowledge_modules/@kpm-examples/ai-notes/notes/overview.md
knowledge_modules/@kpm-examples/ai-notes/notes/prompt-patterns.md
knowledge_modules/@kpm-examples/ai-notes/notes/evaluation.md
```

The dependency is recorded in `knowledge.json`:

```json
{
  "knowledgeDependencies": {
    "@kpm-examples/ai-notes": "file:/path/to/kpm/examples/minimal-package"
  }
}
```

Rehydrate from the lockfile. This is useful after cloning a consumer project that
already has `knowledge.lock` but does not have `knowledge_modules/` checked in.

```bash
rm -rf knowledge_modules
$KPM install
```

Expected output:

```text
Installed from lockfile.
```

Compose the installed package into the vault without running an LLM bridge:

```bash
$KPM compose --no-bridge
```

Expected output:

```text
copy phase complete -> wiki/
compose complete (bridge phase skipped)
Composed vault.
```

Expected composed files:

```text
wiki/@kpm-examples/ai-notes/knowledge.json
wiki/@kpm-examples/ai-notes/README.md
wiki/@kpm-examples/ai-notes/notes/overview.md
wiki/@kpm-examples/ai-notes/notes/prompt-patterns.md
wiki/@kpm-examples/ai-notes/notes/evaluation.md
```

`kpm compose` rewrites package links to vault-absolute wikilinks. For example,
`wiki/@kpm-examples/ai-notes/notes/overview.md` contains links like:

```markdown
[[@kpm-examples/ai-notes/notes/prompt-patterns]]
[[@kpm-examples/ai-notes/notes/evaluation]]
```

Validate manifests, lockfile signals, installed packages, and wikilinks:

```bash
$KPM doctor
```

Expected output:

```text
Doctor ok.
```

Inject a managed package-context block for agents:

```bash
printf '# Demo agent notes
' > AGENTS.md
$KPM describe --to AGENTS.md
```

Expected output:

```text
Updated AGENTS.md
```

`AGENTS.md` now contains a marker-wrapped block similar to:

```markdown
<!-- BEGIN KPM-CONTEXT -->

# Knowledge context (managed by kpm)

Project: @demo/consumer@0.1.0
Composed vault: wiki/

Installed packages:

- @kpm-examples/ai-notes@0.1.0 from file:/path/to/kpm/examples/minimal-package

Agents should treat wiki/ as authoritative reference material. Start at wiki/index.md.

<!-- END KPM-CONTEXT -->
```

## GitHub source variant

If the same package is published as a public GitHub repository, replace the
`file:` add command with a pinned GitHub source:

```bash
$KPM add github:owner/repo#v0.1.0
```

The repository must contain a valid `knowledge.json`, and the tag-like ref must
match the package version in that manifest. Avoid documenting registry publish or
search commands here: those flows are not implemented yet.

## Cleanup

```bash
rm -rf "$DEMO_DIR"
```
