FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
ARG NPM_CONFIG_REGISTRY
RUN npm ci --omit=dev && npm cache clean --force
COPY --chown=node:node server ./server
COPY --chown=node:node shared ./shared
COPY --chown=node:node public ./public
USER node
EXPOSE 3000
CMD ["node", "server/server.js"]
