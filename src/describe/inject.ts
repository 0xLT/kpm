import { readFile, writeFile } from "node:fs/promises";
import { fileExists } from "../files.js";

const BEGIN = "<!-- BEGIN KPM-CONTEXT -->";
const END = "<!-- END KPM-CONTEXT -->";

export async function injectDescription(targetPath: string, body: string): Promise<void> {
  const block = `${BEGIN}\n${body.trim()}\n${END}`;
  if (!(await fileExists(targetPath))) {
    await writeFile(targetPath, `${block}\n`);
    return;
  }

  const existing = await readFile(targetPath, "utf8");
  const beginIdx = existing.indexOf(BEGIN);
  const endIdx = existing.indexOf(END);
  if (beginIdx === -1 || endIdx === -1 || endIdx < beginIdx) {
    await writeFile(targetPath, `${existing.replace(/\s*$/, "")}\n\n${block}\n`);
    return;
  }

  const head = existing.slice(0, beginIdx);
  const tail = existing.slice(endIdx + END.length);
  await writeFile(targetPath, `${head}${block}${tail}`);
}
