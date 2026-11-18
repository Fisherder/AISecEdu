FROM node:24-bookworm-slim
WORKDIR /service
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY . .
USER node
EXPOSE 3081
CMD ["node", "server.mjs"]
