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
  content: string;
};

export type KnowledgeManifest = {
  name: string;
  version: string;
  description?: string;
  license?: string;
  type: "knowledge-package";
  exports: Record<string, string>;
  context: {
    entrypoints: string[];
    include: string[];
    exclude: string[];
    tags: string[];
    audience: string[];
    requireWikilinks: boolean;
  };
  wikilinks: {
    caseSensitive: boolean;
    extensions: string[];
    ambiguous: "error" | "first" | "warn";
  };
  dependencies: Record<string, string>;
  knowledgeDependencies: Record<string, string>;
};

export type PackageContext = {
  root: string;
  manifest: KnowledgeManifest;
  name: string;
  version: string;
  notes: Map<string, ParsedNote>;
};

export type ResolvedLink = {
  raw: string;
  from: string;
  toPackage?: string;
  toPath?: string;
  toHeading?: string;
  status: "resolved" | "missing" | "ambiguous";
  reason?: string;
  candidates?: string[];
};

export type LinkEdge = {
  from: string;
  to?: string;
  raw: string;
  packageName: string;
  resolved: boolean;
  status: ResolvedLink["status"];
  reason?: string;
};

export type Graph = {
  nodes: Array<{ id: string; packageName: string; path: string }>;
  edges: LinkEdge[];
};
