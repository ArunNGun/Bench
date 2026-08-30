# Bench web image.
#
# Three stages so the runtime layer never carries the npm cache or the build
# toolchain. Node 22 matches .github/workflows, because a container that builds
# on a different major than CI is a container that finds different bugs.
#
# The Android build is deliberately absent. It needs a JDK and adb access to a
# physical device, neither of which belongs in a web image.

ARG NODE_VERSION=22


# Stage 1: dependencies.
# Split from the build so that editing source does not reinstall the tree.
FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci


# Stage 2: build.
FROM node:${NODE_VERSION}-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# scripts/version.mjs stamps public/version.json, and next.config.ts reads that
# same file to bake the id into the bundle. Passing BUILD_ID pins the stamp;
# leaving it out falls back to a timestamp, so every build gets its own id.
#
# The substitution below is doing real work. version.mjs falls back with `??`,
# which treats an empty string as a perfectly good value, and compose hands an
# empty string whenever BUILD_ID is not set in the environment. The result was a
# build id of "", which registered the service worker at /sw.js?v= on every
# build. Same worker URL, same cache name, so the browser never installed the
# new one and kept serving the previous bundle no matter how often the image was
# rebuilt. Substituting here means an empty value is treated as absent.
ARG BUILD_ID

ENV NEXT_TELEMETRY_DISABLED=1
RUN BUILD_ID="${BUILD_ID:-$(date +%s%3N)}" npm run build


# Stage 3: runtime.
FROM node:${NODE_VERSION}-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3210

# public/ carries version.json, which next.config.ts reads at startup as well as
# at build time. Without it the running app reports a build id of "dev" and can
# never detect an update.
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts

# The node image ships an unprivileged "node" user. Nothing here writes to disk
# at runtime, so read only ownership is enough.
USER node

EXPOSE 3210

# Global fetch means no curl or wget in the image just to answer this.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3210/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npx", "next", "start", "-p", "3210"]
