import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { create as tarCreate } from "tar";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installFromLockfile, installNew } from "../../src/commands/install.js";

const fixture = (name: string) => resolve(new URL(`../fixtures/${name}`, import.meta.url).pathname);

async function makeProject(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "kpm-install-"));
  await writeFile(
    join(dir, "knowledge.json"),
    JSON.stringify({ name: "@me/root", version: "0.1.0", type: "knowledge-package" }, null, 2)
  );
  return dir;
}

describe("kpm install / add", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("hydrates knowledge_modules from a file: dep", async () => {
    const project = await makeProject();
    const dep = fixture("file-pkg-b");
    await installNew(project, `file:${dep}`);
    const installed = await readdir(join(project, "knowledge_modules", "@fix"));
    expect(installed).toContain("b");
    const lock = JSON.parse(await readFile(join(project, "knowledge.lock"), "utf8"));
    expect(lock.packages["@fix/b"]).toBeDefined();
  });

  it("hydrates transitively when a dep declares its own deps", async () => {
    const project = await makeProject();
    const dep = fixture("file-pkg-a");
    await installNew(project, `file:${dep}`);
    const a = await readdir(join(project, "knowledge_modules", "@fix", "a"));
    const b = await readdir(join(project, "knowledge_modules", "@fix", "b"));
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
  });

  it("installFromLockfile keeps the lockfile stable when packages already match", async () => {
    const project = await makeProject();
    const dep = fixture("file-pkg-b");
    await installNew(project, `file:${dep}`);
    const before = await readFile(join(project, "knowledge.lock"), "utf8");
    await installFromLockfile(project);
    const after = await readFile(join(project, "knowledge.lock"), "utf8");
    expect(after).toBe(before);
  });

  it("installFromLockfile hydrates from knowledge.lock instead of re-resolving knowledge.json", async () => {
    const project = await makeProject();
    const dep = fixture("file-pkg-b");
    const depAlt = fixture("file-pkg-b-alt");
    await installNew(project, `file:${dep}`);
    const locked = await readFile(join(project, "knowledge.lock"), "utf8");

    await writeFile(
      join(project, "knowledge.json"),
      JSON.stringify({
        name: "@me/root",
        version: "0.1.0",
        type: "knowledge-package",
        knowledgeDependencies: { "@fix/b": `file:${depAlt}` }
      })
    );
    await rm(join(project, "knowledge_modules"), { recursive: true, force: true });

    await installFromLockfile(project);
    const installedManifest = JSON.parse(
      await readFile(join(project, "knowledge_modules", "@fix", "b", "knowledge.json"), "utf8")
    );
    expect(installedManifest.version).toBe("0.1.0");
    const after = await readFile(join(project, "knowledge.lock"), "utf8");
    expect(after).toBe(locked);
  });

  it("writes semver GitHub dependencies to the lockfile with concrete tag and commit metadata", async () => {
    const project = await makeProject();
    const source = "github:team/solana#semver:^0.2.0";
    const commit = "0123456789abcdef0123456789abcdef01234567";
    const tarball = await makePackageTarball("@team/solana", "0.2.4");
    const requests = stubGithubFetch(tarball, {
      tags: ["v0.2.0", "v0.2.4", "v0.3.0"],
      commits: { "v0.2.4": commit }
    });

    await installNew(project, source);

    const lock = JSON.parse(await readFile(join(project, "knowledge.lock"), "utf8"));
    const entry = lock.packages["@team/solana"];
    expect(entry.spec).toBe(source);
    expect(entry.ref).toBe("v0.2.4");
    expect(entry.refType).toBe("tag");
    expect(entry.commit).toBe(commit);
    expect(entry.resolved).toBe(`https://api.github.com/repos/team/solana/tarball/${commit}`);
    expect(entry.tarballIntegrity).toBe(sha256(tarball));
    expect(entry.integrity).toMatch(/^sha256-/);
    expect(requests.some((url) => url.endsWith(`/tarball/${commit}`))).toBe(true);
  });

  it("installFromLockfile does not list tags or re-resolve a semver dependency", async () => {
    const project = await makeProject();
    const commit = "abcdefabcdefabcdefabcdefabcdefabcdefabcd";
    const tarball = await makePackageTarball("@team/solana", "0.2.4");
    await writeFile(
      join(project, "knowledge.json"),
      JSON.stringify({
        name: "@me/root",
        version: "0.1.0",
        type: "knowledge-package",
        knowledgeDependencies: { "@team/solana": "github:team/solana#semver:^0.2.0" }
      })
    );
    await writeFile(
      join(project, "knowledge.lock"),
      JSON.stringify(
        {
          lockfileVersion: 2,
          root: { name: "@me/root", version: "0.1.0" },
          packages: {
            "@team/solana": {
              version: "0.2.4",
              spec: "github:team/solana#semver:^0.2.0",
              resolved: `https://api.github.com/repos/team/solana/tarball/${commit}`,
              ref: "v0.2.4",
              refType: "tag",
              commit,
              integrity: "",
              tarballIntegrity: sha256(tarball),
              dependencies: {},
              requestedBy: ["root"]
            }
          }
        },
        null,
        2
      )
    );
    const requests = stubGithubFetch(tarball, { tags: [], commits: {} });

    await installFromLockfile(project);

    expect(requests).toEqual([`https://api.github.com/repos/team/solana/tarball/${commit}`]);
    const installedManifest = JSON.parse(
      await readFile(join(project, "knowledge_modules", "@team", "solana", "knowledge.json"), "utf8")
    );
    expect(installedManifest.version).toBe("0.2.4");
  });

  it("fails when a semver-resolved tag does not match the package manifest version", async () => {
    const project = await makeProject();
    const commit = "fedcbafedcbafedcbafedcbafedcbafedcbafedc";
    const tarball = await makePackageTarball("@team/solana", "0.2.3");
    stubGithubFetch(tarball, {
      tags: ["v0.2.4"],
      commits: { "v0.2.4": commit }
    });

    await expect(installNew(project, "github:team/solana#semver:^0.2.0")).rejects.toThrow(
      /@team\/solana: ref v0\.2\.4 does not match manifest version 0\.2\.3/
    );
  });
});

async function makePackageTarball(name: string, version: string): Promise<Buffer> {
  const work = await mkdtemp(join(tmpdir(), "kpm-gh-pkg-"));
  const root = join(work, "pkg-root");
  await mkdir(root, { recursive: true });
  await writeFile(
    join(root, "knowledge.json"),
    JSON.stringify({ name, version, type: "knowledge-package", files: ["**/*.md"], entrypoint: "README.md" }, null, 2)
  );
  await writeFile(join(root, "README.md"), `# ${name}\n`);
  const archive = join(work, "package.tgz");
  await tarCreate({ gzip: true, file: archive, cwd: work }, ["pkg-root"]);
  return readFile(archive);
}

function stubGithubFetch(tarball: Buffer, options: { tags: string[]; commits: Record<string, string> }): string[] {
  const requests: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL) => {
      const href = String(url);
      requests.push(href);
      if (href.includes("/tags?")) {
        return new Response(JSON.stringify(options.tags.map((name) => ({ name }))), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      const commitRef = href.match(/\/commits\/([^/?#]+)$/)?.[1];
      if (commitRef) {
        const sha = options.commits[decodeURIComponent(commitRef)];
        if (!sha) {
          return new Response("not found", { status: 404 });
        }
        return new Response(JSON.stringify({ sha }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      if (href.includes("/tarball/")) {
        return new Response(tarball, { status: 200 });
      }
      return new Response(`unexpected url: ${href}`, { status: 500 });
    })
  );
  return requests;
}

function sha256(bytes: Buffer): string {
  return `sha256-${createHash("sha256").update(bytes).digest("base64")}`;
}
