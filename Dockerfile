# STAGE 1: Build & Compile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# STAGE 2: Lean Production Runner
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4321
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
 CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:4321/api/health || exit 1
EXPOSE 4321
CMD ["node", "./dist/server/entry.mjs"]
