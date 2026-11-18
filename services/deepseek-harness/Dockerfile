FROM node:24-bookworm-slim
WORKDIR /service
COPY services/deepseek-harness/package.json services/deepseek-harness/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
RUN ln -s /service/node_modules/.bin/dsh /usr/local/bin/dsh
COPY services/deepseek-harness/*.mjs ./
COPY vendor/deepseek-harness/ /opt/deepseek-harness/
USER node
EXPOSE 3081
CMD ["node", "server.mjs"]
