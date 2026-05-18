import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readLockfile, writeLockfile } from "../../src/manifest/lock.js";

describe("knowledge.lock", () => {
  it("returns an empty lockfile when missing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "kpm-lock-"));
    const lock = await readLockfile(dir);
    expect(lock.lockfileVersion).toBe(2);
    expect(lock.packages).toEqual({});
  });

  it("rejects a v1 lockfile", async () => {
    const dir = await mkdtemp(join(tmpdir(), "kpm-lock-"));
    await writeLockfile(dir, {
      lockfileVersion: 2,
      root: { name: "demo", version: "0.1.0" },
      packages: {}
    });
    const raw = JSON.parse(await readFile(join(dir, "knowledge.lock"), "utf8"));
    raw.lockfileVersion = 1;
    await writeFile(join(dir, "knowledge.lock"), JSON.stringify(raw));
    await expect(readLockfile(dir)).rejects.toThrow(/lockfileVersion/);
  });

  it("round-trips packages with full v2 schema", async () => {
    const dir = await mkdtemp(join(tmpdir(), "kpm-lock-"));
    await writeLockfile(dir, {
      lockfileVersion: 2,
      root: { name: "demo", version: "0.1.0" },
      packages: {
        "@acme/x": {
          version: "0.2.0",
          spec: "github:acme/x#v0.2.0",
          resolved: "https://codeload.github.com/acme/x/tar.gz/abc1234567890",
          ref: "v0.2.0",
          refType: "tag",
          commit: "abc1234567890",
          integrity: "sha256-ext",
          tarballIntegrity: "sha256-tar",
          dependencies: { "@acme/y": "0.1.0" },
          requestedBy: ["root"],
          overriddenSpecs: [{ spec: "github:acme/x#v0.1.0", requestedBy: "@acme/z" }]
        }
      }
    });
    const lock = await readLockfile(dir);
    const pkg = lock.packages["@acme/x"];
    expect(pkg.integrity).toBe("sha256-ext");
    expect(pkg.tarballIntegrity).toBe("sha256-tar");
    expect(pkg.commit).toBe("abc1234567890");
    expect(pkg.refType).toBe("tag");
    expect(pkg.dependencies["@acme/y"]).toBe("0.1.0");
    expect(pkg.requestedBy).toEqual(["root"]);
    expect(pkg.overriddenSpecs).toEqual([{ spec: "github:acme/x#v0.1.0", requestedBy: "@acme/z" }]);
  });
});
