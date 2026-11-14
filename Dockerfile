# Multi-stage Dockerfile for MetroPulse BLR Telemetry Platform
# Stage 1: Build Frontend
FROM node:20-alpine AS client-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

# Stage 2: Production Server
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5000

# Copy server dependencies and install
COPY server/package*.json ./server/
WORKDIR /app/server
RUN npm install --omit=dev

# Copy server source
COPY server/ ./

# Copy built frontend assets from client-builder
COPY --from=client-builder /app/client/dist /app/client/dist

EXPOSE 5000

CMD ["node", "src/index.js"]
