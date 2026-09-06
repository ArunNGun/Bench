/**
 * Bench sync server.
 *
 * Holds one sealed blob per account and hands it back to whoever proves they
 * know the password. It cannot read what it stores: the browser encrypts before
 * uploading, and the value used to log in is derived from the same password by
 * a different label, so possessing it reveals nothing about the key.
 *
 * That is the whole design, and it is why this file is short. There is no
 * schema, because the app's state is a single JSON document. There are no
 * dependencies, because node:http and node:crypto already do everything needed,
 * and a project whose selling point is that you can read what it does should
 * not ask you to read a tree of packages first.
 *
 *   POST /api/register  { username, authSecret, salt, setupToken }   the first account
 *                       { username, authSecret, salt, invite }       every one after it
 *   GET  /api/salt      ?username=                      before the password is asked for
 *   POST /api/login     { username, authSecret }        sets a session cookie
 *   POST /api/logout
 *   GET  /api/session                                   200 or 401, for the proxy
 *   GET  /login         ?invite=                        sign in, or take up an invitation
 *   GET  /api/data                                      the sealed envelope, or 204
 *   PUT  /api/data      { envelope, updatedAt, ifMatch }  409 if the copy moved
 *
 * And, for whoever owns the server:
 *
 *   GET  /api/accounts                                  names and sizes, never contents
 *   GET  /api/invites
 *   POST /api/invites   { username, days }              the token is shown once
 *   POST /api/invites/:id/revoke
 *   POST /api/accounts/:username/remove  { authSecret } asks for the password again
 *
 * Run: node server/server.mjs
 * Env: PORT, BENCH_DATA_DIR, BENCH_SESSION_SECRET, BENCH_ORIGIN
 */

import { createServer } from "node:http";
import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, renameSync, rmSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FLOOR_MS,
  allowedOrigin,
  clearGate,
  countFailure,
  gateOf,
  inviteExpiry,
  inviteProblem,
  lockedFor,
  parseOrigins,
  retryAfterSeconds,
  usernameOk,
} from "./policy.mjs";

const PORT = Number(process.env.PORT ?? 8787);
const DATA_DIR = process.env.BENCH_DATA_DIR ?? join(dirname(fileURLToPath(import.meta.url)), "data");
const ORIGINS = parseOrigins(process.env.BENCH_ORIGIN);

/**
 * Sessions are signed rather than stored, so a restart does not log you out and
 * there is no table to grow. Generated when absent, which is convenient for a
 * first run and useless for a real deployment: set it, or every restart
 * invalidates every cookie.
 */
const SESSION_SECRET = process.env.BENCH_SESSION_SECRET ?? randomBytes(32).toString("hex");

const SESSION_HOURS = 24 * 30;

mkdirSync(DATA_DIR, { recursive: true });

const accountsExist = () => readdirSync(DATA_DIR).some((f) => f.endsWith(".account.json"));

/**
 * A one-time token, printed at startup while the server has no accounts.
 *
 * It makes the first account, and only the first. Between the moment this
 * starts listening and the moment you register, whoever finds the port could
 * otherwise claim it instead, and on a machine reachable from the internet that
 * window is the whole risk. Requiring a value that only appears in the server's
 * own log closes it, at the cost of one copied string.
 *
 * Regenerated on every boot, so a token seen once is useless after a restart,
 * and never written to disk.
 *
 * Everyone after the first arrives by invitation, which is a different door
 * with the same property: it cannot be walked through by someone who was not
 * handed something first.
 */
const SETUP_TOKEN = accountsExist() ? null : randomBytes(16).toString("hex");

const accountPath = (username) => join(DATA_DIR, `${encodeURIComponent(username)}.account.json`);
const blobPath = (username) => join(DATA_DIR, `${encodeURIComponent(username)}.blob.json`);
const invitePath = (id) => join(DATA_DIR, `${encodeURIComponent(id)}.invite.json`);

const listFiles = (suffix) =>
  readdirSync(DATA_DIR)
    .filter((f) => f.endsWith(suffix))
    .map((f) => decodeURIComponent(f.slice(0, -suffix.length)));

const listAccounts = () => listFiles(".account.json");
const listInvites = () => listFiles(".invite.json");

/**
 * Write by rename, which is atomic on the same filesystem.
 *
 * Writing in place means a crash halfway through leaves a truncated file, and
 * the file in question is the only copy of someone's dose history.
 */
function writeAtomic(path, value) {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2));
  renameSync(tmp, path);
}

const readJson = (path) => (existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null);

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

/**
 * The auth secret is already the output of 600k PBKDF2 iterations in the
 * browser, so it is not a password and does not need stretching for that
 * reason. It is hashed anyway, so that a stolen data directory does not hand
 * over the ability to log in as anyone.
 */
function hashSecret(authSecret, salt) {
  return scryptSync(authSecret, salt, 64).toString("hex");
}

function secretMatches(authSecret, account) {
  const attempt = Buffer.from(hashSecret(authSecret, account.hashSalt), "hex");
  const stored = Buffer.from(account.authHash, "hex");
  // Constant time, so the comparison does not leak how much of it was right.
  return attempt.length === stored.length && timingSafeEqual(attempt, stored);
}

/**
 * Invitation tokens are hashed with plain SHA-256 and no stretching.
 *
 * Not an oversight. Stretching exists because passwords are short and chosen by
 * people, so a stolen hash can be attacked with a dictionary. This token is 144
 * bits from the system's random source, which has no dictionary and no pattern,
 * so the only attack left is guessing the whole space. Hashing it at all is for
 * the case where the data directory is read: a token in the clear on disk would
 * be a live invitation to anyone who looked.
 */
const hashToken = (token) => createHash("sha256").update(String(token)).digest("hex");

function tokenMatches(token, invite) {
  const attempt = Buffer.from(hashToken(token), "hex");
  const stored = Buffer.from(String(invite?.tokenHash ?? ""), "hex");
  return attempt.length === stored.length && timingSafeEqual(attempt, stored);
}

/** Find the invitation a token opens, or null. */
function findInvite(token) {
  if (!token) return null;
  for (const id of listInvites()) {
    const invite = readJson(invitePath(id));
    if (invite && tokenMatches(token, invite)) return invite;
  }
  return null;
}

/** Hold the answer for at least this long, counted from when the request arrived. */
const notBefore = (startedAt, ms) =>
  new Promise((done) => setTimeout(done, Math.max(0, startedAt + ms - Date.now())));

// ---------------------------------------------------------------------------
// The owner
// ---------------------------------------------------------------------------

const isAdmin = (username) => readJson(accountPath(username ?? ""))?.admin === true;

/**
 * What the owner is allowed to know about an account.
 *
 * A name, when it was made, when it last synced, and how large the blob is.
 * Not one byte of the blob, because that is not withheld out of politeness: the
 * server cannot read it, and this endpoint is the place where someone would
 * eventually think it convenient to try.
 */
function describeAccount(username) {
  const account = readJson(accountPath(username));
  if (!account) return null;
  const blob = readJson(blobPath(username));
  const gate = gateOf(account);
  const locked = lockedFor(gate, Date.now());
  return {
    username,
    admin: account.admin === true,
    createdAt: account.createdAt ?? null,
    lastSyncAt: blob?.receivedAt ?? null,
    bytes: blob ? JSON.stringify(blob).length : 0,
    failures: gate.failures,
    lockedUntil: locked > 0 ? gate.lockedUntil : null,
  };
}

/** Everything about an invitation except the one thing that opens it. */
function describeInvite(id) {
  const invite = readJson(invitePath(id));
  if (!invite) return null;
  const { tokenHash, ...rest } = invite;
  return rest;
}

function makeInvite(username, days, invitedBy) {
  const now = Date.now();
  const id = randomBytes(6).toString("hex");
  // base64url so it survives being a query parameter, being pasted into a chat
  // and being read aloud badly.
  const token = randomBytes(18).toString("base64url");
  const expiresAt = inviteExpiry(now, days);

  writeAtomic(invitePath(id), {
    id,
    username,
    tokenHash: hashToken(token),
    createdAt: now,
    createdBy: invitedBy,
    expiresAt,
    usedAt: null,
    usedBy: null,
  });

  return { id, username, token, expiresAt };
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

const sign = (value) => createHmac("sha256", SESSION_SECRET).update(value).digest("hex");

function issueSession(username) {
  const expires = Date.now() + SESSION_HOURS * 3_600_000;
  const value = `${encodeURIComponent(username)}.${expires}`;
  return `${value}.${sign(value)}`;
}

function readSession(cookieHeader) {
  const raw = /(?:^|;\s*)bench_session=([^;]+)/.exec(cookieHeader ?? "")?.[1];
  if (!raw) return null;

  const parts = decodeURIComponent(raw).split(".");
  if (parts.length !== 3) return null;
  const [user, expires, mac] = parts;

  const expected = sign(`${user}.${expires}`);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (Number(expires) < Date.now()) return null;

  return decodeURIComponent(user);
}

// ---------------------------------------------------------------------------
// HTTP plumbing
// ---------------------------------------------------------------------------

function send(res, status, body, headers = {}) {
  const payload = body == null ? "" : JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store", ...headers,
  });
  res.end(payload);
}

async function readBody(req, limitBytes = 32 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limitBytes) throw new Error("Payload too large");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const startedAt = Date.now();

  /*
   * Set once, before anything can answer.
   *
   * `Vary: Origin` because the answer now depends on who asked. Without it a
   * cache in front of this could hand one caller's permission slip to another,
   * which is the sort of bug that only appears in production and only sometimes.
   */
  res.setHeader("access-control-allow-origin", allowedOrigin(ORIGINS, req.headers.origin));
  res.setHeader("access-control-allow-credentials", "true");
  res.setHeader("vary", "Origin");

  if (req.method === "OPTIONS") {
    return send(res, 204, null, {
      "access-control-allow-methods": "GET,POST,PUT,OPTIONS",
      "access-control-allow-headers": "content-type",
    });
  }

  try {
    // --- who are you -------------------------------------------------------

    if (req.method === "GET" && url.pathname === "/api/salt") {
      const username = url.searchParams.get("username") ?? "";
      const account = readJson(accountPath(username));
      // A salt is not a secret, but answering differently for a name that does
      // not exist would turn this into a way to enumerate accounts. One is
      // invented and thrown away instead.
      return send(res, 200, { salt: account?.salt ?? randomBytes(16).toString("base64") });
    }

    /**
     * What an invitation is for, so the form can fill the name in and lock it.
     *
     * Public, because whoever holds the token is the person it was written for
     * and the name is not the secret. It tells a holder nothing they were not
     * already sent, and it saves the alternative, which is asking someone to
     * type a username they were told in a different message and refusing them
     * when they get it wrong.
     */
    if (req.method === "GET" && url.pathname === "/api/invite") {
      const invite = findInvite(url.searchParams.get("token"));
      const problem = inviteProblem(invite, invite?.username, Date.now());
      if (problem) return send(res, 404, { error: problem });
      return send(res, 200, { username: invite.username, expiresAt: invite.expiresAt });
    }

    /**
     * Two doors, and which one is open is decided by the filesystem rather than
     * by a setting, so there is nothing to remember to turn off.
     *
     * Empty server: the setup token from the log, and that account becomes the
     * owner. Server with accounts: an invitation, which the owner made for one
     * named person and which stops working once it is used.
     *
     * What both have in common is that neither can be walked through by someone
     * who was not handed something first. There is no moment at which this
     * address will make an account for a stranger.
     */
    if (req.method === "POST" && url.pathname === "/api/register") {
      const { username, authSecret, salt, setupToken, invite: token } = await readBody(req);
      const now = Date.now();

      if (!username || !authSecret || !salt) {
        return send(res, 400, { error: "username, authSecret and salt are required" });
      }
      if (!usernameOk(username)) {
        return send(res, 400, {
          error: "A username is 2 to 32 characters: lowercase letters, digits, dot, dash, underscore.",
        });
      }
      if (existsSync(accountPath(username))) {
        return send(res, 409, { error: "That username is taken." });
      }

      // Checked on every request rather than cached at boot, so a server that
      // has just been set up refuses a second setup token without a restart.
      const first = !accountsExist();
      let usedInvite = null;

      if (first) {
        const given = Buffer.from(String(setupToken ?? ""));
        const expected = Buffer.from(SETUP_TOKEN ?? "");
        if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
          return send(res, 403, {
            error: "Wrong setup token. It is printed in the server log when it starts.",
          });
        }
      } else {
        if (!token && setupToken) {
          // Someone following the old instructions, or the first person to try
          // the token after it was spent. Saying "this invitation does not
          // exist" about a setup token would send them looking for the wrong
          // thing entirely.
          return send(res, 403, {
            error: "The setup token only makes the first account. This server has one, so new accounts need an invitation.",
          });
        }
        usedInvite = findInvite(token);
        const problem = inviteProblem(usedInvite, username, now);
        if (problem) return send(res, 403, { error: problem });
      }

      const hashSalt = randomBytes(16).toString("hex");
      writeAtomic(accountPath(username), {
        username,
        // The browser's PBKDF2 salt. Stored so any device can derive the same
        // key from the same password.
        salt,
        hashSalt,
        authHash: hashSecret(authSecret, hashSalt),
        // The first account owns the server. Everyone else is a guest, and
        // there is no path from guest to owner that does not go through the
        // command line, on purpose.
        admin: first,
        createdAt: now,
        gate: clearGate(),
      });

      // Marked used after the account exists, never before. The other order
      // would burn someone's only invitation on a write that then failed.
      if (usedInvite) {
        writeAtomic(invitePath(usedInvite.id), { ...usedInvite, usedAt: now, usedBy: username });
      }

      return send(res, 201, { ok: true }, { "set-cookie": sessionCookie(issueSession(username)) });
    }

    /**
     * The one endpoint that is worth guessing at, and so the only one that
     * counts how often it has been.
     *
     * Three things happen here that did not before. Every answer takes at least
     * `FLOOR_MS`, so guessing costs real time and so a name that exists cannot
     * be told from one that does not by how quickly the refusal arrives. Wrong
     * passwords accumulate in a sliding window. And once there are enough of
     * them the account shuts for a while, answering immediately with 429 rather
     * than holding the socket, because a slow refusal is itself something to
     * flood a server with.
     */
    if (req.method === "POST" && url.pathname === "/api/login") {
      const { username, authSecret } = await readBody(req);
      const account = readJson(accountPath(username ?? ""));
      const now = Date.now();

      const waiting = account ? lockedFor(gateOf(account), now) : 0;
      if (waiting > 0) {
        return send(res, 429, {
          error: "Too many failed attempts. Try again later.",
        }, { "retry-after": String(retryAfterSeconds(waiting)) });
      }

      // One message for both failures, so this cannot be used to find out which
      // usernames exist.
      if (!account || !secretMatches(authSecret ?? "", account)) {
        if (account) {
          writeAtomic(accountPath(account.username), {
            ...account,
            gate: countFailure(gateOf(account), now),
          });
        }
        await notBefore(startedAt, FLOOR_MS);
        return send(res, 401, { error: "Wrong username or password" });
      }

      if (gateOf(account).failures || gateOf(account).lockCount) {
        writeAtomic(accountPath(account.username), { ...account, gate: clearGate() });
      }

      await notBefore(startedAt, FLOOR_MS);
      return send(res, 200, { ok: true }, { "set-cookie": sessionCookie(issueSession(username)) });
    }

    if (req.method === "POST" && url.pathname === "/api/logout") {
      return send(res, 200, { ok: true }, {
        "set-cookie": "bench_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax",
      });
    }

    // --- the front door ----------------------------------------------------

    /**
     * Answers only 200 or 401, which is all nginx's auth_request wants.
     *
     * This is what turns one password into a lock on the whole site. The proxy
     * asks this before serving anything, so an unauthenticated visitor never
     * reaches the app at all, rather than downloading it and being shown a
     * login drawn in its own JavaScript.
     */
    if (req.method === "GET" && url.pathname === "/api/session") {
      const who = readSession(req.headers.cookie);
      if (!who) return send(res, 401, { error: "Not signed in" });
      // Whether you are the owner is answered here rather than worked out in a
      // browser, because a browser is where the answer would be convenient to
      // change. The endpoints below ask again anyway; this is only so the app
      // knows whether to draw the panel.
      return send(res, 200, { username: who, admin: isAdmin(who) });
    }

    /** Where the proxy sends anyone without a session. */
    if (req.method === "GET" && url.pathname === "/login") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      return res.end(loginPage(url.searchParams.get("next") ?? "/", url.searchParams.get("invite")));
    }

    // --- the owner's door --------------------------------------------------

    /*
     * Everything under here checks `isAdmin` for itself.
     *
     * The app hides the panel from everyone else, and that hiding is decoration.
     * A hidden button is not a lock, because the request it would have sent can
     * be typed by hand. This is the lock.
     */
    if (url.pathname === "/api/accounts" || url.pathname.startsWith("/api/accounts/") ||
        url.pathname === "/api/invites" || url.pathname.startsWith("/api/invites/")) {
      const who = readSession(req.headers.cookie);
      if (!who) return send(res, 401, { error: "Not signed in" });
      if (!isAdmin(who)) return send(res, 403, { error: "Not yours to see" });

      if (req.method === "GET" && url.pathname === "/api/accounts") {
        return send(res, 200, { accounts: listAccounts().map(describeAccount).filter(Boolean) });
      }

      if (req.method === "GET" && url.pathname === "/api/invites") {
        return send(res, 200, { invites: listInvites().map(describeInvite).filter(Boolean) });
      }

      /**
       * Makes an invitation and shows the token exactly once.
       *
       * Only the hash is kept, so this answer cannot be asked for again. If the
       * link is lost the invitation is revoked and a new one made, which is the
       * correct amount of inconvenience for a value that lets someone in.
       */
      if (req.method === "POST" && url.pathname === "/api/invites") {
        const { username, days } = await readBody(req);
        if (!usernameOk(username)) {
          return send(res, 400, {
            error: "A username is 2 to 32 characters: lowercase letters, digits, dot, dash, underscore.",
          });
        }
        if (existsSync(accountPath(username))) {
          return send(res, 409, { error: "That username is taken." });
        }
        const made = makeInvite(username, days, who);
        return send(res, 201, made);
      }

      const revoke = /^\/api\/invites\/([^/]+)\/revoke$/.exec(url.pathname);
      if (req.method === "POST" && revoke) {
        const id = decodeURIComponent(revoke[1]);
        if (!existsSync(invitePath(id))) return send(res, 404, { error: "No such invitation" });
        rmSync(invitePath(id));
        return send(res, 200, { ok: true });
      }

      /**
       * Removes an account and the only copy of that person's history.
       *
       * Asks for the owner's password again rather than trusting the session.
       * Administering accounts from inside the app means a cookie left open on a
       * borrowed laptop is now a cookie that can delete a friend's dose history,
       * and one extra password prompt closes that entire class of accident.
       */
      const remove = /^\/api\/accounts\/([^/]+)\/remove$/.exec(url.pathname);
      if (req.method === "POST" && remove) {
        const target = decodeURIComponent(remove[1]);
        const { authSecret } = await readBody(req);
        const me = readJson(accountPath(who));

        if (!me || !secretMatches(authSecret ?? "", me)) {
          await notBefore(startedAt, FLOOR_MS);
          return send(res, 403, { error: "Wrong password" });
        }
        if (target === who) {
          // Removing yourself would leave a server with blobs and nobody who
          // can reach them, and no way back in short of the command line.
          return send(res, 400, { error: "You cannot remove your own account here. Use admin.mjs." });
        }
        if (!existsSync(accountPath(target))) return send(res, 404, { error: "No such account" });

        rmSync(accountPath(target));
        rmSync(blobPath(target), { force: true });
        return send(res, 200, { ok: true });
      }

      return send(res, 404, { error: "No such endpoint" });
    }

    // --- the data ----------------------------------------------------------

    const username = readSession(req.headers.cookie);
    if (url.pathname === "/api/data") {
      if (!username) return send(res, 401, { error: "Not signed in" });

      if (req.method === "GET") {
        const stored = readJson(blobPath(username));
        // 204 rather than an empty envelope: nothing stored yet is a different
        // answer from something stored that happens to be empty.
        return stored ? send(res, 200, stored) : send(res, 204, null);
      }

      /**
       * A write says which copy it believes it is replacing.
       *
       * `ifMatch` is the `updatedAt` the client last saw, or null for "I think
       * this account has nothing stored". If the stored copy has moved since,
       * the write is refused and the current one comes back with the refusal,
       * so the client can show both rather than guess.
       *
       * The check matters because syncing became automatic. While a person
       * pressed a button they could see what happened; a background push that
       * silently flattens an edit made on a phone is a different thing, and
       * losing a dose history that way would be unforgivable for an app whose
       * only job is to hold it.
       *
       * Required, not optional. A missing `ifMatch` would read as "overwrite
       * whatever is there", which is exactly the mistake this prevents, and it
       * would be made by forgetting rather than by deciding.
       */
      if (req.method === "PUT") {
        const body = await readBody(req);
        const { envelope, updatedAt } = body;
        if (!envelope || typeof updatedAt !== "number") {
          return send(res, 400, { error: "envelope and updatedAt are required" });
        }
        if (!("ifMatch" in body)) {
          return send(res, 400, { error: "ifMatch is required, use null when you expect no stored copy" });
        }

        const stored = readJson(blobPath(username));
        const current = stored?.updatedAt ?? null;
        if (current !== (body.ifMatch ?? null)) {
          return send(res, 409, {
            error: "The stored copy has changed since you last read it",
            current: stored,
          });
        }

        writeAtomic(blobPath(username), { envelope, updatedAt, receivedAt: Date.now() });
        return send(res, 200, { ok: true, updatedAt });
      }
    }

    return send(res, 404, { error: "No such endpoint" });
  } catch (err) {
    // Never the stack trace. The client gets to know that it failed, not where.
    console.error(`${req.method} ${url.pathname}`, err);
    return send(res, 500, { error: "Server error" });
  }
});

/**
 * The page shown to anyone the proxy has turned away, and the page an
 * invitation link opens.
 *
 * Deliberately one file with no build step and no framework. It exists to take
 * a username and a password and call the same endpoint the app calls, so there
 * is one account and one password rather than two.
 *
 * It derives the same auth secret the app does, because the server never sees
 * a password, only the stretched value. That means repeating the derivation
 * here: 600k PBKDF2 rounds, then HKDF with the "auth" label. The other label,
 * the one that produces the data key, is deliberately absent. This page has no
 * business holding it.
 *
 * With `?invite=` it asks for a password twice instead of once and calls
 * register rather than login. The salt is made here, in the browser, and sent
 * up with the account, because it is an input to the key and the server is not
 * allowed to be the one that chooses it.
 */
function loginPage(next, invite) {
  const safeNext = next.startsWith("/") ? next : "/";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Bench</title>
<style>
  /*
    Both themes, because a page that is only ever dark throws a black flash in
    front of somebody whose app is light. One media query and two lists of
    colours, taken from the app's own palette so the two cannot drift apart in
    tone.
  */
  :root {
    color-scheme: light dark;
    --canvas: #f4f6fa; --card: #ffffff; --sunken: #f7f9fc; --line: #e8edf4;
    --ink: #16202e; --muted: #667a92; --faint: #98a7ba;
    --mint: #0fb5a5; --mint-soft: #e2f7f4; --mint-ink: #07786d;
    --on-accent: #ffffff; --rose: #f4436b; --amber: #b4790a;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --canvas: #0d1420; --card: #16202e; --sunken: #111a26; --line: #233042;
      --ink: #eef3f9; --muted: #93a4b9; --faint: #64768d;
      --mint: #2dd4bf; --mint-soft: #10312f; --mint-ink: #6ee7d8;
      --on-accent: #0d1420; --rose: #fb7185; --amber: #fbbf24;
    }
  }

  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100dvh; display: grid; grid-template-columns: 1fr;
         background: var(--canvas); color: var(--ink);
         font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }

  /*
    The left panel on a wide screen, and the header on a narrow one. Same
    element either way rather than two, so there is one thing to keep right.
  */
  .brand { display: flex; flex-direction: column; align-items: center; justify-content: center;
           gap: .75rem; background: var(--mint-soft); padding: 2rem 1.5rem; text-align: center; }
  .brand img { width: 64px; height: 64px; border-radius: 18px; }
  .brand h1 { font-size: 22px; margin: 0; letter-spacing: -.02em; color: var(--ink); }
  .brand p { margin: 0; max-width: 22rem; color: var(--muted); font-size: 13.5px; }
  .pitch { display: none; }

  .pane { display: grid; place-items: center; padding: 2rem 1.5rem; }
  form { width: min(22rem, 100%); }
  h2 { font-size: 19px; margin: 0 0 .25rem; letter-spacing: -.02em; }
  p.sub { margin: 0 0 1.5rem; color: var(--muted); font-size: 13.5px; }
  label { display: block; font-size: 12.5px; color: var(--muted); margin: 0 0 .35rem; }
  input { width: 100%; padding: .7rem .8rem; margin: 0 0 1rem;
          background: var(--sunken); color: inherit; font: inherit;
          border: 1px solid var(--line); border-radius: 10px; }
  input:focus { outline: none; border-color: var(--mint); }
  input[readonly] { color: var(--muted); }
  button { width: 100%; padding: .75rem; font: inherit; font-weight: 600;
           background: var(--mint); color: var(--on-accent);
           border: 0; border-radius: 10px; cursor: pointer; }
  button[disabled] { opacity: .6; cursor: default; }
  .err { color: var(--rose); font-size: 13px; min-height: 1.4em; margin: .75rem 0 0; }
  .warn { color: var(--amber); font-size: 12.5px; line-height: 1.55; margin: 0 0 1.25rem;
          border-left: 2px solid var(--amber); padding: .1rem 0 .1rem .7rem; }
  [hidden] { display: none; }

  /*
    Split at 52rem, which is where the form stops looking stranded beside the
    panel. Below it the panel becomes a band across the top, which is the same
    information in the order a phone reads it.
  */
  @media (min-width: 52rem) {
    body { grid-template-columns: 1fr 1fr; }
    .brand { min-height: 100dvh; gap: 1.25rem; }
    .brand img { width: 96px; height: 96px; border-radius: 26px; }
    .brand h1 { font-size: 30px; }
    .pitch { display: block; }
  }
</style>
</head>
<body>
<!--
  The mark is the same /icon.svg the app and the launcher use, rather than a
  hand copy, so it cannot drift from the generated one. This page is served by
  the sync server, which has no access to the app's public folder, so it works
  only where both sit behind one proxy on one origin. That is the arrangement
  this build is for. Where it is not, the image simply removes itself and the
  wordmark carries the panel, which is why nothing below depends on it.
-->
<div class="brand">
  <img src="/icon.svg" alt="" onerror="this.remove()">
  <h1>Bench</h1>
  <p class="pitch">
    Your protocol, your doses, your bloodwork. Encrypted on this device before
    it is stored, with a key only you hold.
  </p>
</div>

<div class="pane">
<form id="f">
  <h2 id="sub">Sign in to continue.</h2>
  <p class="warn" id="warn" hidden>
    Your password is the key to your data. It never leaves this device, and it is
    not stored anywhere. Nobody can reset it for you, so if you lose it your
    history is gone. Choose something you will not lose.
  </p>
  <label for="u">Username</label>
  <input id="u" name="username" autocomplete="username" autofocus required>
  <label for="p">Password</label>
  <input id="p" name="password" type="password" autocomplete="current-password" required>
  <div id="again" hidden>
    <label for="p2">Password again</label>
    <input id="p2" name="password2" type="password" autocomplete="new-password">
  </div>
  <button id="b" type="submit">Sign in</button>
  <p class="err" id="e"></p>
</form>
</div>
<script type="module">
const enc = new TextEncoder();
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** The same derivation the app does, auth half only. */
async function authSecret(password, saltB64) {
  const salt = b64(saltB64);
  const material = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const master = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 600000, hash: "SHA-256" }, material, 256);
  const key = await crypto.subtle.importKey("raw", master, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info: enc.encode("bench-sync/auth") }, key, 256);
  return hex(bits);
}

const f = document.getElementById("f");
const b = document.getElementById("b");
const e = document.getElementById("e");
const u = document.getElementById("u");
const p = document.getElementById("p");
const p2 = document.getElementById("p2");

const INVITE = ${JSON.stringify(invite ?? null)};
const NEXT = ${JSON.stringify(safeNext)};
let joining = false;

/*
 * An invitation turns this into a registration form.
 *
 * The name comes from the invitation rather than from typing, because the
 * invitation is already bound to one, and a form that lets you enter a
 * different one only exists to reject you afterwards.
 */
if (INVITE) {
  (async () => {
    const res = await fetch("/api/invite?token=" + encodeURIComponent(INVITE));
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      e.textContent = (body && body.error) || "This invitation cannot be used.";
      b.disabled = true;
      return;
    }
    joining = true;
    u.value = body.username;
    u.readOnly = true;
    p.autocomplete = "new-password";
    p2.required = true;
    document.getElementById("sub").textContent = "Choose a password for " + body.username + ".";
    document.getElementById("warn").hidden = false;
    document.getElementById("again").hidden = false;
    b.textContent = "Create account";
    p.focus();
  })();
}

f.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  b.disabled = true;
  e.textContent = "";
  const label = joining ? "Create account" : "Sign in";
  try {
    const username = u.value.trim();
    const password = p.value;

    if (joining && password !== p2.value) throw new Error("The two passwords do not match.");
    if (joining && password.length < 10) {
      throw new Error("Use at least 10 characters. This is the only key to your data.");
    }

    // Takes a moment on a phone. The whole point of the iteration count.
    b.textContent = joining ? "Creating..." : "Signing in...";

    if (joining) {
      // The salt is made here and sent up. It is an input to the key, so the
      // server does not get to choose it.
      const salt = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username, salt, invite: INVITE, authSecret: await authSecret(password, salt),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error((body && body.error) || "Could not create the account");
      }
      location.replace(NEXT);
      return;
    }

    const saltRes = await fetch("/api/salt?username=" + encodeURIComponent(username));
    const { salt } = await saltRes.json();

    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, authSecret: await authSecret(password, salt) }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error((body && body.error) || "Sign in failed");
    }
    location.replace(NEXT);
  } catch (err) {
    e.textContent = err.message;
    b.disabled = false;
    b.textContent = label;
  }
});
</script>
</body>
</html>`;
}

function sessionCookie(value) {
  // Secure is omitted so this works over plain http on localhost. Behind a
  // TLS-terminating proxy, which is the only way this should ever face the
  // internet, add it.
  return `bench_session=${encodeURIComponent(value)}; Path=/; Max-Age=${SESSION_HOURS * 3600}; HttpOnly; SameSite=Lax`;
}

/**
 * Whether the app is being served somewhere only its owner can reach.
 *
 * Crude on purpose. It cannot tell whether a proxy is actually enforcing the
 * gate, because a request that arrives having passed the check looks exactly
 * like one that arrived because nobody checked. What it can tell is whether the
 * origin is a machine you are sitting at, and shout when it is not.
 */
function looksPrivate(origin) {
  try {
    const { hostname } = new URL(origin);
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname.endsWith(".local")
    );
  } catch {
    return false;
  }
}

server.listen(PORT, () => {
  console.log(`Bench sync on http://localhost:${PORT}`);
  console.log(`Data in ${DATA_DIR}`);
  console.log(`Allowing browser requests from ${ORIGINS.join(", ")}`);

  /*
   * A reminder rather than a refusal.
   *
   * Refusing to start would be wrong: plenty of people run this on a LAN, or
   * behind a VPN, where the gate is genuinely unnecessary, and locking them out
   * of their own dose history to make a point would be worse than the risk. But
   * the requirement lives in a README, and a README is a thing you read once and
   * a log is a thing you see every restart.
   */
  if (!ORIGINS.every(looksPrivate)) {
    console.log("");
    console.log("  The app at this origin is not on a machine you are sitting at.");
    console.log("  Put the whole site behind the proxy gate before you use it:");
    console.log("      server/npm-advanced.conf, and the checklist in server/README.md");
    console.log("  Without it, anyone who types the address gets the app.");
    console.log("");
  }
  if (!process.env.BENCH_SESSION_SECRET) {
    console.log("");
    console.log("  BENCH_SESSION_SECRET is not set, so one was invented for this run.");
    console.log("  The next restart will sign everybody out at the same moment.");
    console.log("  Fine while you are the only account. Not fine once there are others.");
    console.log("");
  }

  if (SETUP_TOKEN) {
    console.log("");
    console.log("  No account yet. Register with this setup token:");
    console.log(`      ${SETUP_TOKEN}`);
    console.log("  It changes on every restart and is spent once the first account exists.");
    console.log("  That account is the owner. Everyone after it arrives by invitation:");
    console.log("      node server/admin.mjs invite --user NAME");
    console.log("");
  } else {
    const accounts = listAccounts();
    console.log(`${accounts.length} account${accounts.length === 1 ? "" : "s"}. New ones need an invitation:`);
    console.log("      node server/admin.mjs invite --user NAME");
  }
});
