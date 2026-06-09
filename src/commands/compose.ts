import { rm } from "node:fs/promises";
import { join } from "node:path";
import { copyAndRewrite } from "../compose/copy.js";
import { runBridge } from "../compose/bridge.js";
import { readKpmConfig } from "../manifest/config.js";
import { readLockfile } from "../manifest/lock.js";
import { errorMessage } from "../util.js";

export type ComposeOptions = {
  fresh?: boolean;
  bridge?: boolean;
  cli?: string;
  log?: (line: string) => void;
};

export async function compose(projectRoot: string, options: ComposeOptions = {}): Promise<void> {
  const log = options.log ?? ((line: string) => process.stdout.write(`${line}\n`));
  const cfg = await readKpmConfig(projectRoot);
  const vaultPath = join(projectRoot, cfg.vault);

  if (options.fresh) {
    await rm(vaultPath, { recursive: true, force: true });
  }

  await copyAndRewrite(projectRoot, cfg.vault);
  log(`copy phase complete -> ${cfg.vault}/`);

  if (options.bridge === false) {
    log("compose complete (bridge phase skipped)");
    return;
  }

  const lock = await readLockfile(projectRoot);
  const packages = Object.keys(lock.packages);
  if (packages.length === 0) {
    log("compose complete (no installed packages; bridge skipped)");
    return;
  }

  try {
    await runBridge(projectRoot, { cli: options.cli, packages });
    log("compose complete");
  } catch (error) {
    const message = errorMessage(error);
    log("compose failed at bridge phase - re-run `kpm compose` to retry.");
    log(`  ${message}`);
    throw error;
  }
}
