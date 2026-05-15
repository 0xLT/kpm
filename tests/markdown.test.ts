import { describe, expect, test } from "vitest";
import { extractHeadings, extractWikiLinks, parseWikiLink } from "../src/markdown.js";

describe("wikilink parsing", () => {
  test("extracts local links with headings and aliases", () => {
    const content = "See [[components#Props|prop rules]] and [[errors]].";

    expect(extractWikiLinks(content)).toEqual([
      {
        raw: "[[components#Props|prop rules]]",
        packageName: undefined,
        target: "components",
        heading: "Props",
        alias: "prop rules"
      },
      {
        raw: "[[errors]]",
        packageName: undefined,
        target: "errors",
        heading: undefined,
        alias: undefined
      }
    ]);
  });

  test("parses scoped cross-package links", () => {
    expect(parseWikiLink("[[@acme/react-kit/components#Props|props]]")).toEqual({
      raw: "[[@acme/react-kit/components#Props|props]]",
      packageName: "@acme/react-kit",
      target: "components",
      heading: "Props",
      alias: "props"
    });
  });

  test("extracts markdown headings with stable slugs", () => {
    expect(extractHeadings("# Intro\n## Component Props!\n### create_user")).toEqual([
      { depth: 1, text: "Intro", slug: "intro" },
      { depth: 2, text: "Component Props!", slug: "component-props" },
      { depth: 3, text: "create_user", slug: "create_user" }
    ]);
  });
});
