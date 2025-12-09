# syntax=docker/dockerfile:1

# Builder stage: install all deps and compile the Nest app.
FROM node:22-bookworm AS deps
WORKDIR /app

COPY package*.json ./
RUN npm ci

# Development stage: just deps, source mounted via volume
FROM deps AS development
ENV NODE_ENV=development
CMD ["npm", "run", "start:dev"]

# Builder stage: copy source and build
FROM deps AS builder
COPY . .
RUN npm run build

# Trim devDependencies before shipping the runtime image.
RUN npm prune --omit=dev

# Runtime stage: lightweight image suitable for Cloud Run.
FROM node:22-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# Copy the compiled app and pruned production deps from the builder.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package*.json ./

# Copy store-registry.json for Gemini FileSearch Store persistence
# This file contains the mapping of store display names to Gemini API store names
# Without this file, RAG functionality will fail in production
COPY --from=builder /app/store-registry.json ./store-registry.json

EXPOSE 8080
# Cloud Run provides PORT; Nest already listens on process.env.PORT.
CMD ["node", "dist/main.js"]
