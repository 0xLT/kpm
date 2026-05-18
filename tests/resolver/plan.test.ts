import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildInstallPlan } from "../../src/resolver/plan.js";

const fixture = (name: string) => resolve(new URL(`../fixtures/${name}`, import.meta.url).pathname);

describe("buildInstallPlan", () => {
  it("walks transitive file: dependencies", async () => {
    const fixA = fixture("file-pkg-a");
    const plan = await buildInstallPlan([{ name: "@fix/a", source: `file:${fixA}`, requestedBy: "root" }]);
    const names = [...plan.singletons.keys()].sort();
    expect(names).toEqual(["@fix/a", "@fix/b"]);
  });

  it("reconciles every transitive request before returning the singleton plan", async () => {
    const fixA = fixture("file-pkg-a");
    const fixC = fixture("file-pkg-c");
    await expect(
      buildInstallPlan([
        { name: "@fix/a", source: `file:${fixA}`, requestedBy: "root" },
        { name: "@fix/c", source: `file:${fixC}`, requestedBy: "root" }
      ])
    ).rejects.toThrow(/singleton conflict/);
  });

  it("preserves root overrides discovered after the transitive walk", async () => {
    const fixA = fixture("file-pkg-a");
    const fixB = fixture("file-pkg-b");
    const fixC = fixture("file-pkg-c");
    const fixBAlt = fixture("file-pkg-b-alt");
    const plan = await buildInstallPlan([
      { name: "@fix/a", source: `file:${fixA}`, requestedBy: "root" },
      { name: "@fix/b", source: `file:${fixB}`, requestedBy: "root" },
      { name: "@fix/c", source: `file:${fixC}`, requestedBy: "root" }
    ]);
    const b = plan.singletons.get("@fix/b")!;
    expect(b.manifest.version).toBe("0.1.0");
    expect(b.singleton.overriddenSpecs).toEqual([{ spec: `file:${fixBAlt}`, requestedBy: "@fix/c" }]);
  });
});
