# kpm Roadmap

_Last updated: 2026-06-03 · Synthesized from `claude-roadmap.md` + `codex-roadmap.md`_

`kpm` is an npm-style package manager for wiki-linked Markdown knowledge bases.
It installs small versioned Markdown graphs from GitHub or local sources, locks
their exact resolved versions, composes them into a single Obsidian-openable
vault, and delegates synthesis (the generated `index.md` and cross-package
`bridges/*.md`) to external LLM CLIs (Claude, Codex, Gemini). The deterministic
core owns distribution, resolution, locking, hydration, mechanical copy, and
wikilink rewriting; authors just write ordinary Markdown with `[[wikilinks]]`.

> **How to read this roadmap.** The work runs on **two parallel tracks**
> (see _The two tracks_ below). Each track is organized **Now / Next / Later**
> (themed, undated phases); within each phase, items are sequenced and numbered,
> and every phase carries explicit **exit criteria**. Effort is sized **S / M / L**.
> Status reflects the current `main` branch (see the baseline snapshot), so
> already-shipped work is marked done rather than planned.

---

## The two tracks

kpm's roadmap advances on two distinct but connected tracks. The shared north
star, invariants, and effort key below apply to both.

- **Track A — Substrate & Distribution** *(the supply side).* The package-manager
  plumbing: build, version, lock, compose, discover, and (eventually) publish
  knowledge packages. This is "make kpm a real package manager."
- **Track B — Agent Leverage** *(the demand side).* The tools, retrieval, and SDK
  that let **agents** consume and act on the composed knowledge. This is "make
  the knowledge actually usable by agents." Track B **builds on top of** Track A's
  primitives — the MCP `serve` surface, the local query/retrieval index, and
  `describe` — rather than duplicating them.

The two tracks can progress in parallel, but Track B's earliest items assume
Track A's NEXT primitives exist; sequence accordingly.

---

## Baseline snapshot (state of `main`)

This roadmap treats merged work on `origin/main` as the baseline. Several items
that earlier drafts listed as "to do" are already shipped; what remains of that
hygiene work lives on open `agent/p2-*` branches. (This baseline is Track A.)

**✅ Shipped (baseline):**

- Core engine: `init`, `add`, `install`, `compose`, `pack`, `doctor`, `audit`, `describe`.
- GitHub and `file:` package sources; semver-range resolution against GitHub tags.
- Lockfile-based install + hydration; transitive dependency walking with
  singleton-by-package-name reconciliation.
- Strict wikilink resolution + rewrite rules; composition into a configurable
  `wiki/` directory.
- Bridge adapters for Claude, Codex, and Gemini; advisory beta `audit`.
- Managed agent-context injection (e.g. `AGENTS.md`).
- OSS/release hygiene on `main`: npm package metadata, CI quality gates,
  contributor governance, README quickstart, prepublish build safeguards, and
  CLI `--version` + friendly pre-init errors.

**🚧 In flight (open branches / PRs, fold into Track A NOW):**

- `GITHUB_TOKEN` support for GitHub API requests.
- ESLint / Prettier + lint checks in CI.
- `remove` / `update` commands.
- Repo scaffolding (release checklist, Dependabot, CODEOWNERS, `.editorconfig`,
  `.nvmrc`, changelog).

---

## Strategic frame & north star

**North star — both / substrate.** kpm stays medium-agnostic: a general
knowledge-distribution primitive that serves **humans** (CLI + Obsidian) and
**agents** (MCP + `describe`) equally, over one deterministic core. No forked
codepaths — every interface reads the same composed vault and lockfile. The two
tracks are exactly these two audiences: Track A makes the substrate; Track B
makes it pay off for agents.

**Sequencing — core-first, then the "both" payoff.** The differentiator is the
human+agent substrate, but credibility comes first. **Track A NOW** ships a
genuinely solid small package manager (publishable, complete lifecycle, honest
errors). **Track A NEXT** lays the agent-facing primitives (MCP `serve`, local
index). **Track B** then turns those primitives into real leverage.

**Resourcing — solo / nights & weekends.** Favor small, high-leverage
increments. Reframe anything that smells like "run a hosted service" into
server-less forms, and push true infrastructure to *Later* (ideally
community-funded).

---

## Guiding principles (invariants for every phase)

1. **The deterministic core never calls an LLM API.** Synthesis stays delegated
   to spawned CLIs / adapters. Reproducibility is the whole thesis — don't trade
   it away. _(Track B respects this: its retrieval/context primitives are
   model-free; only opt-in example agents and the eval harness call models, and
   they live outside the core.)_
2. **Crisp boundary.** `kpm` owns package mechanics (distribution, resolution,
   locking, hydration, copying, wikilink rewriting, validation, packaging).
   External LLM CLIs / agents own synthesis and reasoning. Authors write ordinary
   Markdown.
3. **Server-less first.** Anything resembling "registry / discovery / search /
   hosted retrieval" must work with Git repos, static JSON, and local indexes
   before any hosted service. Hosted infra is *Later*.
4. **One substrate, two interfaces.** Humans consume the vault via CLI +
   Obsidian; agents via MCP + the SDK. Both read the same vault and lockfile.
5. **Determinism & integrity are sacred.** Content/tarball hashing, strict
   wikilinks, and lockfile-as-truth do not regress for convenience.
6. **Strict, but with great errors.** Every new strictness ships with an
   actionable remediation message that points at the command that actually fixes
   the problem.

_Effort key: **S** = a sitting or two · **M** = a few sessions · **L** = multi-week._

---

# Track A — Substrate & Distribution

_The package-manager plumbing: distribution, resolution, locking, composition,
discovery, publishing._

## NOW — credibility floor + core lifecycle

_Sequenced; ship incrementally. Goal: make the first public install credible and
make kpm feel like a coherent small package manager._

| # | Item | Why | Effort | Status |
|---|------|-----|--------|--------|
| 1 | **Finish the in-flight baseline** | Merge or intentionally close the open `agent/p2-*` work: `GITHUB_TOKEN` auth + rate-limit/403 remediation, ESLint/Prettier in CI, repo scaffolding. Unauthenticated GitHub calls cap at 60 req/hr and block private repos — auth is the highest-leverage of these. | S | 🚧 in flight |
| 2 | **Publish the public npm alpha** | The tool is `2.0.0-alpha.1` and unpublished. Verify the clean-clone path (`npm ci` → `npm test` → `npm run typecheck` → `npm pack --dry-run`), publish, and switch README from clone-only to `npx kpm` / published-alpha install. | S | planned |
| 3 | **One real example + quickstart tutorial** | A small public GitHub repo with a valid `knowledge.json` (ideally a two-package → consumer graph), plus an end-to-end tutorial: `init` → `add github:…#semver:<range>` → `install` → `compose --no-bridge` → `doctor`. Cheapest adoption *and* dogfooding unlock. | S | planned |
| 4 | **`kpm remove <name>`** | The one glaring lifecycle gap — `add` exists, `remove` does not. Drop the direct dep from `knowledge.json` → re-resolve → rewrite `knowledge.lock` → rehydrate `knowledge_modules` → ensure `compose` prunes the removed package. | S | 🚧 in flight |
| 5 | **`kpm list`** | Make lockfile state legible without opening JSON: show direct + transitive packages with versions, source specs, pinned refs, and overridden specs. | S | planned |
| 6 | **`kpm outdated` + `kpm update [name\|--all]`** | Fills the deliberate "semver frozen at `add`" hole *explicitly and opt-in*. Reuses existing semver resolution + the original `#semver:` range stored in the lock. Make mutable-branch behavior explicit; keep ordinary `install` lockfile-only and deterministic. | M | 🚧 partly in flight |
| 7 | **Stabilization & honesty pass** | Make `add` atomic (resolution failure must not leave `knowledge.json` edited while lock/modules go stale); dedupe materialization of the package being added; reuse the tarball cache for reads, not just writes; fix `compose` pruning (including the empty-install case and scoped/unscoped dirs); fix misleading `doctor` lockfile-refresh guidance (point at the command that re-resolves); decide `audit.enabled` (wire it in or drop it from generated config); add CLI error-path tests (missing args, unknown commands/flags, doctor/audit output). | M | planned |

**Exit criteria**

- A new user can install the alpha **from npm and complete the quickstart without
  cloning this repo**.
- Users can `add` / `remove` / `list` / intentionally `update` packages with no
  manual manifest edits; lockfile behavior stays deterministic.
- `compose` is deterministic and retains **no stale package folders**.
- README clearly states alpha limits: no hosted registry, no publish workflow,
  GitHub/`file:` sources only, advisory-only audit.

## NEXT — deepen the hooks into the "both" substrate + authoring/trust

_Goal: ship the agent-facing primitives Track B depends on, and help people
**create** good packages, not just consume them._

| # | Item | Why | Effort |
|---|------|-----|--------|
| 1 | **`kpm serve` — read-only MCP server** | The differentiating "both" slice: expose the composed vault as MCP resources/tools (list packages, read note, follow link, get index/bridges). Local, no infra — a natural extension of `describe`. **The foundation Track B builds on.** | M |
| 2 | **Server-less discovery convention** | Make packages *findable* with no registry: standard GitHub topics (`kpm-package`, `knowledge-package`, `obsidian`, `markdown`) + a curated `awesome-kpm` index repo; optional `kpm search` over the GitHub topic API. | S–M |
| 3 | **`kpm graph` export** | Emit the dependency + wikilink graph (JSON / Mermaid); highlight singleton overrides and conflicts. Cheap DX win that feeds editor integrations later. | S–M |
| 4 | **Authoring & trust workflows** | `kpm init --package` templates (starter README, recommended layout, wikilink guidance); `kpm doctor --publish` (entrypoint inclusion, reject mutable refs, validate globs + generated-file boundaries, report unsafe/ambiguous wikilinks); expand `kpm audit` (hidden files, unexpected extensions, large/binary-ish files, symlink behavior, optional allowlist); strengthen bridge validation (verify generated bridge files *after* adapter execution, protect user-authored notes from overwrite). | M–L |
| 5 | **More sources** | Generalize sources beyond GitHub: `git+https` / `git+ssh`, GitLab, plain HTTPS tarball. | M |
| 6 | **Export adapters (pluggable outputs)** | Beyond Obsidian: Logseq, MkDocs/Docusaurus, plain Markdown — by abstracting the **link format** in the already-centralized wikilink/resolve layer. _(This is a link-rewriting adapter, **not** a hosted site generator — see Non-goals.)_ | M |
| 7 | **Smarter, incremental synthesis** | Content-address the bridge so unchanged sources skip regeneration; `compose --dry-run` to preview LLM changes before writing; optional per-package summaries. | M–L |
| 8 | **Watch mode** | `compose --watch` recomposes on change — a big authoring-DX win. | M |
| 9 | **Query / retrieval layer** ("ask the vault") | `kpm search` + an MCP `search` tool over a **local** embedding/keyword index cached in `.kpm/`. The capstone where kpm stops being a file-copier — and **the index Track B's retrieval stands on.** | L |

**Exit criteria**

- Agents can consume the composed vault over MCP; humans and agents share one
  substrate.
- Packages are discoverable with **no hosted registry**.
- Authors get clear local feedback (`doctor --publish`, expanded `audit`) before
  sharing a package; `audit` and `doctor` have distinct, useful purposes.
- Bridge generation stays opt-in, explicit, and replaceable; generated output is
  validated and user notes are protected.

## LATER — ambitious / higher-infra / community-dependent

| Item | Note |
|------|------|
| **Hosted registry + `kpm publish`** | The thing the solo constraint says *not* to build alone. Bridge until then = the NEXT discovery convention; could start as a static Git-hosted index before any server. Build only once GitHub-native distribution shows real demand. |
| **Signing & provenance** | Sigstore-style signing/verification + SBOM for knowledge graphs. |
| **Editor integrations** | Obsidian plugin / VS Code extension running `compose` / `doctor` / `serve` in-editor. |
| **Vault importer** | `kpm init --from <obsidian-vault>`: split an existing vault into packages, infer deps from links. |
| **Resolution beyond singleton** | Opt-in namespaced coexistence of conflicting versions + smarter conflict diagnostics. Singleton-by-name stays the **default**. |
| **Collaboration / living knowledge** | Proposals/review against packages, update notifications. _Exploratory_ — in tension with the immutability thesis, and flagged as such. |

---

# Track B — Agent Leverage

_The tools, retrieval, and SDK that let agents consume and act on the composed
knowledge. **kpm-native subcommands + a thin published SDK** — server-less and,
at the core, model-free._

> **Dependency:** Track B's NOW assumes Track A's NEXT primitives — the MCP
> `serve` surface and the local query/retrieval index. Start Track B once those
> land (or co-develop them).
>
> **Model boundary (invariant #1 preserved):** kpm's retrieval and context
> primitives are deterministic and **never call a model**. The example agents and
> the eval harness *do* call models, but they are opt-in and live outside the
> core (in `examples/` and a clearly separated surface). The substrate stays
> reproducible.

_All Track B items are **planned** (none in flight yet)._

## NOW — first usable agent slice (grounded, token-bounded)

_Goal: let an agent actually ask a vault a question and get cited, budget-aware
context back._

| # | Item | Why | Effort |
|---|------|-----|--------|
| 1 | **Deep MCP tool surface** | Turn `serve` from read-only resources into a real agent *toolset*: `search`, `get_note`, `follow_links`, `get_neighbors`, `get_index` / `get_bridges`, `describe_package`. The minimum for an agent to *navigate* a vault, not just read files. _(Integration)_ | M |
| 2 | **Grounded retrieval with citations** | Every retrieval result carries provenance — `note → package@version` — and supports graph-aware expansion along `[[wikilinks]]`. Lets agents cite sources and reason over neighborhoods, not isolated chunks. _(Retrieval)_ | M |
| 3 | **Context-budget packing** | `kpm context <query> --budget <tokens>` + an SDK function returning a token-bounded, relevance-ranked, citation-tagged context bundle with progressive disclosure (summary → detail). The core "inject the right knowledge into an agent" primitive. _(Context)_ | M |
| 4 | **Thin SDK (v0)** | A small published library wrapping load-vault / search / pack-context / cite, so any agent runtime can mount a composed kpm vault as a knowledge source in a few lines. Deterministic, model-free. _(Integration)_ | M |

**Exit criteria**

- An agent — via MCP **or** the SDK — can ask a question and receive
  token-bounded, citation-tagged, graph-aware context from a composed vault.
- Every returned chunk traces back to a `package@version` and a note path.
- The retrieval/context path makes **no model calls**.

## NEXT — workflows, framework reach, and trust

_Goal: meet agents where they live, prove the knowledge helps, and keep it
trustworthy._

| # | Item | Why | Effort |
|---|------|-----|--------|
| 1 | **Agent-framework adapters** | A Claude Agent SDK skill/tool plus LangChain / LlamaIndex retriever adapters over the SDK. Meet agents where they already are. _(Integration)_ | M |
| 2 | **Grounded Q&A reference agent** | A runnable example agent in `examples/` that answers questions over a vault with inline citations. Dogfoods the SDK and doubles as the canonical tutorial. _(Workflows)_ | M |
| 3 | **Vault-maintainer agent** | Detects stale, orphaned, or contradictory notes and **proposes** updates as diffs/PRs — never silently writes. Pairs with Track A `doctor`. _(Workflows)_ | M–L |
| 4 | **Eval harness — `kpm eval`** | Given a task set + a vault, measure whether providing vault context improves an agent's task success vs. a no-context baseline; add grounding/faithfulness checks (does each claim trace to a cited note?). Answers the core question: *does this knowledge actually help?* _(Evaluation)_ | L |
| 5 | **Retrieval ranking quality** | Hybrid ranking (keyword + embedding + graph centrality), neighborhood-expansion tuning, cross-package dedup. Raises answer quality once the plumbing works. _(Retrieval)_ | M–L |
| 6 | **Local usage telemetry (opt-in)** | Record which notes/packages agents actually pull (local-only, no infra) to inform pruning, authoring, and ranking. _(Evaluation / trust)_ | M |

**Exit criteria**

- An agent grounded on a kpm vault is **measurably** better on a task suite than
  the same agent without it (shown via `kpm eval`).
- Answers are **faithful to their citations** (claims trace to cited notes).
- A mainstream agent framework can mount a kpm vault as a retriever in a few lines.

## LATER — write-path, multi-agent, federation

| Item | Note |
|------|------|
| **Agent write-back / knowledge proposals** | Agents draft new notes or updates as reviewable package proposals (PRs against source repos). Strong tension with the immutability thesis — opt-in, flagged, **never auto-merged**. |
| **Multi-agent shared memory** | A team of agents sharing one composed vault as common ground, with per-agent context views. |
| **Hosted retrieval endpoint** | If/when a hosted registry exists (Track A Later), an optional hosted query/serve endpoint. Server-less stays the **default**. |
| **Cross-vault federation** | Query and cite across multiple installed vaults / orgs. |
| **Learned relevance** | Feedback-driven ranking trained on eval + telemetry signals. |

---

## Non-goals / guardrails

- The core never embeds an API key or calls a model directly — synthesis stays
  adapter-delegated.
- No hosted infrastructure in Now/Next; **server-less first**.
- Don't regress determinism, integrity, or strictness for convenience.
- Singleton-by-name stays the **default** even after coexistence is offered.
- Not a full npm replacement, not an Obsidian Sync replacement.
- Not a hosted Markdown **site generator**. (Export adapters that rewrite link
  format for Logseq/MkDocs/etc. are in scope; shipping kpm as an SSG product is
  not.)
- No security sandboxing for untrusted content; `audit` stays advisory.
- No automatic LLM synthesis that silently modifies package content.

**Track B (agent leverage) additionally:**

- kpm's retrieval/context primitives stay **model-free**; only opt-in example
  agents and the eval harness call models, and they live outside the core.
- No hosted retrieval service in Now/Next — server-less first, same as Track A.
- Agent write-back never silently mutates packages; **proposals only**, always
  reviewable.

---

## Cross-cutting (continuous)

- Maintain strong vitest coverage for every new command, including error paths.
- Update docs per feature; keep `knowledge.json` / lock schema changes
  backward-compatible or bump `lockfileVersion` deliberately.
- Keep the resolution → hydration → composition → synthesis stages distinct as
  the command surface grows; introduce a structured command/argument parser
  before it gets unwieldy.

---

## Success metrics

**Track A — Substrate & Distribution**

- A new user installs `kpm` from npm and completes the quickstart **without
  cloning this repository**.
- A user installs at least one real GitHub-hosted knowledge package.
- `doctor` and `pack` give accurate, actionable feedback.
- `compose` is deterministic and retains no stale package output.
- Lockfile-only `install` remains predictable.
- Adding lifecycle commands does not blur the distinction between resolution,
  hydration, composition, and synthesis.

**Track B — Agent Leverage**

- An agent answers a question over an installed vault with **correct citations**
  to `package@version`.
- `kpm eval` shows a **measurable task-success lift** from vault context on a
  sample suite.
- A mainstream agent framework can mount a kpm vault as a retriever in **< 10
  lines**.

---

_Synthesized from `claude-roadmap.md` and `codex-roadmap.md` on 2026-06-03.
An interactive view of both tracks — with a Substrate / Agent-Leverage switcher —
is available in `roadmap.html`._
