#!/usr/bin/env node
/**
 * The owner's command line.
 *
 * Everything here can also be done from the panel in the app, except the one
 * thing that matters most: making somebody the owner. That stays here because
 * it is the only operation that turns a guest into someone who can delete other
 * people's data, and it should not be reachable by any form in any browser.
 *
 * It reads and writes the data directory rather than calling the server over
 * HTTP. Two reasons. It works when the server is wedged or will not start,
 * which is exactly when a way in is wanted. And it needs no password, because
 * standing in front of the files is already more authority than any password
 * grants.
 *
 * The data usually lives in a named docker volume rather than on your disk, so
 * this normally runs inside the container:
 *
 *   docker compose --profile sync exec sync node server/admin.mjs list
 *
 * Commands:
 *
 *   invite --user NAME [--days 7] [--base https://bench.wtf.si]
 *   list
 *   invites
 *   revoke NAME            removes the account and its blob, permanently
 *   cancel ID              cancels an unused invitation
 *   unlock NAME            clears a lockout after too many wrong passwords
 *   promote NAME           makes NAME an owner
 *   demote NAME            takes it away, refused for the last owner
 */

import { randomBytes, createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { inviteExpiry, usernameOk } from "./policy.mjs";

const DATA_DIR = process.env.BENCH_DATA_DIR ?? join(dirname(fileURLToPath(import.meta.url)), "data");
mkdirSync(DATA_DIR, { recursive: true });

const accountPath = (u) => join(DATA_DIR, `${encodeURIComponent(u)}.account.json`);
const blobPath = (u) => join(DATA_DIR, `${encodeURIComponent(u)}.blob.json`);
const invitePath = (id) => join(DATA_DIR, `${encodeURIComponent(id)}.invite.json`);

const readJson = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null);

function writeAtomic(path, value) {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2));
  renameSync(tmp, path);
}

const names = (suffix) =>
  readdirSync(DATA_DIR)
    .filter((f) => f.endsWith(suffix))
    .map((f) => decodeURIComponent(f.slice(0, -suffix.length)));

const accounts = () => names(".account.json");
const invites = () => names(".invite.json");

const when = (ms) => (ms ? new Date(ms).toISOString().replace("T", " ").slice(0, 16) : "never");
const kb = (n) => (n > 0 ? `${Math.round(n / 1024)} kB` : "empty");

function flags(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    out[key] = next && !next.startsWith("--") ? next : true;
  }
  return out;
}

function die(message) {
  console.error(message);
  process.exit(1);
}

// ---------------------------------------------------------------------------

const USAGE = `Usage: node server/admin.mjs COMMAND

  invite --user NAME [--days 7] [--base https://bench.wtf.si]
  list                    accounts, sizes and lockouts
  invites                 outstanding invitations
  revoke NAME             removes the account and its blob, permanently
  cancel ID               cancels an unused invitation
  unlock NAME             clears a lockout after too many wrong passwords
  promote NAME            makes NAME an owner
  demote NAME             takes it away, refused for the last owner

The data is usually in a docker volume, so this normally runs in the container:
  docker compose --profile sync exec sync node server/admin.mjs list`;

const [command, ...rest] = process.argv.slice(2);
const opts = flags(rest);
/** The first bare word, for commands that take a name rather than a flag. */
const first = rest.find((a) => !a.startsWith("--")) ?? "";

switch (command) {
  case "invite": {
    const user = String(opts.user === true ? "" : opts.user ?? first);
    if (!usernameOk(user)) {
      die("Usage: invite --user NAME\n" +
        "A username is 2 to 32 characters: lowercase letters, digits, dot, dash, underscore.");
    }
    if (existsSync(accountPath(user))) die(`There is already an account called ${user}.`);

    const now = Date.now();
    const id = randomBytes(6).toString("hex");
    const token = randomBytes(18).toString("base64url");
    const expiresAt = inviteExpiry(now, opts.days);

    writeAtomic(invitePath(id), {
      id,
      username: user,
      // Only the hash is kept, so this token cannot be recovered from the disk
      // later. Lose the link and you cancel this invitation and make another.
      tokenHash: createHash("sha256").update(token).digest("hex"),
      createdAt: now,
      createdBy: "admin.mjs",
      expiresAt,
      usedAt: null,
      usedBy: null,
    });

    const base = typeof opts.base === "string" ? opts.base.replace(/\/+$/, "") : "";
    console.log("");
    console.log(`Invitation for "${user}", good until ${when(expiresAt)} UTC:`);
    console.log("");
    console.log(`    ${base}/login?invite=${token}`);
    console.log("");
    console.log("Send it over something private. Whoever opens it picks the password,");
    console.log("and nobody else ever learns it, you included. It works once.");
    console.log(`Cancel it with: node server/admin.mjs cancel ${id}`);
    console.log("");
    break;
  }

  case "list": {
    const rows = accounts().map((u) => {
      const a = readJson(accountPath(u));
      const b = readJson(blobPath(u));
      const locked = (a?.gate?.lockedUntil ?? 0) > Date.now();
      return {
        account: u + (a?.admin ? " (owner)" : ""),
        created: when(a?.createdAt),
        "last sync": when(b?.receivedAt),
        size: kb(b ? JSON.stringify(b).length : 0),
        locked: locked ? `until ${when(a.gate.lockedUntil)}` : "no",
      };
    });
    if (!rows.length) console.log("No accounts yet.");
    else console.table(rows);
    break;
  }

  case "invites": {
    const rows = invites().map((id) => {
      const i = readJson(invitePath(id));
      return {
        id,
        for: i?.username,
        expires: when(i?.expiresAt),
        used: i?.usedAt ? `${when(i.usedAt)} by ${i.usedBy}` : "no",
      };
    });
    if (!rows.length) console.log("No invitations.");
    else console.table(rows);
    break;
  }

  case "revoke": {
    const user = first;
    if (!existsSync(accountPath(user))) die(`No account called ${user}.`);
    rmSync(accountPath(user));
    rmSync(blobPath(user), { force: true });
    // Said plainly, because it is true and there is no undo behind it.
    console.log(`Removed ${user}. Their stored history is gone.`);
    break;
  }

  case "cancel": {
    const id = first;
    if (!existsSync(invitePath(id))) die(`No invitation with id ${id}.`);
    rmSync(invitePath(id));
    console.log(`Cancelled invitation ${id}.`);
    break;
  }

  case "unlock": {
    const user = first;
    const a = readJson(accountPath(user));
    if (!a) die(`No account called ${user}.`);
    writeAtomic(accountPath(user), {
      ...a,
      gate: { failures: 0, lastFailureAt: 0, lockedUntil: 0, lockCount: 0 },
    });
    console.log(`${user} can try again.`);
    break;
  }

  case "promote":
  case "demote": {
    const user = first;
    const a = readJson(accountPath(user));
    if (!a) die(`No account called ${user}.`);

    if (command === "demote") {
      const owners = accounts().filter((u) => readJson(accountPath(u))?.admin === true);
      // A server with no owner has no way to make one except this command, and
      // this command needs the files, which is a bad place to be locked out to.
      if (owners.length <= 1 && a.admin) die("That is the last owner. Promote someone else first.");
    }

    writeAtomic(accountPath(user), { ...a, admin: command === "promote" });
    console.log(`${user} is ${command === "promote" ? "now" : "no longer"} an owner.`);
    break;
  }

  default:
    console.log(USAGE);
    process.exit(command ? 1 : 0);
}
