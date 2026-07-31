/**
 * Stamps a build identifier the running app can compare itself against.
 *
 * Writes public/version.json before the build, so the file is served as a static
 * asset. next.config.ts reads the same file and bakes the id into the bundle.
 * That pairing is the whole mechanism: the deployed JSON says what the server
 * has, the baked constant says what this browser is running, and any difference
 * means an update is waiting.
 *
 * Generated rather than hand-maintained because a version someone has to remember
 * to bump is a version that silently stops being bumped.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const buildId = process.env.BUILD_ID ?? String(Date.now());
const dir = join(process.cwd(), "public");

mkdirSync(dir, { recursive: true });
writeFileSync(
  join(dir, "version.json"),
  JSON.stringify({ buildId, builtAt: new Date().toISOString() }, null, 2) + "\n");

console.log(`build id ${buildId}`);
