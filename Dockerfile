FROM node:20-alpine

# Build tools needed for better-sqlite3 native module
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Data directory for SQLite DB (mount as volume in production)
RUN mkdir -p /data

ENV PORT=3000
ENV DB_PATH=/data/eco_data.db

EXPOSE 3000

CMD ["node", "server.js"]
