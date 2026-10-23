FROM mcr.microsoft.com/playwright:v1.58.2-noble@sha256:6446946a1d9fd62d9ae501312a2d76a43ee688542b21622056a372959b65d63d
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY inspector.mjs cinematic.mjs process.mjs decision-witness.mjs domain-decisions.mjs inspection-context.mjs inspection-http.mjs server.mjs queue.mjs ./
USER pwuser
EXPOSE 3015
CMD ["node", "server.mjs"]
