FROM node:24-bookworm-slim
# Load the locked native addon from the read-only image. Shared tmpfs is noexec.
ENV NARB_DISABLE_NATIVE_CACHE=1
WORKDIR /service
COPY services/deepseek-harness/package.json services/deepseek-harness/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
RUN ln -s /service/node_modules/.bin/dsh /usr/local/bin/dsh
COPY services/deepseek-harness/*.mjs ./
COPY vendor/deepseek-harness/ /opt/deepseek-harness/
USER node
EXPOSE 3081
CMD ["node", "server.mjs"]
