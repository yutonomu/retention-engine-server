# syntax=docker/dockerfile:1

# Builder stage: install all deps and compile the Nest app.
FROM node:22-bookworm AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

# Copy the full source and build to dist/.
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

EXPOSE 8080
# Cloud Run provides PORT; Nest already listens on process.env.PORT.
CMD ["node", "dist/main.js"]
