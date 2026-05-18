import { describe, expect, it } from "vitest";
import { rewriteWikiLinks } from "../../src/markdown/wikilinks.js";

describe("rewriteWikiLinks", () => {
  it("rewrites local + package wikilinks using a provided resolver", () => {
    const src = "# X\n\nSee [[intro]] and [[@acme/pkg/start|Start]].\n";
    const out = rewriteWikiLinks(src, (link) => {
      if (link.packageName === "@acme/pkg") return "acme/pkg/start";
      if (link.target === "intro") return "current/intro";
      return undefined;
    });
    expect(out).toContain("[[current/intro]]");
    expect(out).toContain("[[acme/pkg/start|Start]]");
  });

  it("leaves unresolved links untouched", () => {
    const src = "[[missing]]\n";
    const out = rewriteWikiLinks(src, () => undefined);
    expect(out).toBe(src);
  });

  it("does not touch code-fenced wikilinks", () => {
    const src = "```\n[[code]]\n```\n[[real]]\n";
    const out = rewriteWikiLinks(src, () => "X");
    expect(out).toContain("```\n[[code]]\n```");
    expect(out).toContain("[[X]]");
  });
});
