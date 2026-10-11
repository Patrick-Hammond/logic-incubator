# Build from the repo root, since the relay's rules live in packages/lib:
#   docker build -f relay/Dockerfile -t relay .
FROM node:24-alpine
WORKDIR /app
COPY relay/package.json relay/package-lock.json relay/
RUN npm ci --prefix relay --omit=dev
COPY packages/lib/src/net/RelayRooms.ts packages/lib/src/net/
COPY relay/server.mjs relay/
ENV PORT=8787
EXPOSE 8787
USER node
CMD ["node", "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "relay/server.mjs"]
