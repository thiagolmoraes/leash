FROM oven/bun:1 AS build

WORKDIR /app
COPY package.json ./
RUN bun install

COPY src ./src
COPY tsconfig.json ./

WORKDIR /app/src/web
COPY src/web/package.json ./
RUN bun install
COPY src/web ./
RUN bun run build

FROM oven/bun:1

# git + ca-certificates: the Skills tab clones the pasted repo URL to install
# it (the scanner sidecar doesn't hand back the files it fetched, only the
# report). Without ca-certificates, git's HTTPS clone fails cert validation.
RUN apt-get update -y && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/src ./src
COPY --from=build /app/web-dist ./web-dist

# Docker CLI not needed — we talk to the Engine API directly over the socket.
ENV PORT=8082
EXPOSE 8082

ENTRYPOINT ["bun", "run", "src/server.ts"]
