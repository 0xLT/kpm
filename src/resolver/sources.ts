export type PackageSource =
  | {
      kind: "github";
      owner: string;
      repo: string;
      ref: string;
      refType: "tag" | "branch" | "sha" | "semver";
      original: string;
    }
  | {
      kind: "file";
      path: string;
      ref: "";
      refType: "sha";
      original: string;
    };

export function parsePackageSource(spec: string): PackageSource {
  if (spec.startsWith("github:")) {
    const body = spec.slice("github:".length);
    const [repoPart, ref = "HEAD"] = splitOnce(body, "#");
    const [owner, repo, ...rest] = repoPart.split("/");
    if (!owner || !repo || rest.length > 0) {
      throw new Error(`Invalid GitHub source "${spec}". Expected github:owner/repo[#ref]`);
    }
    const parsedRef = parseGithubRef(ref);
    return {
      kind: "github",
      owner,
      repo,
      ref: parsedRef.ref,
      refType: parsedRef.refType,
      original: spec
    };
  }

  if (spec.startsWith("file:")) {
    const path = spec.slice("file:".length);
    if (!path) {
      throw new Error(`Invalid file source "${spec}". Expected file:/path/to/package`);
    }
    return { kind: "file", path, ref: "", refType: "sha", original: spec };
  }

  throw new Error(`Unsupported package source "${spec}". Use github:owner/repo[#ref] or file:/path/to/package`);
}

function parseGithubRef(ref: string): { ref: string; refType: "tag" | "branch" | "sha" | "semver" } {
  if (ref.startsWith("semver:")) {
    const range = ref.slice("semver:".length);
    if (range.trim() === "") {
      throw new Error(`Invalid GitHub semver source. Expected github:owner/repo#semver:<range>`);
    }
    return { ref: range, refType: "semver" };
  }
  return { ref, refType: inferRefType(ref) };
}

function inferRefType(ref: string): "tag" | "branch" | "sha" {
  if (/^[0-9a-f]{7,40}$/i.test(ref)) {
    return "sha";
  }
  if (/^v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(ref)) {
    return "tag";
  }
  return "branch";
}

function splitOnce(value: string, separator: string): [string, string | undefined] {
  const index = value.indexOf(separator);
  if (index === -1) {
    return [value, undefined];
  }
  return [value.slice(0, index), value.slice(index + separator.length)];
}
