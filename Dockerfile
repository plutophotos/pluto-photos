# ============================================================
# Pluto Photos — Docker Server
# ============================================================
# Multi-stage build for a lean production image.
#
# Build:   docker build -t plutophotos/server .
# Run:     docker run -v /path/to/photos:/photos -v pluto-data:/data -p 3456:3456 plutophotos/server
# ============================================================

# --- Stage 1: Install dependencies ---
FROM node:22-slim AS builder

WORKDIR /app

# Install build tools for native modules (better-sqlite3, sharp, @napi-rs/canvas)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy the server-specific package.json (has "type": "module" and only server deps)
COPY server.package.json ./package.json
RUN npm install --omit=dev --ignore-scripts && \
    npm rebuild better-sqlite3 && \
    npm rebuild sharp && \
    npm rebuild @napi-rs/canvas && \
    npm rebuild onnxruntime-node || true

# --- Stage 1b: Build shared web video editor assets ---
FROM node:22-slim AS web-builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY vite.video-editor.config.ts tsconfig.json tsconfig.web.json ./
COPY src ./src

RUN npm ci --ignore-scripts && npm run build:video-editor-web

# --- Stage 2: Production image ---
FROM node:22-slim

LABEL maintainer="Pluto Photos <hello@plutophotos.com>"
LABEL description="Pluto Photos — Self-hosted photo library server"
LABEL org.opencontainers.image.source="https://github.com/plutophotos/pluto-photos"

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy node_modules from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy application source (only what the server needs)
COPY server.package.json ./package.json
COPY src/main/api-server.js src/main/license.js src/main/web-ui.js src/main/clip-tokenizer.js src/main/shared.js ./src/main/
COPY src/server/index.js ./src/server/
COPY resources/icon.png ./resources/
COPY --from=web-builder /app/build/video-editor-web ./resources/video-editor-web

# Copy BiRefNet model for background removal
COPY resources/birefnet ./resources/birefnet

# Copy caption/CLIP models + search synonyms for contextual search
COPY resources/caption-model ./resources/caption-model
COPY resources/blip-model ./resources/blip-model
COPY resources/search-synonyms.json ./resources/search-synonyms.json

# Bundle face-api.js + models for fully offline face detection
RUN mkdir -p /app/face-models/model && \
    cp /app/node_modules/@vladmandic/face-api/dist/face-api.js /app/face-models/face-api.js && \
    cp /app/node_modules/@vladmandic/face-api/model/ssd_mobilenetv1_model-weights_manifest.json /app/face-models/model/ && \
    cp /app/node_modules/@vladmandic/face-api/model/ssd_mobilenetv1_model.bin /app/face-models/model/ && \
    cp /app/node_modules/@vladmandic/face-api/model/face_landmark_68_model-weights_manifest.json /app/face-models/model/ && \
    cp /app/node_modules/@vladmandic/face-api/model/face_landmark_68_model.bin /app/face-models/model/ && \
    cp /app/node_modules/@vladmandic/face-api/model/face_recognition_model-weights_manifest.json /app/face-models/model/ && \
    cp /app/node_modules/@vladmandic/face-api/model/face_recognition_model.bin /app/face-models/model/ && \
    cp /app/node_modules/@vladmandic/face-api/model/tiny_face_detector_model-weights_manifest.json /app/face-models/model/ && \
    cp /app/node_modules/@vladmandic/face-api/model/tiny_face_detector_model.bin /app/face-models/model/

# Environment defaults
ENV NODE_ENV=production
ENV PLUTO_DATA_DIR=/data
ENV PLUTO_MEDIA_DIRS=/photos
ENV PLUTO_PORT=3456
ENV PLUTO_SCAN_INTERVAL=60
ENV PLUTO_LOG_LEVEL=info

# Expose API server port (HTTPS) and HTTP redirect port
EXPOSE 3456 3457

# Health check (tries HTTPS first, falls back to HTTP)
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD node -e "const https=require('https');const req=https.request({hostname:'localhost',port:3456,path:'/api/ping',timeout:3000,rejectUnauthorized:false},res=>{process.exit(res.statusCode===200||res.statusCode===401?0:1)});req.on('error',()=>{const http=require('http');const r2=http.request({hostname:'localhost',port:3456,path:'/api/ping',timeout:3000},res=>{process.exit(res.statusCode===200||res.statusCode===401?0:1)});r2.on('error',()=>process.exit(1));r2.end()});req.end()" || exit 1

# Run as non-root for security (entrypoint adjusts UID/GID at runtime)
RUN apt-get update && apt-get install -y --no-install-recommends gosu && rm -rf /var/lib/apt/lists/* && \
    groupadd -r pluto && useradd -r -g pluto -d /app pluto && \
    chown -R pluto:pluto /app && \
    mkdir -p /data /photos && \
    chown -R pluto:pluto /data /photos

# Support PUID/PGID for host-mounted volume permissions
ENV PUID=1000
ENV PGID=1000

COPY build/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "src/server/index.js"]
