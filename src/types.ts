export type KnowledgeManifest = {
  name: string;
  version: string;
  description?: string;
  license?: string;
  type: "knowledge-package";
  files: string[];
  entrypoint: string;
  knowledgeDependencies: Record<string, string>;
};

export type KpmConfig = {
  vault: string;
  defaultCli: "claude" | "codex" | "gemini";
  audit: { enabled: boolean };
};

export type LockfileRefType = "tag" | "branch" | "sha";

export type LockfileOverriddenSpec = {
  spec: string;
  requestedBy: string;
};

export type LockfilePackage = {
  version: string;
  spec: string;
  resolved: string;
  ref: string;
  refType: LockfileRefType;
  commit: string;
  integrity: string;
  tarballIntegrity: string;
  dependencies: Record<string, string>;
  requestedBy: string[];
  overriddenSpecs?: LockfileOverriddenSpec[];
};

export type Lockfile = {
  lockfileVersion: 2;
  root: { name: string; version: string };
  packages: Record<string, LockfilePackage>;
};

export type WikiLink = {
  raw: string;
  packageName?: string;
  target: string;
  heading?: string;
  alias?: string;
};

export type Heading = {
  depth: number;
  text: string;
  slug: string;
};

export type ParsedNote = {
  path: string;
  title: string;
  frontmatter: Record<string, unknown>;
  headings: Heading[];
  wikilinks: WikiLink[];
  body: string;
  source: string;
};
