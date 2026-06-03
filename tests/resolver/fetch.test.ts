import { Buffer } from "node:buffer";
import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzip } from "node:zlib";
import { promisify } from "node:util";
import { create as tarCreate } from "tar";
import { afterEach, describe, expect, it } from "vitest";
import {
  extractTarball,
  fetchTarballBytes,
  listGithubTags,
  materializeFileSource,
  resolveGithubCommit
} from "../../src/resolver/fetch.js";

const gzipAsync = promisify(gzip);

async function makeCleanTarball(): Promise<string> {
  const work = await mkdtemp(join(tmpdir(), "kpm-clean-"));
  const pkg = join(work, "pkg-root");
  await mkdir(pkg, { recursive: true });
  await writeFile(join(pkg, "README.md"), "# hi\n");
  const archive = join(work, "out.tgz");
  await tarCreate({ gzip: true, file: archive, cwd: work }, ["pkg-root"]);
  return archive;
}

describe("extractTarball", () => {
  it("extracts a clean tarball and returns the single top-level dir", async () => {
    const archive = await makeCleanTarball();
    const dest = await mkdtemp(join(tmpdir(), "kpm-extract-"));
    const root = await extractTarball(archive, dest);
    const entries = await readdir(root);
    expect(entries).toContain("README.md");
  });

  it("rejects archives containing path-escaping entries", async () => {
    const work = await mkdtemp(join(tmpdir(), "kpm-evil-"));
    const archive = join(work, "evil.tgz");
    await writeMaliciousTarball(archive);
    const dest = await mkdtemp(join(tmpdir(), "kpm-extract-"));
    await expect(extractTarball(archive, dest)).rejects.toThrow(/unsafe path/);
    await expect(readFile(join(dest, "..", "escape.md"), "utf8")).rejects.toThrow();
  });

  it("materializes file:// sources by returning the package directory", async () => {
    const work = await mkdtemp(join(tmpdir(), "kpm-file-"));
    await mkdir(join(work, "pkg"), { recursive: true });
    await writeFile(join(work, "pkg", "knowledge.json"), "{}\n");
    const materialized = await materializeFileSource({
      kind: "file",
      path: join(work, "pkg"),
      ref: "",
      refType: "sha",
      original: "file:..."
    });
    const entries = await readdir(materialized.rootPath);
    expect(entries).toContain("knowledge.json");
    expect(materialized.resolvedUrl).toBe(`file:${join(work, "pkg")}`);
  });
});

describe("github authentication", () => {
  const originalToken = process.env.GITHUB_TOKEN;
  const originalGh = process.env.GH_TOKEN;

  afterEach(() => {
    restoreEnv("GITHUB_TOKEN", originalToken);
    restoreEnv("GH_TOKEN", originalGh);
  });

  function recordingFetch(body: string) {
    const calls: Array<Record<string, string>> = [];
    const impl = (async (_url: unknown, options?: { headers?: Record<string, string> }) => {
      calls.push(options?.headers ?? {});
      return new Response(body, { status: 200 });
    }) as unknown as typeof fetch;
    return { calls, impl };
  }

  it("sends a Bearer Authorization header when GITHUB_TOKEN is set", async () => {
    process.env.GITHUB_TOKEN = "secret-token";
    delete process.env.GH_TOKEN;
    const { calls, impl } = recordingFetch("payload");
    await fetchTarballBytes("https://api.github.com/repos/o/r/tarball/abc1234", impl);
    expect(calls[0].authorization).toBe("Bearer secret-token");
    expect(calls[0]["user-agent"]).toBe("kpm/2");
  });

  it("does not send GitHub credentials to non-GitHub tarball URLs", async () => {
    process.env.GITHUB_TOKEN = "secret-token";
    delete process.env.GH_TOKEN;
    const { calls, impl } = recordingFetch("payload");
    await fetchTarballBytes("https://example.invalid/pkg.tgz", impl);
    expect(calls[0].authorization).toBeUndefined();
    expect(calls[0]["user-agent"]).toBe("kpm/2");
  });

  it("omits the Authorization header when no token is set", async () => {
    delete process.env.GITHUB_TOKEN;
    delete process.env.GH_TOKEN;
    const { calls, impl } = recordingFetch(JSON.stringify({ sha: "abc1234" }));
    await resolveGithubCommit("o", "r", "main", "src", impl);
    expect(calls[0].authorization).toBeUndefined();
    expect(calls[0]["user-agent"]).toBe("kpm/2");
  });

  it("falls back to GH_TOKEN when GITHUB_TOKEN is unset", async () => {
    delete process.env.GITHUB_TOKEN;
    process.env.GH_TOKEN = "gh-secret";
    const { calls, impl } = recordingFetch(JSON.stringify([{ name: "v1.0.0" }]));
    await listGithubTags("o", "r", impl);
    expect(calls[0].authorization).toBe("Bearer gh-secret");
  });

  it("falls back to GH_TOKEN when GITHUB_TOKEN is blank", async () => {
    process.env.GITHUB_TOKEN = "  \t";
    process.env.GH_TOKEN = "gh-secret";
    const { calls, impl } = recordingFetch(JSON.stringify([{ name: "v1.0.0" }]));
    await listGithubTags("o", "r", impl);
    expect(calls[0].authorization).toBe("Bearer gh-secret");
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

async function writeMaliciousTarball(path: string): Promise<void> {
  const body = Buffer.from("escape\n");
  const header = tarHeader("../escape.md", body.length);
  const end = Buffer.alloc(1024);
  const archive = Buffer.concat([header, body, Buffer.alloc(512 - body.length), end]);
  await writeFile(path, await gzipAsync(archive));
}

function tarHeader(name: string, size: number): Buffer {
  const header = Buffer.alloc(512, 0);
  header.write(name, 0, 100, "utf8");
  header.write("0000644\0", 100, 8, "ascii");
  header.write("0000000\0", 108, 8, "ascii");
  header.write("0000000\0", 116, 8, "ascii");
  header.write(size.toString(8).padStart(11, "0") + "\0", 124, 12, "ascii");
  header.write("00000000000\0", 136, 12, "ascii");
  header[156] = "0".charCodeAt(0);
  header.write("ustar\0", 257, 6, "ascii");
  header.write("00", 263, 2, "ascii");
  header.fill(" ", 148, 156);
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  header.write(checksum.toString(8).padStart(6, "0") + "\0 ", 148, 8, "ascii");
  return header;
}
