# syntax = docker/dockerfile:1

ARG NODE_VERSION=22.21.1
FROM node:${NODE_VERSION}-slim

WORKDIR /app

ENV NODE_ENV=production

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    git \
    ffmpeg \
    python3 \
    build-essential && \
    rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 8080

CMD ["npm", "start"]
