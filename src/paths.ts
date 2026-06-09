import { relative, resolve, sep } from "node:path";

export function toPosixPath(path: string): string {
  return path.replace(/\\/g, "/").split(sep).join("/");
}

export function normalizePackagePath(path: string): string {
  return path
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean)
    .join("/");
}

export function withoutMarkdownExtension(path: string): string {
  return path.replace(/\.md$/i, "");
}

export function withMarkdownExtension(path: string): string {
  return path.toLowerCase().endsWith(".md") ? path : `${path}.md`;
}

export function isSafeRelativePath(path: string): boolean {
  if (!path || path.startsWith("/") || path.includes("\0")) {
    return false;
  }
  const normalized = normalizePackagePath(path);
  return normalized !== ".." && !normalized.startsWith("../") && !normalized.includes("/../");
}

export function isPathInside(parent: string, child: string): boolean {
  const rel = relative(resolve(parent), resolve(child));
  return rel === "" || (!rel.startsWith("..") && !rel.startsWith("/") && !rel.includes(`..${sep}`));
}
