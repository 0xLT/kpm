import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { buildBridgePrompt, runBridge } from "../../src/compose/bridge.js";
import { registerAdapter } from "../../src/compose/adapters/base.js";

describe("bridge", () => {
  it("buildBridgePrompt embeds vault, packages, marker frontmatter, and already-bridged list", () => {
    const prompt = buildBridgePrompt({
      vault: "wiki",
      packages: ["@fix/a", "@fix/b"],
      generator: "claude",
      timestamp: "2026-05-18T12:00:00Z",
      alreadyBridged: [{ sources: ["@fix/a", "@fix/b"], file: "bridges/state-management.md" }]
    });
    expect(prompt).toContain("wiki");
    expect(prompt).toContain("@fix/a");
    expect(prompt).toContain("@fix/b");
    expect(prompt).toContain("index.md");
    expect(prompt).toContain("kpm-generated: true");
    expect(prompt).toContain("kpm-generator: claude");
    expect(prompt).toContain("Already bridged");
    expect(prompt).toContain("state-management.md");
  });

  it("buildBridgePrompt shows no-bridge text when alreadyBridged is empty", () => {
    const prompt = buildBridgePrompt({
      vault: "wiki",
      packages: ["@fix/a"],
      generator: "codex",
      timestamp: "t",
      alreadyBridged: []
    });
    expect(prompt).toContain("No bridges have been authored yet");
  });

  it("runBridge invokes the configured adapter with cwd=vault and prompt on stdin", async () => {
    const calls: Array<{ command: string; args: string[]; cwd: string; stdin: string }> = [];
    registerAdapter({
      name: "stub-bridge",
      command: "true",
      args: () => ["x"],
      stdin: (ctx) => ctx.prompt
    });
    const project = await mkdtemp(join(tmpdir(), "kpm-bridge-"));
    await writeFile(join(project, "kpm.config.json"), JSON.stringify({ vault: "wiki", defaultCli: "claude" }));
    const fakeRun = vi.fn(async (cmd, args, opts) => {
      calls.push({ command: cmd, args, cwd: opts.cwd, stdin: opts.stdin });
      const { mkdir, writeFile: wf } = await import("node:fs/promises");
      await mkdir(opts.cwd, { recursive: true });
      await wf(join(opts.cwd, "index.md"), "---\nkpm-generated: true\n---\n# Index\n");
    });
    await runBridge(project, { cli: "stub-bridge", packages: ["@x/y"], runProcess: fakeRun });
    expect(calls[0].command).toBe("true");
    expect(calls[0].cwd).toBe(join(project, "wiki"));
    expect(calls[0].stdin).toContain("@x/y");
  });

  it("runBridge fails with a clear error when adapter exits 0 but index.md is missing", async () => {
    registerAdapter({ name: "stub-empty", command: "true", args: () => [], stdin: () => "" });
    const project = await mkdtemp(join(tmpdir(), "kpm-bridge-empty-"));
    await writeFile(join(project, "kpm.config.json"), JSON.stringify({ vault: "wiki", defaultCli: "claude" }));
    await expect(
      runBridge(project, {
        cli: "stub-empty",
        packages: ["@x/y"],
        runProcess: async () => {}
      })
    ).rejects.toThrow(/index\.md was not created/);
  });

  it("runBridge fails when an existing user-authored index.md lacks the marker", async () => {
    registerAdapter({ name: "stub-noop", command: "true", args: () => [], stdin: () => "" });
    const project = await mkdtemp(join(tmpdir(), "kpm-bridge-userindex-"));
    await writeFile(join(project, "kpm.config.json"), JSON.stringify({ vault: "wiki", defaultCli: "claude" }));
    const { mkdir } = await import("node:fs/promises");
    await mkdir(join(project, "wiki"), { recursive: true });
    await writeFile(join(project, "wiki", "index.md"), "# My own index\n");
    await expect(
      runBridge(project, { cli: "stub-noop", packages: ["@x/y"], runProcess: async () => {} })
    ).rejects.toThrow(/user-authored/);
  });
});
