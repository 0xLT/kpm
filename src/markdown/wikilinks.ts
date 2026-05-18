import { unified } from "unified";
import remarkFrontmatter from "remark-frontmatter";
import remarkParse from "remark-parse";
import remarkWikiLink from "remark-wiki-link";
import { visit } from "unist-util-visit";
import { parseWikiLinkValue, type MarkdownNode } from "./parse.js";
import type { WikiLink } from "../types.js";

const PROCESSOR = unified()
  .use(remarkParse)
  .use(remarkFrontmatter, ["yaml"])
  .use(remarkWikiLink, { aliasDivider: "|" });

type Resolver = (link: WikiLink) => string | undefined;

type Replacement = {
  start: number;
  end: number;
  value: string;
};

export function rewriteWikiLinks(source: string, resolve: Resolver): string {
  const tree = PROCESSOR.parse(source);
  const replacements: Replacement[] = [];

  visit(tree as never, "wikiLink", (node: MarkdownNode) => {
    const start = node.position?.start?.offset;
    const end = node.position?.end?.offset;
    if (start === undefined || end === undefined) {
      return;
    }

    const value = String(node.value ?? "");
    const alias = typeof node.data?.alias === "string" ? node.data.alias : undefined;
    const raw = source.slice(start, end);
    const link = parseWikiLinkValue(value, alias, raw);
    const resolved = resolve(link);
    if (resolved === undefined) {
      return;
    }

    const heading = link.heading ? `#${link.heading}` : "";
    const aliasPart = link.alias ? `|${link.alias}` : "";
    replacements.push({ start, end, value: `[[${resolved}${heading}${aliasPart}]]` });
  });

  let out = source;
  for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
    out = `${out.slice(0, replacement.start)}${replacement.value}${out.slice(replacement.end)}`;
  }
  return out;
}
