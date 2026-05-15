export type PackageSource =
  | {
      kind: "github";
      owner: string;
      repo: string;
      ref: string;
      original: string;
      tarballUrl: string;
    }
  | {
      kind: "file";
      path: string;
      original: string;
    };

export function parsePackageSource(spec: string): PackageSource {
  if (spec.startsWith("github:")) {
    const body = spec.slice("github:".length);
    const [repoPart, ref = "main"] = splitOnce(body, "#");
    const [owner, repo, ...rest] = repoPart.split("/");
    if (!owner || !repo || rest.length > 0) {
      throw new Error(`Invalid GitHub source "${spec}". Expected github:owner/repo#ref`);
    }
    return {
      kind: "github",
      owner,
      repo,
      ref,
      original: spec,
      tarballUrl: `https://api.github.com/repos/${owner}/${repo}/tarball/${ref}`
    };
  }

  if (spec.startsWith("file:")) {
    const path = spec.slice("file:".length);
    if (!path) {
      throw new Error(`Invalid file source "${spec}". Expected file:/path/to/package`);
    }
    return { kind: "file", path, original: spec };
  }

  throw new Error(`Unsupported package source "${spec}". Use github:owner/repo#ref or file:/path/to/package`);
}

function splitOnce(value: string, separator: string): [string, string | undefined] {
  const index = value.indexOf(separator);
  if (index === -1) {
    return [value, undefined];
  }
  return [value.slice(0, index), value.slice(index + separator.length)];
}
