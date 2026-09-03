ARG NODE_IMAGE=node:22.22.0-bookworm-slim@sha256:dd9d21971ec4395903fa6143c2b9267d048ae01ca6d3ea96f16cb30df6187d94
FROM ${NODE_IMAGE} AS service-build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /workspace/service

RUN corepack enable && corepack prepare pnpm@10.33.2 --activate
COPY service/package.json service/pnpm-lock.yaml service/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY service/nest-cli.json service/tsconfig.json service/tsconfig.build.json service/tsconfig.paths.json ./
COPY service/src ./src
RUN pnpm build && pnpm prune --prod && touch /tmp/service-build-complete

FROM ${NODE_IMAGE} AS chat-build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NODE_OPTIONS=--max-old-space-size=4096
WORKDIR /workspace/chat

RUN corepack enable && corepack prepare pnpm@10.33.2 --activate
COPY chat/package.json chat/pnpm-lock.yaml chat/pnpm-workspace.yaml chat/.pnpmfile.cjs chat/.npmrc ./
RUN pnpm install --frozen-lockfile
COPY chat ./
COPY --from=service-build /tmp/service-build-complete /tmp/service-build-complete
RUN pnpm type-check && pnpm build && touch /tmp/chat-build-complete

FROM ${NODE_IMAGE} AS admin-build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NODE_OPTIONS=--max-old-space-size=4096
WORKDIR /workspace/admin

RUN corepack enable && corepack prepare pnpm@10.33.2 --activate
COPY admin/package.json admin/pnpm-lock.yaml admin/pnpm-workspace.yaml admin/.npmrc ./
RUN pnpm install --frozen-lockfile
COPY admin ./
COPY --from=chat-build /tmp/chat-build-complete /tmp/chat-build-complete
RUN pnpm build

FROM ${NODE_IMAGE} AS runtime

ENV NODE_ENV=production
ENV TZ=Asia/Shanghai
WORKDIR /app

COPY --from=service-build --chown=node:node /workspace/service/package.json ./package.json
COPY --from=service-build --chown=node:node /workspace/service/node_modules ./node_modules
COPY --from=service-build --chown=node:node /workspace/service/dist ./dist
COPY --from=chat-build --chown=node:node /workspace/chat/dist ./public/chat
COPY --from=admin-build --chown=node:node /workspace/admin/dist ./public/admin

RUN mkdir -p public/file logs && chown -R node:node public logs

USER node
EXPOSE 9520
# 存活检查走 /api/health（GET 与其它方法一样带 /api 前缀）。勿用 /health：SPA 兜底会返回 200 HTML。
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD ["node", "-e", "const p=process.env.PORT||9520;fetch('http://127.0.0.1:'+p+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "dist/main.js"]
