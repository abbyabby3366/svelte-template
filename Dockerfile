# ============================================
# Stage 1: Build the SvelteKit app
# ============================================
FROM node:22-alpine AS builder

WORKDIR /app

# Copy root package files and install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy source code and build SvelteKit
COPY svelte.config.js vite.config.ts tsconfig.json ./
COPY src/ ./src/
COPY static/ ./static/
COPY scripts/ ./scripts/

RUN npm run build


# ============================================
# Stage 2: Production runtime
# ============================================
FROM node:22-alpine AS runner

# Install PM2 globally for process management
RUN npm install -g pm2

WORKDIR /app

# --- SvelteKit production dependencies ---
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy built SvelteKit output from builder stage
COPY --from=builder /app/build ./build

# --- WhatsApp Server ---
COPY whatsapp-server/package.json whatsapp-server/package-lock.json ./whatsapp-server/
RUN cd whatsapp-server && npm ci --omit=dev && npm cache clean --force

COPY whatsapp-server/whatsapp-server.js ./whatsapp-server/
COPY whatsapp-server/index.html ./whatsapp-server/

# --- PM2 ecosystem config ---
COPY ecosystem.config.cjs ./

# --- Environment file template (for reference) ---
COPY .env.example ./.env.example

# ============================================
# Cloud Run Configuration
# ============================================
# Cloud Run requires a single PORT env var — the SvelteKit app listens on this.
# The WhatsApp server runs on its own port internally.
#
# Default ports (can be overridden via env vars):
#   SvelteKit app:      PORT (default 8080, Cloud Run standard)
#   WhatsApp server:    WHATSAPP_SERVER_PORT (default 3182)
#
# Cloud Run will route external traffic to PORT.
# The SvelteKit app proxies /whatsapp requests to the WhatsApp server internally.

ENV NODE_ENV=production
ENV PORT=8080
ENV WHATSAPP_SERVER_PORT=3182
ENV BODY_SIZE_LIMIT=30M

# Expose the primary port (Cloud Run uses $PORT)
EXPOSE 8080
EXPOSE 3182

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/ || exit 1

# Start both services with PM2 (no daemon mode for Docker)
CMD ["pm2-runtime", "ecosystem.config.cjs"]
