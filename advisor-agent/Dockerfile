# Stage 1: build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
COPY tsconfig.base.json ./
COPY agent/package.json ./agent/
RUN npm install --workspace=agent
COPY agent/ ./agent/
RUN npm run build --workspace=agent

# Stage 2: runtime
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder /app/agent/dist ./agent/dist
COPY --from=builder /app/agent/package.json ./agent/package.json
RUN cd agent && npm install --omit=dev
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1
CMD ["node", "agent/dist/index.js"]
