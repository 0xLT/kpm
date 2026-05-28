import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

describe("GitHub issue templates", () => {
  it("uses string values for dropdown options", async () => {
    const templateDir = join(process.cwd(), ".github", "ISSUE_TEMPLATE");
    const files = (await readdir(templateDir)).filter((file) => file.endsWith(".yml"));

    for (const file of files) {
      const content = await readFile(join(templateDir, file), "utf8");
      const template = parse(content) as {
        body?: Array<{ type?: string; attributes?: { options?: unknown[] } }>;
      };

      for (const field of template.body ?? []) {
        if (field.type !== "dropdown") {
          continue;
        }

        for (const option of field.attributes?.options ?? []) {
          expect(typeof option, `${file} dropdown option ${JSON.stringify(option)}`).toBe("string");
        }
      }
    }
  });
});
