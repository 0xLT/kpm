import { Buffer } from "node:buffer";
import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzip } from "node:zlib";
import { promisify } from "node:util";
import { create as tarCreate } from "tar";
import { describe, expect, it } from "vitest";
import { extractTarball, materializeFileSource } from "../../src/resolver/fetch.js";

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
