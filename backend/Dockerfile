# ─────────────────────────────────────────────────────────────
# Stage 1: Build TypeScript backend
# ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Install native compilation dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++ gcc

COPY package*.json tsconfig.json ./
RUN npm ci

COPY src ./src
COPY seed.cjs ./

RUN npm run build

# ─────────────────────────────────────────────────────────────
# Stage 2: Minimal Production Runtime
# ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

# Install runtime dependencies for SQLite
RUN apk add --no-cache sqlite-libs

ENV NODE_ENV=production
ENV PORT=5001

COPY package*.json ./
# Install only production dependencies (rebuilding better-sqlite3 native bindings)
RUN apk add --no-cache python3 make g++ gcc && \
    npm ci --only=production && \
    apk del python3 make g++ gcc

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/seed.cjs ./

# SQLite database directory with write permissions
RUN mkdir -p /app/data
VOLUME /app/data

EXPOSE 5001

CMD ["node", "dist/server.js"]
