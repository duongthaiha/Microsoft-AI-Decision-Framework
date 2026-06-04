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
FROM node:24-slim AS builder

WORKDIR /app

# Copy workspace manifests first to exploit Docker layer cache
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json ./shared/
COPY data/package.json ./data/
COPY api/package.json ./api/
COPY web/package.json ./web/

# Install all workspace deps (includes devDependencies for TypeScript + Vite)
RUN npm ci

# Copy source for all workspaces the api depends on
COPY shared/ ./shared/
COPY data/ ./data/
COPY api/ ./api/
COPY web/ ./web/

# Build shared → data → api (data has Azure SDK adapters needed at runtime)
RUN npm run build --workspace=@advisor/shared
RUN npm run build --workspace=@advisor/data
RUN npm run build --workspace=@advisor/api
# Build the web SPA. VITE_API_URL is intentionally unset so the client uses
# relative URLs and reaches the API from the same origin it is served from.
RUN npm run build --workspace=@advisor/web

# ============================================================
# Stage 2: Production runner
# ============================================================
# Node 24 (LTS) is required because the GitHub Copilot CLI imports the
# `node:sqlite` built-in module, which is only available (stable, no flag) in
# Node 22.5+/24. On Node 20 the CLI subprocess crashes with
# ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite.
FROM node:24-slim AS runner

WORKDIR /app
ENV NODE_ENV=production

# System deps for the GitHub Copilot CLI (copilot mode / BYOK):
#   - git: the CLI expects git to be available on PATH
#   - ca-certificates: TLS to Azure AI Foundry
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Install the GitHub Copilot CLI globally. The @github/copilot-sdk spawns the
# `copilot` binary as its agent runtime. In BYOK mode (AZURE_OPENAI_ENDPOINT set)
# it runs against Azure AI Foundry and needs no Copilot subscription.
RUN npm install -g @github/copilot@1.0.59

# Copy workspace manifests
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json ./shared/
COPY data/package.json ./data/
COPY api/package.json ./api/

# Install production dependencies only
# npm ci with workspace manifests present hoists @azure/* deps from @advisor/data
RUN npm ci --omit=dev

# Copy compiled output from builder
COPY --from=builder /app/shared/dist ./shared/dist
COPY --from=builder /app/data/dist ./data/dist
COPY --from=builder /app/api/dist ./api/dist

# Copy the built web SPA so the API can serve it from the same origin.
COPY --from=builder /app/web/dist ./web/dist

# The microsoft-ai-decision-framework skill is vendored into the build context
# by the azd `prepackage` hook (see azure.yaml). The CopilotAdvisorAgent loads
# it via skillDirectories. ADVISOR_SKILL_PATH points at the in-image location.
COPY skill/ ./skill/
ENV ADVISOR_SKILL_PATH=/app/skill/microsoft-ai-decision-framework

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "api/dist/index.js"]
