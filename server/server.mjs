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
 *   POST /api/register  { username, authSecret, salt, setupToken }   first run only
 *   GET  /api/salt      ?username=                      before the password is asked for
 *   POST /api/login     { username, authSecret }        sets a session cookie
 *   POST /api/logout
 *   GET  /api/session                                   200 or 401, for the proxy
 *   GET  /login                                         the page the proxy sends you to
 *   GET  /api/data                                      the sealed envelope, or 204
 *   PUT  /api/data      { envelope, updatedAt, ifMatch }  409 if the copy moved
 *
 * Run: node server/server.mjs
 * Env: PORT, BENCH_DATA_DIR, BENCH_SESSION_SECRET, BENCH_ORIGIN
 */

import { createServer } from "node:http";
import { randomBytes, scryptSync, timingSafeEqual, createHmac } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT ?? 8787);
const DATA_DIR = process.env.BENCH_DATA_DIR ?? join(dirname(fileURLToPath(import.meta.url)), "data");
const ORIGIN = process.env.BENCH_ORIGIN ?? "http://localhost:3210";

/**
 * Sessions are signed rather than stored, so a restart does not log you out and
 * there is no table to grow. Generated when absent, which is convenient for a
 * first run and useless for a real deployment: set it, or every restart
 * invalidates every cookie.
 */
const SESSION_SECRET = process.env.BENCH_SESSION_SECRET ?? randomBytes(32).toString("hex");
if (!process.env.BENCH_SESSION_SECRET) {
  console.warn("BENCH_SESSION_SECRET is not set, sessions will not survive a restart");
}

const SESSION_HOURS = 24 * 30;

mkdirSync(DATA_DIR, { recursive: true });

/**
 * Registration closes itself once an account exists.
 *
 * It used to be a switch you had to turn on and then remember to turn off,
 * which is a poor way to protect anything: the failure mode is silent and
 * permanent, and it only bites on a server that is already public. Asking the
 * filesystem removes the thing to remember.
 */
const accountsExist = () =>
  readdirSync(DATA_DIR).some((f) => f.endsWith(".account.json"));

/**
 * A one-time token, printed at startup while the server has no accounts.
 *
 * Closing after the first account still leaves a window: between the moment
 * this starts listening and the moment you register, whoever finds the port can
 * claim the account instead. On a machine reachable from the internet that
 * window is the whole risk. Requiring a value that only appears in the server's
 * own log closes it, at the cost of one copied string.
 *
 * Regenerated on every boot, so a token seen once is useless after a restart,
 * and never written to disk.
 */
const SETUP_TOKEN = accountsExist() ? null : randomBytes(16).toString("hex");

const accountPath = (username) => join(DATA_DIR, `${encodeURIComponent(username)}.account.json`);
const blobPath = (username) => join(DATA_DIR, `${encodeURIComponent(username)}.blob.json`);

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
    "access-control-allow-origin": ORIGIN,
    "access-control-allow-credentials": "true",
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

    if (req.method === "POST" && url.pathname === "/api/register") {
      // Checked on every request rather than cached at boot, so a server that
      // has just been set up refuses the second attempt without a restart.
      if (accountsExist()) {
        return send(res, 403, {
          error: "Registration is closed. This server already has an account.",
        });
      }

      const { username, authSecret, salt, setupToken } = await readBody(req);

      const given = Buffer.from(String(setupToken ?? ""));
      const expected = Buffer.from(SETUP_TOKEN ?? "");
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
        return send(res, 403, {
          error: "Wrong setup token. It is printed in the server log when it starts.",
        });
      }

      if (!username || !authSecret || !salt) {
        return send(res, 400, { error: "username, authSecret and salt are required" });
      }

      const hashSalt = randomBytes(16).toString("hex");
      writeAtomic(accountPath(username), {
        username,
        // The browser's PBKDF2 salt. Stored so any device can derive the same
        // key from the same password.
        salt,
        hashSalt,
        authHash: hashSecret(authSecret, hashSalt),
        createdAt: Date.now(),
      });

      return send(res, 201, { ok: true }, { "set-cookie": sessionCookie(issueSession(username)) });
    }

    if (req.method === "POST" && url.pathname === "/api/login") {
      const { username, authSecret } = await readBody(req);
      const account = readJson(accountPath(username ?? ""));

      // One message for both failures, so this cannot be used to find out which
      // usernames exist.
      if (!account || !secretMatches(authSecret ?? "", account)) {
        return send(res, 401, { error: "Wrong username or password" });
      }

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
      return who ? send(res, 200, { username: who }) : send(res, 401, { error: "Not signed in" });
    }

    /** Where the proxy sends anyone without a session. */
    if (req.method === "GET" && url.pathname === "/login") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      return res.end(loginPage(url.searchParams.get("next") ?? "/"));
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
 * The page shown to anyone the proxy has turned away.
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
 */
function loginPage(next) {
  const safeNext = next.startsWith("/") ? next : "/";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Bench</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center;
         background: #0d1420; color: #e6edf7;
         font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
  form { width: min(22rem, calc(100vw - 3rem)); }
  h1 { font-size: 20px; margin: 0 0 .25rem; letter-spacing: -.02em; }
  p.sub { margin: 0 0 1.5rem; color: #8fa3bf; font-size: 13.5px; }
  label { display: block; font-size: 12.5px; color: #8fa3bf; margin: 0 0 .35rem; }
  input { width: 100%; box-sizing: border-box; padding: .7rem .8rem; margin: 0 0 1rem;
          background: #131c2b; color: inherit; font: inherit;
          border: 1px solid #24334a; border-radius: 8px; }
  input:focus { outline: none; border-color: #4ea1a5; }
  button { width: 100%; padding: .7rem; font: inherit; font-weight: 600;
           background: #4ea1a5; color: #08131a; border: 0; border-radius: 8px; cursor: pointer; }
  button[disabled] { opacity: .6; cursor: default; }
  .err { color: #e0798b; font-size: 13px; min-height: 1.4em; margin: .75rem 0 0; }
</style>
</head>
<body>
<form id="f">
  <h1>Bench</h1>
  <p class="sub">Sign in to continue.</p>
  <label for="u">Username</label>
  <input id="u" name="username" autocomplete="username" autofocus required>
  <label for="p">Password</label>
  <input id="p" name="password" type="password" autocomplete="current-password" required>
  <button id="b" type="submit">Sign in</button>
  <p class="err" id="e"></p>
</form>
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

f.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  b.disabled = true;
  e.textContent = "";
  try {
    const username = document.getElementById("u").value.trim();
    const password = document.getElementById("p").value;

    const saltRes = await fetch("/api/salt?username=" + encodeURIComponent(username));
    const { salt } = await saltRes.json();

    // Takes a moment on a phone. The whole point of the iteration count.
    b.textContent = "Signing in...";
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, authSecret: await authSecret(password, salt) }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error ?? "Sign in failed");
    }
    location.replace(${JSON.stringify(safeNext)});
  } catch (err) {
    e.textContent = err.message;
    b.disabled = false;
    b.textContent = "Sign in";
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
  console.log(`Allowing browser requests from ${ORIGIN}`);

  /*
   * A reminder rather than a refusal.
   *
   * Refusing to start would be wrong: plenty of people run this on a LAN, or
   * behind a VPN, where the gate is genuinely unnecessary, and locking them out
   * of their own dose history to make a point would be worse than the risk. But
   * the requirement lives in a README, and a README is a thing you read once and
   * a log is a thing you see every restart.
   */
  if (!looksPrivate(ORIGIN)) {
    console.log("");
    console.log("  The app at this origin is not on a machine you are sitting at.");
    console.log("  Put the whole site behind the proxy gate before you use it:");
    console.log("      server/npm-advanced.conf, and the checklist in server/README.md");
    console.log("  Without it, anyone who types the address gets the app.");
    console.log("");
  }
  if (SETUP_TOKEN) {
    console.log("");
    console.log("  No account yet. Register with this setup token:");
    console.log(`      ${SETUP_TOKEN}`);
    console.log("  It changes on every restart and closes for good once an account exists.");
    console.log("");
  } else {
    console.log("Registration is closed, an account already exists");
  }
});
