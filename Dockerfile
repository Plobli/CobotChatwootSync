FROM node:20-alpine

WORKDIR /app

# Package files kopieren
COPY package*.json ./

# Dependencies installieren
RUN npm ci --only=production

# App-Code kopieren
COPY . .

# Port exponieren
EXPOSE 3002

# Start-Command
CMD ["node", "server.js"]