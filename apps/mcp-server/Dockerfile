FROM node:22-bookworm-slim AS build
WORKDIR /repo

COPY package.json package-lock.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/frontend/package.json apps/frontend/package.json
COPY apps/mcp-server/package.json apps/mcp-server/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci

COPY packages/shared packages/shared
COPY apps/mcp-server apps/mcp-server
RUN npm run build -w packages/shared
RUN npm run build -w apps/mcp-server

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /repo/package.json /repo/package-lock.json ./
COPY --from=build /repo/apps/mcp-server/package.json apps/mcp-server/package.json
COPY --from=build /repo/packages/shared/package.json packages/shared/package.json
RUN npm ci --omit=dev --workspace=@life-kit/mcp-server --workspace=@life-kit/shared

COPY --from=build /repo/packages/shared/dist packages/shared/dist
COPY --from=build /repo/apps/mcp-server/dist apps/mcp-server/dist

EXPOSE 3002
CMD ["node", "apps/mcp-server/dist/index.js"]
