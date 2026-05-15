import type { Heading, WikiLink } from "./types.js";

export function extractWikiLinks(content: string): WikiLink[] {
  const links: WikiLink[] = [];
  const regex = /\[\[([^\]\n]+)\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    links.push(parseWikiLink(match[0]));
  }
  return links;
}

export function parseWikiLink(raw: string): WikiLink {
  const inner = raw.startsWith("[[") && raw.endsWith("]]") ? raw.slice(2, -2) : raw;
  const [targetAndHeading, alias] = splitOnce(inner, "|");
  const [targetPart, heading] = splitOnce(targetAndHeading, "#");
  const packageParts = targetPart.startsWith("@") ? targetPart.split("/") : [];

  if (packageParts.length >= 2 && packageParts[0]?.startsWith("@")) {
    const packageName = `${packageParts[0]}/${packageParts[1]}`;
    const target = packageParts.slice(2).join("/") || ".";
    return cleanLink({ raw, packageName, target, heading, alias });
  }

  return cleanLink({ raw, target: targetPart, heading, alias });
}

function cleanLink(link: WikiLink): WikiLink {
  return {
    raw: link.raw,
    packageName: emptyToUndefined(link.packageName),
    target: link.target.trim().replace(/^\.\/+/, "") || ".",
    heading: emptyToUndefined(link.heading),
    alias: emptyToUndefined(link.alias)
  };
}

function splitOnce(value: string, separator: string): [string, string | undefined] {
  const index = value.indexOf(separator);
  if (index === -1) {
    return [value.trim(), undefined];
  }
  return [value.slice(0, index).trim(), value.slice(index + separator.length).trim()];
}

function emptyToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function extractHeadings(content: string): Heading[] {
  const headings: Heading[] = [];
  let inFence = false;
  for (const line of content.split(/\r?\n/)) {
    if (line.trim().startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      continue;
    }
    const match = /^(#{1,6})\s+(.+?)\s*#*$/.exec(line);
    if (!match) {
      continue;
    }
    const text = match[2].trim();
    headings.push({ depth: match[1].length, text, slug: slugifyHeading(text) });
  }
  return headings;
}

export function slugifyHeading(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function parseFrontmatter(content: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  if (!content.startsWith("---\n")) {
    return { frontmatter: {}, body: content };
  }
  const close = content.indexOf("\n---", 4);
  if (close === -1) {
    return { frontmatter: {}, body: content };
  }
  const raw = content.slice(4, close).trim();
  const body = content.slice(close + 4).replace(/^\r?\n/, "");
  const frontmatter: Record<string, unknown> = {};
  for (const line of raw.split(/\r?\n/)) {
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!match) {
      continue;
    }
    frontmatter[match[1]] = parseFrontmatterValue(match[2]);
  }
  return { frontmatter, body };
}

function parseFrontmatterValue(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed
      .slice(1, -1)
      .split(",")
      .map((part) => part.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  }
  if (trimmed === "true") {
    return true;
  }
  if (trimmed === "false") {
    return false;
  }
  return trimmed.replace(/^["']|["']$/g, "");
}
