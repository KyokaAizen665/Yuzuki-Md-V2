# syntax = docker/dockerfile:1

ARG NODE_VERSION=22.21.1
FROM node:${NODE_VERSION}-slim

WORKDIR /app

ENV NODE_ENV=production

# System deps:
#   ffmpeg          — audio/video processing
#   python3 + build-essential — native npm module compilation
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

COPY package*.json ./

RUN npm install

COPY . .

# Must match PORT in server.js (default: 3000)
EXPOSE 3000

CMD ["npm", "start"]
