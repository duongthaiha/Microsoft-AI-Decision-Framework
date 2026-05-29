# ============================================================
# Dockerfile — @advisor/api
# Build context: agents/advisor/  (npm workspace root)
#
# Two-stage build:
#   1. builder  — install all deps, compile TypeScript
#   2. runner   — production-only deps + compiled JS
#
# The final image runs node api/dist/index.js on PORT 3000.
# AZURE_CLIENT_ID, COSMOS_ENDPOINT, SEARCH_ENDPOINT, etc. are
# injected at runtime by Container Apps (see infra/modules/containerapp.bicep).
# ============================================================

# Stage 1: Build
FROM node:20-slim AS builder

WORKDIR /app

# Copy workspace manifests first to exploit Docker layer cache
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json ./shared/
COPY api/package.json ./api/

# Install all workspace deps (includes devDependencies for TypeScript)
RUN npm ci

# Copy source for all workspaces the api depends on
COPY shared/ ./shared/
COPY api/ ./api/

# Build shared types first, then api
RUN npm run build --workspace=@advisor/shared
RUN npm run build --workspace=@advisor/api

# ============================================================
# Stage 2: Production runner
# ============================================================
FROM node:20-slim AS runner

WORKDIR /app
ENV NODE_ENV=production

# Copy workspace manifests
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json ./shared/
COPY api/package.json ./api/

# Install production dependencies only
RUN npm ci --omit=dev

# Copy compiled output from builder
COPY --from=builder /app/shared/dist ./shared/dist
COPY --from=builder /app/api/dist ./api/dist

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "api/dist/index.js"]
