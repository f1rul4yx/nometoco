FROM node:20-alpine

# better-sqlite3 needs build tools
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm install --production && apk del python3 make g++

COPY src/ ./src/
COPY public/ ./public/

# Create data directory (mount as volume for persistence)
RUN mkdir -p /app/data

# Setup DB on first run via entrypoint
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000
ENV TZ=Europe/Madrid

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "src/server.js"]
