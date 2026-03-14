# Build stage
FROM node:20-alpine AS builder

RUN apk add --no-cache bash jq curl bc

WORKDIR /app

# Copy package files first for better layer caching
COPY package.json package-lock.json* ./
RUN npm install

# Copy application source
COPY . .

# Build the frontend
RUN npm run build

# Production stage
FROM node:20-alpine

RUN apk add --no-cache bash jq curl bc

WORKDIR /app

# Copy package files and install production deps only
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server

EXPOSE 3008

ENV NODE_ENV=production
ENV EVAL_DIR=/app/data
ENV PORT=3008

CMD ["node", "server/index.js"]
