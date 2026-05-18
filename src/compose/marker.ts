import { readFile } from "node:fs/promises";
import { fileExists } from "../files.js";
import { parseNote } from "../markdown/parse.js";

export async function isKpmGenerated(filePath: string): Promise<boolean> {
  if (!(await fileExists(filePath))) {
    return false;
  }
  const note = parseNote(filePath, await readFile(filePath, "utf8"));
  return note.frontmatter["kpm-generated"] === true;
}

export async function readBridgeSources(filePath: string): Promise<string[] | null> {
  if (!(await fileExists(filePath))) {
    return null;
  }
  const note = parseNote(filePath, await readFile(filePath, "utf8"));
  if (note.frontmatter["kpm-generated"] !== true) {
    return null;
  }
  const sources = note.frontmatter["kpm-sources"];
  return Array.isArray(sources) ? sources.filter((value): value is string => typeof value === "string") : null;
}
