FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .

# Versionsinfo (wird von update.sh/install.sh per Build-Arg übergeben)
ARG GIT_COMMIT=unknown
ARG BUILD_DATE=unknown
ENV GIT_COMMIT=$GIT_COMMIT BUILD_DATE=$BUILD_DATE

EXPOSE 5000
CMD ["node", "src/server.js"]
