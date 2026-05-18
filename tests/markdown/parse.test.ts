import { describe, expect, it } from "vitest";
import { parseNote } from "../../src/markdown/parse.js";

describe("parseNote", () => {
  it("extracts frontmatter, headings, and wikilinks", () => {
    const src = `---
title: Hello
tags: [a, b]
---

# Hello World

See [[other-note]] and [[@acme/pkg/intro|Intro]].
`;
    const note = parseNote("notes/hello.md", src);
    expect(note.title).toBe("Hello");
    expect(note.frontmatter.tags).toEqual(["a", "b"]);
    expect(note.headings[0].text).toBe("Hello World");
    expect(note.wikilinks).toHaveLength(2);
    expect(note.wikilinks[0].target).toBe("other-note");
    expect(note.wikilinks[1].packageName).toBe("@acme/pkg");
    expect(note.wikilinks[1].target).toBe("intro");
    expect(note.wikilinks[1].alias).toBe("Intro");
  });

  it("ignores wikilinks inside fenced code blocks", () => {
    const src = "# T\n\n```\n[[do-not-count]]\n```\n\n[[count-me]]\n";
    const note = parseNote("a.md", src);
    expect(note.wikilinks.map((link) => link.target)).toEqual(["count-me"]);
  });

  it("falls back to filename when no title heading exists", () => {
    const note = parseNote("path/my-note.md", "Plain body, no headings.\n");
    expect(note.title).toBe("my-note");
  });

  it("parses heading-anchored wikilinks", () => {
    const note = parseNote("a.md", "# T\n\n[[other#Section Name]]\n");
    expect(note.wikilinks[0].heading).toBe("Section Name");
  });
});
