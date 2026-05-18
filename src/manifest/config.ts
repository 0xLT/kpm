import type { KpmConfig } from "../types.js";
import { isSafeRelativePath } from "../paths.js";

const ALLOWED_CLIS = new Set<KpmConfig["defaultCli"]>(["claude", "codex", "gemini"]);

export function parseKpmConfig(raw: unknown): KpmConfig {
  const obj = isRecord(raw) ? raw : {};
  const vault = typeof obj.vault === "string" && obj.vault.length > 0 ? obj.vault : "wiki";
  if (!isSafeRelativePath(vault)) {
    throw new Error(`kpm.config.json: vault must be a safe relative path (got "${vault}")`);
  }

  const cli = typeof obj.defaultCli === "string" ? obj.defaultCli : "claude";
  if (!ALLOWED_CLIS.has(cli as KpmConfig["defaultCli"])) {
    throw new Error(`kpm.config.json: defaultCli must be one of ${[...ALLOWED_CLIS].join(", ")}`);
  }

  const auditRaw = isRecord(obj.audit) ? obj.audit : {};
  return {
    vault,
    defaultCli: cli as KpmConfig["defaultCli"],
    audit: { enabled: auditRaw.enabled === true }
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
