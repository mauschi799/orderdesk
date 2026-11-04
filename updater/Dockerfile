FROM node:20-alpine
# git: Repo aktualisieren; docker-cli + compose: Images bauen und Container neu starten
RUN apk add --no-cache git docker-cli docker-cli-compose
WORKDIR /app
COPY server.js .
EXPOSE 4000
CMD ["node", "server.js"]
