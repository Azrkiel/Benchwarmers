# Benchwarmers on Fly.io: one Node process serves the web build, REST, rooms and /mcp.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build:widget -w server && npm run build -w web

FROM node:22-slim
ENV NODE_ENV=production PORT=3001 AI_MODE=fallback ASSISTANT_MODE=offline SPEED=4 ROOM_SPEED=1
WORKDIR /app
COPY --from=build /app /app
# Saved parties, rooms and imported games live on the mounted volume.
WORKDIR /app/server
EXPOSE 3001
CMD ["node", "/app/node_modules/tsx/dist/cli.mjs", "src/index.ts"]
