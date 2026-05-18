import type { PackageSource } from "./sources.js";

const warned = new Set<string>();

export function warnMutableRef(source: PackageSource, callerLabel: string, packageName?: string): void {
  if (source.kind !== "github" || source.refType !== "branch") {
    return;
  }
  const key = `${callerLabel}:${packageName ?? source.original}`;
  if (warned.has(key)) {
    return;
  }
  warned.add(key);
  console.warn(`warning: ${callerLabel} using mutable ref ${packageName ? `${packageName} ` : ""}${source.original}`);
}
