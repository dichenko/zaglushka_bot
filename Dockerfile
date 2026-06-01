FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production

# Install FFmpeg for audio conversion
RUN apk add --no-cache ffmpeg

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY src/migrations ./dist/migrations
COPY scripts ./scripts

# Copy admin panel views
COPY src/admin/views ./dist/admin/views

CMD ["node", "dist/index.js"]
