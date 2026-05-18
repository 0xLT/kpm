import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { audit } from "../../src/commands/audit.js";

describe("audit (beta)", () => {
  it("flags non-markdown files inside installed packages", async () => {
    const project = await mkdtemp(join(tmpdir(), "kpm-audit-"));
    const pkg = join(project, "knowledge_modules", "@x", "y");
    await mkdir(pkg, { recursive: true });
    await writeFile(join(pkg, "knowledge.json"), JSON.stringify({ name: "@x/y", version: "0.1.0", type: "knowledge-package" }));
    await writeFile(join(pkg, "README.md"), "# y\n");
    await writeFile(join(pkg, "weird.bin"), "binary-looking");
    const report = await audit(project);
    expect(report.findings.some((finding) => finding.message.includes("weird.bin"))).toBe(true);
    expect(report.disclaimer).toContain("not rely");
  });
});
