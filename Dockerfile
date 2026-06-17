# syntax = docker/dockerfile:1

ARG NODE_VERSION=22.21.1
FROM node:${NODE_VERSION}-slim

WORKDIR /app

ENV NODE_ENV=production
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# System deps:
#   git             — required to install socketon (github:cv3inx/baileys)
#   ffmpeg          — audio/video processing
#   python3 + build-essential — native module compilation (better-sqlite3, sharp)
#   libfontconfig1 + libfreetype6 — required by @napi-rs/canvas for text rendering
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    git \
    ffmpeg \
    python3 \
    build-essential \
    libfontconfig1 \
    libfreetype6 && \
    rm -rf /var/lib/apt/lists/*

# Install pnpm — matches pnpm-lock.yaml so installs are reproducible
RUN corepack enable && corepack prepare pnpm@10 --activate

# Copy manifest + lockfile first (Docker layer cache: only re-installs when these change)
COPY package.json pnpm-lock.yaml ./

# --frozen-lockfile  → fail fast if lockfile is out of sync with package.json
# onlyBuiltDependencies in package.json allows native builds for:
#   better-sqlite3, sharp, @napi-rs/canvas, protobufjs, @itsliaaa/baileys
RUN pnpm install --frozen-lockfile

# Copy the rest of the source
COPY . .

# Health check endpoint exposed by server.js
EXPOSE 3000

CMD ["node", "src/index.js"]
