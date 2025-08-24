# Multi-stage build for optimized production image
# Stage 1: Build stage
FROM node:18-slim AS builder

WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./

# Install all dependencies (including dev deps for build)
RUN npm ci --only=production=false

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Stage 2: Production stage
FROM node:18-slim AS production

# Install only curl for health checks
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install only production dependencies
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Create non-root user for security
RUN useradd -r -u 1001 -g root nodeuser
RUN chown -R 1001:root /app
USER 1001

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

# Start server with node directly (no npm overhead) in HTTP mode for Cloud Run
# PORT and HOST will be read from environment variables
CMD ["node", "dist/unified-server.js", "--mode=http"]