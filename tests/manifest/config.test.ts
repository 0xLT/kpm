import { describe, expect, it } from "vitest";
import { parseKpmConfig } from "../../src/manifest/config.js";

describe("kpm.config.json", () => {
  it("defaults vault to wiki and cli to claude", () => {
    const cfg = parseKpmConfig({});
    expect(cfg.vault).toBe("wiki");
    expect(cfg.defaultCli).toBe("claude");
    expect(cfg.audit.enabled).toBe(false);
  });

  it("rejects an unsafe vault path", () => {
    expect(() => parseKpmConfig({ vault: "../escape" })).toThrow();
  });

  it("rejects an unknown defaultCli", () => {
    expect(() => parseKpmConfig({ defaultCli: "gpt4" })).toThrow();
  });

  it("accepts a custom vault", () => {
    const cfg = parseKpmConfig({ vault: "docs/context", defaultCli: "codex" });
    expect(cfg.vault).toBe("docs/context");
    expect(cfg.defaultCli).toBe("codex");
  });
});
