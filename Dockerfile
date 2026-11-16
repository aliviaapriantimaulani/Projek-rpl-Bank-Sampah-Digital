# Multi-stage or lightweight Node.js Dockerfile for Bank Sampah Digital
FROM node:24-alpine

# Set working directory
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application source code
COPY . .

# Ensure data directory exists for SQLite
RUN mkdir -p /app/data

# Expose default port
EXPOSE 3000

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Start server
CMD ["node", "src/server.js"]
