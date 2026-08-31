# ---- Stage 1: Base ----
FROM node:22-alpine AS base

RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate

WORKDIR /app

# ---- Stage 2: Dependencies ----
FROM base AS deps

# Native build tools for sharp, @napi-rs/canvas
RUN apk add --no-cache python3 build-base g++ cairo-dev pango-dev jpeg-dev giflib-dev librsvg-dev

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/ ./packages/
COPY scripts/ ./scripts/

RUN pnpm install --frozen-lockfile

# ---- Stage 3: Builder ----
FROM base AS builder

ARG NEXT_PUBLIC_PERSISTENCE
ARG NEXT_PUBLIC_PERSISTENCE_TOKEN
ARG NEXT_PUBLIC_MAIC_EDITOR_ENABLED
ARG NEXT_PUBLIC_PI_CHAT_ENABLED
ARG NEXT_PUBLIC_SHOW_VOCATIONAL_TEST_UI
ARG NEXT_PUBLIC_ENABLE_VIDEO_EXPORT
ARG NEXT_PUBLIC_ENABLE_PPTX_IMPORT
ARG AISECEDU_INTEGRATED=true
ARG NEXT_PUBLIC_AISECEDU_INTEGRATED=false
ARG NEXT_PUBLIC_BASE_PATH=
ENV NEXT_PUBLIC_PERSISTENCE=$NEXT_PUBLIC_PERSISTENCE
ENV NEXT_PUBLIC_PERSISTENCE_TOKEN=$NEXT_PUBLIC_PERSISTENCE_TOKEN
ENV NEXT_PUBLIC_MAIC_EDITOR_ENABLED=$NEXT_PUBLIC_MAIC_EDITOR_ENABLED
ENV NEXT_PUBLIC_PI_CHAT_ENABLED=$NEXT_PUBLIC_PI_CHAT_ENABLED
ENV NEXT_PUBLIC_SHOW_VOCATIONAL_TEST_UI=$NEXT_PUBLIC_SHOW_VOCATIONAL_TEST_UI
ENV NEXT_PUBLIC_ENABLE_VIDEO_EXPORT=$NEXT_PUBLIC_ENABLE_VIDEO_EXPORT
ENV NEXT_PUBLIC_ENABLE_PPTX_IMPORT=$NEXT_PUBLIC_ENABLE_PPTX_IMPORT
ENV AISECEDU_INTEGRATED=$AISECEDU_INTEGRATED
ENV NEXT_PUBLIC_AISECEDU_INTEGRATED=$NEXT_PUBLIC_AISECEDU_INTEGRATED
ENV NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY . .
COPY --from=deps /app/public/vendor ./public/vendor

RUN pnpm build

# ---- Stage 4: Runner ----
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN apk add --no-cache libc6-compat cairo pango jpeg giflib librsvg

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Next.js output tracing cannot discover files whose paths are assembled at
# runtime with process.cwd().  These immutable assets are required by lesson
# materialization, PBL, curriculum lookup, and the cybersecurity generators.
COPY --from=builder --chown=nextjs:nodejs /app/lib/prompts ./lib/prompts
COPY --from=builder --chown=nextjs:nodejs /app/lib/pbl/v2/prompts ./lib/pbl/v2/prompts
COPY --from=builder --chown=nextjs:nodejs /app/lib/curriculum ./lib/curriculum
COPY --from=builder --chown=nextjs:nodejs /app/lib/security ./lib/security

RUN test -s lib/prompts/templates/slide-plan/system.md && \
    test -s lib/pbl/v2/prompts/planner-system.md && \
    test -s lib/curriculum/curriculum.json && \
    test -s lib/security/knowledge-base.json && \
    test -s lib/security/templates/sqli-lab.html

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
