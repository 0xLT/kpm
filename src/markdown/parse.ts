import { basename } from "node:path";
import { unified } from "unified";
import remarkFrontmatter from "remark-frontmatter";
import remarkParse from "remark-parse";
import remarkWikiLink from "remark-wiki-link";
import { visit } from "unist-util-visit";
import { withoutMarkdownExtension } from "../paths.js";
import { splitOnce } from "../util.js";
import type { Heading, ParsedNote, WikiLink } from "../types.js";

export const PROCESSOR = unified()
  .use(remarkParse)
  .use(remarkFrontmatter, ["yaml"])
  .use(remarkWikiLink, { aliasDivider: "|" });

export function parseNote(path: string, source: string): ParsedNote {
  const tree = PROCESSOR.parse(source);
  const frontmatter = extractFrontmatter(tree);
  const headings = extractHeadings(tree);
  const wikilinks = extractWikiLinks(tree);
  const title =
    (typeof frontmatter.title === "string" ? frontmatter.title : undefined) ??
    headings.find((heading) => heading.depth === 1)?.text ??
    basename(withoutMarkdownExtension(path));

  return {
    path,
    title,
    frontmatter,
    headings,
    wikilinks,
    body: stripFrontmatterBody(source),
    source
  };
}

export function parseWikiLinkValue(value: string, alias: string | undefined, raw: string): WikiLink {
  const [rawTarget, rawHeading] = splitOnce(value, "#");
  const targetAndHeading = rawTarget.trim();
  const heading = rawHeading?.trim();
  const parts = targetAndHeading.split("/");
  if (parts.length >= 2 && parts[0].startsWith("@")) {
    return {
      raw,
      packageName: `${parts[0]}/${parts[1]}`,
      target: parts.slice(2).join("/") || ".",
      heading,
      alias: alias && alias !== value ? alias : undefined
    };
  }

  return {
    raw,
    target: targetAndHeading,
    heading,
    alias: alias && alias !== value ? alias : undefined
  };
}

function extractFrontmatter(tree: unknown): Record<string, unknown> {
  const root = tree as { children?: Array<{ type?: string; value?: string }> };
  const yaml = root.children?.find((child) => child.type === "yaml");
  return yaml?.value ? parseYaml(yaml.value) : {};
}

function extractHeadings(tree: unknown): Heading[] {
  const headings: Heading[] = [];
  visit(tree as never, "heading", (node: MarkdownNode) => {
    const text = collectText(node).trim();
    if (text) {
      headings.push({ depth: Number(node.depth ?? 0), text, slug: slugify(text) });
    }
  });
  return headings;
}

function extractWikiLinks(tree: unknown): WikiLink[] {
  const links: WikiLink[] = [];
  visit(tree as never, "wikiLink", (node: MarkdownNode) => {
    const value = String(node.value ?? "");
    const alias = typeof node.data?.alias === "string" ? node.data.alias : undefined;
    const raw = `[[${value}${alias && alias !== value ? `|${alias}` : ""}]]`;
    links.push(parseWikiLinkValue(value, alias, raw));
  });
  return links;
}

export type MarkdownNode = {
  type?: string;
  value?: string;
  depth?: number;
  children?: MarkdownNode[];
  data?: { alias?: unknown };
  position?: { start?: { offset?: number }; end?: { offset?: number } };
};

function collectText(node: MarkdownNode): string {
  if (node.type === "text" || node.type === "inlineCode") {
    return node.value ?? "";
  }
  return node.children?.map(collectText).join("") ?? "";
}

function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function parseYaml(raw: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const line of raw.split(/\r?\n/)) {
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (match) {
      out[match[1]] = parseYamlValue(match[2]);
    }
  }
  return out;
}

function parseYamlValue(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed
      .slice(1, -1)
      .split(",")
      .map((part) => part.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  }
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  return trimmed.replace(/^["']|["']$/g, "");
}

function stripFrontmatterBody(source: string): string {
  if (!source.startsWith("---\n")) {
    return source;
  }
  const close = source.indexOf("\n---", 4);
  if (close === -1) {
    return source;
  }
  return source.slice(close + 4).replace(/^\r?\n/, "");
}
