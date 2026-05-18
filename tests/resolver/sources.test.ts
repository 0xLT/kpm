import { describe, expect, it } from "vitest";
import { parsePackageSource } from "../../src/resolver/sources.js";

describe("parsePackageSource", () => {
  it("parses github:owner/repo#ref", () => {
    const source = parsePackageSource("github:acme/x#v0.1.0");
    expect(source.kind).toBe("github");
    if (source.kind === "github") {
      expect(source.owner).toBe("acme");
      expect(source.repo).toBe("x");
      expect(source.ref).toBe("v0.1.0");
      expect(source.refType).toBe("tag");
    }
  });

  it("defaults github ref to HEAD", () => {
    const source = parsePackageSource("github:acme/x");
    expect(source.kind).toBe("github");
    if (source.kind === "github") {
      expect(source.ref).toBe("HEAD");
      expect(source.refType).toBe("branch");
    }
  });

  it("classifies commit-ish refs as immutable sha refs", () => {
    const source = parsePackageSource("github:acme/x#0123456789abcdef0123456789abcdef01234567");
    expect(source.kind).toBe("github");
    if (source.kind === "github") {
      expect(source.refType).toBe("sha");
    }
  });

  it("parses file:/abs/path", () => {
    const source = parsePackageSource("file:/tmp/pkg");
    expect(source.kind).toBe("file");
    if (source.kind === "file") {
      expect(source.path).toBe("/tmp/pkg");
    }
  });

  it("rejects unknown schemes", () => {
    expect(() => parsePackageSource("npm:foo")).toThrow();
  });

  it("rejects malformed github specs", () => {
    expect(() => parsePackageSource("github:acme")).toThrow();
  });
});
