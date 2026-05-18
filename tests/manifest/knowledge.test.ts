import { describe, expect, it } from "vitest";
import { parseKnowledgeManifest, validateKnowledgeManifest } from "../../src/manifest/knowledge.js";

describe("knowledge.json", () => {
  it("parses a minimal valid manifest", () => {
    const raw = {
      name: "@acme/react-context",
      version: "0.1.0",
      type: "knowledge-package"
    };
    const manifest = parseKnowledgeManifest(raw);
    expect(manifest.name).toBe("@acme/react-context");
    expect(manifest.files).toEqual(["**/*.md"]);
    expect(manifest.entrypoint).toBe("README.md");
    expect(manifest.knowledgeDependencies).toEqual({});
  });

  it("rejects an invalid package name", () => {
    const result = validateKnowledgeManifest({
      name: "Bad Name",
      version: "0.1.0",
      type: "knowledge-package"
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(",")).toContain("name");
    }
  });

  it("rejects a non-semver version", () => {
    const result = validateKnowledgeManifest({
      name: "@acme/x",
      version: "v1",
      type: "knowledge-package"
    });
    expect(result.ok).toBe(false);
  });

  it("rejects unsafe file globs", () => {
    const result = validateKnowledgeManifest({
      name: "@acme/x",
      version: "0.1.0",
      type: "knowledge-package",
      files: ["../outside/**"]
    });
    expect(result.ok).toBe(false);
  });

  it("rejects entrypoint outside the package", () => {
    const result = validateKnowledgeManifest({
      name: "@acme/x",
      version: "0.1.0",
      type: "knowledge-package",
      entrypoint: "../README.md"
    });
    expect(result.ok).toBe(false);
  });

  it("rejects unknown top-level fields", () => {
    const result = validateKnowledgeManifest({
      name: "@acme/x",
      version: "0.1.0",
      type: "knowledge-package",
      exports: { ".": "./README.md" }
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(",")).toContain("exports");
    }
  });
});
