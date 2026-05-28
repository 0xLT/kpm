import { describe, expect, it } from "vitest";
import { listGithubTags, resolveHighestMatchingSemverTag } from "../../src/resolver/fetch.js";

describe("listGithubTags", () => {
  it("fetches paginated GitHub tag results", async () => {
    const requests: string[] = [];
    const tags = await listGithubTags("acme", "x", async (url) => {
      const href = String(url);
      requests.push(href);
      if (href.endsWith("/tags?per_page=100")) {
        return new Response(JSON.stringify([{ name: "v1.0.0" }]), {
          status: 200,
          headers: {
            "content-type": "application/json",
            link: '<https://api.github.com/repos/acme/x/tags?per_page=100&page=2>; rel="next"'
          }
        });
      }
      return new Response(JSON.stringify([{ name: "v1.1.0" }]), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    });

    expect(requests).toEqual([
      "https://api.github.com/repos/acme/x/tags?per_page=100",
      "https://api.github.com/repos/acme/x/tags?per_page=100&page=2"
    ]);
    expect(tags).toEqual([{ name: "v1.0.0" }, { name: "v1.1.0" }]);
  });
});

describe("resolveHighestMatchingSemverTag", () => {
  it("resolves caret ranges to the highest matching tag", () => {
    expect(
      resolveHighestMatchingSemverTag(
        [{ name: "v1.0.0" }, { name: "v1.2.0" }, { name: "v1.2.3" }, { name: "v2.0.0" }],
        "^1.2.0",
        "github:acme/x#semver:^1.2.0"
      )
    ).toBe("v1.2.3");
  });

  it("accepts tags with or without a leading v", () => {
    expect(
      resolveHighestMatchingSemverTag(
        [{ name: "1.2.0" }, { name: "1.2.4" }, { name: "v1.3.0" }],
        "~1.2.0",
        "github:acme/x#semver:~1.2.0"
      )
    ).toBe("1.2.4");
  });

  it("ignores invalid semver tags", () => {
    expect(
      resolveHighestMatchingSemverTag(
        [{ name: "latest" }, { name: "release-1.2.3" }, { name: "v1.2.2" }],
        "^1.2.0",
        "github:acme/x#semver:^1.2.0"
      )
    ).toBe("v1.2.2");
  });

  it("throws a helpful error when no tag satisfies the range", () => {
    expect(() =>
      resolveHighestMatchingSemverTag([{ name: "v1.0.0" }, { name: "v2.0.0" }], "^1.2.0", "github:acme/x#semver:^1.2.0")
    ).toThrow(/No GitHub tag satisfies semver range "\^1\.2\.0" for github:acme\/x#semver:\^1\.2\.0/);
  });

  it("uses semver package defaults for prereleases", () => {
    expect(
      resolveHighestMatchingSemverTag(
        [{ name: "v1.2.3-beta.1" }, { name: "v1.2.2" }],
        "^1.2.0",
        "github:acme/x#semver:^1.2.0"
      )
    ).toBe("v1.2.2");
  });
});
