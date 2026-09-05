# Bench sync server

Optional, and nothing in the app requires it. Bench keeps working exactly as it
does today with this directory deleted: the data lives in IndexedDB, there is no
account, and nothing is sent anywhere. This is here for two cases: someone who
wants their own copy on their own machine reachable from a second device, and
someone who wants to run a copy for a handful of people they know.

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

Copy it into the app, create your account, and that is the end of setup. That
first account is the **owner**. The token is spent, it is regenerated on every
restart, and it is never written to disk.

The token exists because the gap between the server starting and you registering
is a gap in which somebody else could register instead. On a machine reachable
from the internet that gap is the whole risk, and requiring a value that only
appears in the server's own log removes it.

To start over, delete the account file from `BENCH_DATA_DIR` and restart. The
server will print a new token.

| Variable | Default | What it does |
| --- | --- | --- |
| `PORT` | `8787` | Port to listen on |
| `BENCH_DATA_DIR` | `server/data` | Where the blobs go |
| `BENCH_SESSION_SECRET` | random | Signs session cookies. Set it, or a restart signs everybody out at the same moment |
| `BENCH_ORIGIN` | `http://localhost:3210` | Browser origins allowed to call it, comma separated |

## More than one person

Everyone after the owner arrives by invitation. There is no moment at which this
address will make an account for a stranger: no open registration to turn off,
and nothing to remember.

```bash
node server/admin.mjs invite --user tofs --base https://bench.example
```

That prints a link, good for seven days and for one use, that only makes the
account `tofs`:

```
    https://bench.example/login?invite=Z_-sU7A2RNdHCbQ0mH9JL18d
```

Send it over something private. Whoever opens it chooses their own password, and
nobody else ever learns it, you included. That is not politeness: the password is
the encryption key, so an owner who knew it could read that person's history.

Only a hash of the token is kept, so the link cannot be recovered later. Lose it
and you cancel the invitation and make another.

### A build that knows where its server is

The app can be built so that it belongs to one server. Two variables, read at
build time and nowhere else:

```bash
NEXT_PUBLIC_SYNC_URL=https://bench.example \
NEXT_PUBLIC_REQUIRE_ACCOUNT=1 \
npm run build
```

Under compose they go in `.env` beside `BENCH_SESSION_SECRET`, and the `web`
service passes them as build arguments:

```
NEXT_PUBLIC_SYNC_URL=https://bench.example
NEXT_PUBLIC_REQUIRE_ACCOUNT=1
```

```bash
docker compose up -d --build web
```

**`--build` is not optional, and neither is the placement.** Next inlines these
into the JavaScript while it compiles, so a container that has already been
built is serving an answer it decided earlier. Putting them under
`environment:` instead of `args:` looks right, changes nothing, and produces no
error, which is the most expensive kind of wrong. Changing either value later
means another `--build`, not a restart.

The `dev` service takes them as environment rather than build arguments, which
is the same two names at a different moment: `next dev` compiles on demand and
so reads them at startup.

With them set: nobody is asked to type an address, there is no offer to set up a
new server or to paste a setup token, and signing out returns to the login page
rather than leaving somebody in an app they can no longer load. An owner also
gets a panel in Settings for the invitations and accounts described above, which
is the same set of endpoints and the same refusals, drawn rather than typed.

With them unset this is the ordinary Bench, unchanged in every screen. There is
no fork and no second branch: the difference is two strings.

The address alone, without the requirement, is a real and useful middle state.
The server is filled in, and somebody who wants to use the app without an
account still can.

With the requirement set, the account on the server is also the copy that
counts, and that changes exactly one moment: the first contact between a
browser and an account. On a server somebody set up for themselves, two sides
holding different data is a real question, because either could be the real
history. Signing in to an account is not that question, so the account's copy
is taken rather than asked about.

It does not extend past that moment. Once the two have agreed once, a device
holding edits the server has not seen is holding work somebody did, and being
the primary copy is not a reason to discard it unasked. The server wins at the
start, the device wins during.

Nothing is destroyed either way. A pull writes the whole document through the
store, so the guard in the storage layer sees the collections shrink and sets
the previous document aside exactly as it would for any other write that loses
records. What was in the browser before is one press away in the notice on
every page.

With the requirement set, somebody joining is stopped once, at the start, and
asked to save a backup file before the app opens. That is where they are told,
at the only moment it can still be acted on, that their password is the key and
that nobody can reset it. The way out is the file rather than a checkbox,
because a checkbox measures only whether somebody will click a checkbox. It
never appears for anyone who has saved a file before.

### The rest of `admin.mjs`

```bash
node server/admin.mjs list             # accounts, sizes, lockouts
node server/admin.mjs invites          # what is outstanding
node server/admin.mjs cancel ID        # cancel an unused invitation
node server/admin.mjs unlock NAME      # clear a lockout
node server/admin.mjs revoke NAME      # remove an account and its blob, permanently
node server/admin.mjs promote NAME     # make somebody an owner
```

Under compose the data is in a named volume rather than on your disk, so this
runs inside the container:

```bash
docker compose --profile sync exec sync node server/admin.mjs list
```

Most of this is also in the app, in Settings, for an owner. `promote` is not, and
will not be. It is the only command that turns a guest into someone who can
delete other people's data, and it should not be reachable by any form in any
browser.

### Guessing a password

`POST /api/login` is the one endpoint worth attacking, so it is the one that
counts. Every answer takes at least 300 ms, which slows guessing and also stops
a name that exists being told from one that does not by how fast the refusal
arrives. Eight wrong passwords inside fifteen minutes shut that account for five
minutes, doubling for each repeat, capped at six hours.

Two honest notes about that. The lock is per account rather than per address,
because an address is changed in a second and blocking one blocks a whole
household; the cost is that somebody who knows a username can deliberately lock
its owner out, which is why the lock expires by itself and why `unlock` exists.
And a locked account answers immediately with `429` rather than waiting, because
a slow refusal is itself a thing to flood a server with.

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
at. It takes a list, because the app usually has more than one address that is
legitimately its own: the domain, and a laptop on the LAN while something is
being worked on.

```
BENCH_ORIGIN=https://bench.example,http://192.168.1.44:3210
```

A caller on the list is handed its own address back, which is what lets the
browser proceed. Everyone else is handed the first one, which is not theirs, so
their browser refuses.

### 4. Set `BENCH_SESSION_SECRET`

Without it the server invents one at every start, and the next restart signs
everybody out at the same moment. Survivable while you are the only account. Not
survivable once other people are relying on it, because they will all ask you at
once and none of them will know why.

### 5. Back up `BENCH_DATA_DIR`

It is the only copy on the server, and the app's own export is the only copy
that is readable without the password.

This stops being only your problem the moment there is a second account. A disk
that dies takes several people's history with it, and no amount of encryption
helps with that. Tell everyone you invite to keep their own export.

## What it stores

Two files per account, and one per invitation.

`<user>.account.json` holds the username, the browser's PBKDF2 salt, a scrypt
hash of the auth secret, whether this account is an owner, and the count of
recent failed logins. The salt is not a secret; it is there so two people with
the same password do not end up with the same key.

`<id>.invite.json` holds the name the invitation is for, its expiry, whether it
has been used, and a SHA-256 of the token. No stretching on that hash, and that
is deliberate: stretching exists because passwords are short and human, while
this token is 144 bits of randomness with no dictionary behind it. It is hashed
at all so that reading the data directory does not hand over a live invitation.

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
re-encrypt the data even if there were. This holds for the owner too: running the
server does not make anyone able to recover a guest's password, because the
password is the key and the key was never here.

No sharing between accounts. Several accounts can live on one server, and that is
as far as it goes. They cannot see each other, there is nothing to send between
them, and the owner's view of them is a name, a size and a date.
