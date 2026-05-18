import { describe, expect, it } from "vitest";
import { reconcileSingletons } from "../../src/resolver/singleton.js";

describe("reconcileSingletons", () => {
  it("returns a single entry per package name when requests agree", () => {
    const out = reconcileSingletons([
      { name: "@acme/a", source: "github:acme/a#v0.1.0", requestedBy: "root" },
      { name: "@acme/a", source: "github:acme/a#v0.1.0", requestedBy: "@acme/b" }
    ]);
    expect(out.size).toBe(1);
    expect(out.get("@acme/a")?.source).toBe("github:acme/a#v0.1.0");
  });

  it("throws on conflicting refs for the same name", () => {
    expect(() =>
      reconcileSingletons([
        { name: "@acme/a", source: "github:acme/a#v0.1.0", requestedBy: "@acme/c" },
        { name: "@acme/a", source: "github:acme/a#v0.2.0", requestedBy: "@acme/b" }
      ])
    ).toThrow(/conflict/);
  });

  it("root override wins when root declares a package its transitive deps disagree on", () => {
    const out = reconcileSingletons([
      { name: "@acme/a", source: "github:acme/a#v0.3.0", requestedBy: "root" },
      { name: "@acme/a", source: "github:acme/a#v0.2.0", requestedBy: "@acme/b" }
    ]);
    expect(out.size).toBe(1);
    const a = out.get("@acme/a")!;
    expect(a.source).toBe("github:acme/a#v0.3.0");
    expect(a.requestedBy).toEqual(["root", "@acme/b"]);
    expect(a.overriddenSpecs).toEqual([{ spec: "github:acme/a#v0.2.0", requestedBy: "@acme/b" }]);
  });
});
