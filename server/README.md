# Bench sync server

Optional, and nothing in the app requires it. Bench keeps working exactly as it
does today with this directory deleted: the data lives in IndexedDB, there is no
account, and nothing is sent anywhere. This is here for one case, someone who
wants their own copy on their own machine, reachable from a second device.

It holds one encrypted blob per account and hands it back to whoever proves they
know the password.

It cannot read what it stores. The browser encrypts before uploading, with a key
derived from the password, and the value used to log in is derived from that
same password by a different label, so holding it reveals nothing about the key.
If someone takes the machine, they get ciphertext.

No dependencies. `node:http` and `node:crypto` do all of it.

## Run it

```bash
BENCH_SESSION_SECRET=$(openssl rand -hex 32) node server/server.mjs
```

While the server has no account it prints a setup token:

```
  No account yet. Register with this setup token:
      3f1c9a...
```

Copy it into the app, create your account, and that is the end of setup.
Registration closes by itself and stays closed; nothing to remember and nothing
to turn off.

The token exists because closing after the first account still leaves a window
between the server starting and you registering. On a machine reachable from
the internet that window is the whole risk, and requiring a value that only
appears in the server's own log removes it. It is regenerated on every restart
and never written to disk.

To start over, delete the account file from `BENCH_DATA_DIR` and restart. The
server will print a new token.

| Variable | Default | What it does |
| --- | --- | --- |
| `PORT` | `8787` | Port to listen on |
| `BENCH_DATA_DIR` | `server/data` | Where the blobs go |
| `BENCH_SESSION_SECRET` | random | Signs session cookies. Set it, or a restart logs you out |
| `BENCH_ORIGIN` | `http://localhost:3210` | The browser origin allowed to call it |

## Or run it under compose

```bash
docker compose --profile sync up sync        # add -d to send it to the background
docker compose logs sync                     # the setup token is in here
```

The service builds nothing. It runs the stock `node:22-bookworm-slim` image with
`./server` mounted read only, so editing `server.mjs` and restarting the
container is enough; there is no image to rebuild.

`--profile sync` is not optional. Services behind a profile are invisible to
compose without it, and `up sync` alone will say there is no such service.

This starts the server only. The app is a separate service, so a full test wants
both:

```bash
docker compose up -d web
docker compose --profile sync up -d sync
```

Under compose the data does **not** land in `server/data`. `BENCH_DATA_DIR` is
set to `/data`, which is the named volume `bench_sync_data`, so it survives the
container being deleted and rebuilt. That is the point of it, and it is also why
starting over takes a command rather than deleting a file you can see:

```bash
docker compose exec sync sh -c "rm -f /data/*.account.json"
docker compose --profile sync restart sync
```

`docker compose down -v` does the same by removing every volume, including the
`node_modules` and Next caches, which then have to be rebuilt.

## Before it faces the internet

Four things, and the first is not a suggestion.

### 1. Put the whole site behind the proxy gate. Required.

`server/npm-advanced.conf` is not an optional extra. If the app is reachable
from an address you do not control, that config goes in before you point a
browser at it.

Without it, `bench.example` serves the whole application to anybody who types
the address. Their own data would be theirs and yours would still be encrypted,
so this is not a data leak, but it means running an open peptide dosing tool on
your domain for strangers, and it means every one of them is one guessed
password away from trying your account.

The endpoints are already authenticated. What the gate adds is that nothing is
served at all until the proxy has asked the sync server whether this visitor has
a session:

```nginx
location = /_auth {
    internal;
    proxy_pass              http://bench-sync:8787/api/session;
    proxy_pass_request_body off;
    proxy_set_header        Content-Length "";
    proxy_set_header        Cookie $http_cookie;
    proxy_set_header        X-Original-URI $request_uri;
}

location / {
    auth_request /_auth;
    error_page 401 = @signin;
    proxy_pass http://bench-web:3210;
    # headers omitted here, the full file has them
}

location @signin {
    return 302 /login?next=$request_uri;
}
```

That check happens in the proxy, before any of the app reaches the browser,
which is the difference between a lock and a curtain. A login drawn by the app
itself runs in the visitor's browser and can be walked past. This cannot,
because the files never arrive.

Read the full file, it is annotated. In Nginx Proxy Manager it goes in the proxy
host for your domain, under **Advanced**, **Custom Nginx Configuration**. Other
proxies have the same mechanism under a different name: Caddy's
`forward_auth`, Traefik's `ForwardAuth` middleware, plain nginx's own
`auth_request`. All three want `GET /api/session` and treat `401` as "send them
to `/login`".

Verify it before you trust it. From a machine with no session:

```bash
curl -sI https://bench.example/ | head -1      # expect 302 to /login
curl -sI https://bench.example/plan | head -1  # expect 302 to /login
curl -s  https://bench.example/login | head -1 # expect the sign-in page
```

If the first two return `200`, the gate is not on, whatever the config box says.

### 2. Terminate TLS, and mark the cookie

Put it behind something that terminates TLS, and add `Secure` to the session
cookie in `sessionCookie()`. The cookie is `HttpOnly` and `SameSite=Lax`
already, but over plain http none of that matters. Sync will not work over plain
http from another machine anyway: `crypto.subtle` only exists in a secure
context, so the key cannot be derived and the app says so rather than failing
obscurely.

### 3. Set `BENCH_ORIGIN`

The real address of the app. The default only suits a machine you are sitting
at.

### 4. Back up `BENCH_DATA_DIR`

It is the only copy on the server, and the app's own export is the only copy
that is readable without the password.

## What it stores

Two files per account.

`<user>.account.json` holds the username, the browser's PBKDF2 salt, and a
scrypt hash of the auth secret. The salt is not a secret; it is there so two
people with the same password do not end up with the same key.

`<user>.blob.json` holds the sealed envelope and the timestamp of the device
that wrote it. Writes go through a temporary file and a rename, because a crash
halfway through a direct write would truncate the only copy of a dose history.

## Writes carry the version they replace

`PUT /api/data` requires an `ifMatch`: the `updatedAt` the client last read, or
`null` for "I believe nothing is stored". If the stored copy has moved since,
the write is refused with `409` and the current copy comes back with the
refusal.

This is required rather than optional on purpose. A missing `ifMatch` would read
as "overwrite whatever is there", which is the exact mistake the check exists to
prevent, and it is a mistake made by forgetting rather than by deciding.

It matters because syncing is automatic. While a person pressed a button they
could see what happened. A background push that silently flattens an edit made
on a phone is a different thing, and an app whose only job is to hold a dose
history has no business losing one quietly.

## What it deliberately does not do

No merge. One person on two devices does not need one, and a wrong merge of a
dose history is worse than a lost edit that can be seen and redone. Either one
side moved, in which case the direction is obvious, or both did, in which case
the client is expected to stop and ask rather than pick. That decision belongs
to the client and is deliberately not made here: this server only refuses a
write that would overwrite a copy the writer had not read.

Which is also why it compares versions rather than clocks. Two devices disagree
about the time and never disagree about which copy they last saw.

No password reset. There is nobody to verify you, and the server could not
re-encrypt the data even if there were.

No multi-user features. Accounts are separate and that is the end of it.
