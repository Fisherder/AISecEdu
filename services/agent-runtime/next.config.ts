import type { NextConfig } from 'next';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH?.trim() || '';
const configuredBuildCpus = Number.parseInt(
  process.env.GLOBAL_AGENT_RUNTIME_BUILD_CPUS ?? process.env.OPENMAIC_BUILD_CPUS ?? '4',
  10,
);
const buildCpus =
  Number.isFinite(configuredBuildCpus) && configuredBuildCpus > 0
    ? Math.min(configuredBuildCpus, 16)
    : 4;

const nextConfig: NextConfig = {
  ...(basePath ? { basePath } : {}),
  output: process.env.VERCEL ? undefined : 'standalone',
  // Lets CI/verification builds avoid clobbering a running developer server.
  distDir:
    process.env.GLOBAL_AGENT_RUNTIME_NEXT_DIST_DIR || process.env.OPENMAIC_NEXT_DIST_DIR || '.next',
  transpilePackages: ['mathml2omml', 'pptxgenjs', '@openmaic/importer'],
  // The parent workspace contains unrelated projects and lockfiles. Pinning
  // Turbopack here avoids scanning the entire /ccr workspace during builds.
  turbopack: {
    root: process.cwd(),
  },
  // These agent packages do a runtime `import(specifier)` with a computed
  // specifier (to lazily load node:fs/os/path without breaking browser/Vite
  // builds). webpack can't statically analyze that and bundling it throws
  // "Cannot find module as expression is too dynamic" at runtime on the server
  // (the "Edit with AI" Pro-mode path), which broke the #619 keep-alive e2e.
  // Mark them server-external so Next loads them natively and the dynamic
  // import resolves as a real Node call.
  serverExternalPackages: [
    '@earendil-works/pi-ai',
    '@earendil-works/pi-agent-core',
    // PGlite resolves its WASM/data assets with native Node URL objects. When
    // webpack inlines it into a standalone server chunk, that URL crosses the
    // bundle boundary and Node's fs/path APIs reject it at runtime.
    '@electric-sql/pglite',
  ],
  experimental: {
    proxyClientMaxBodySize: '200mb',
    // Large CI hosts can expose dozens of CPUs without enough memory to run
    // that many static-generation workers. Keep the default predictable while
    // allowing operators to tune it for their deployment host.
    cpus: buildCpus,
    staticGenerationMaxConcurrency: Math.min(buildCpus, 4),
    webpackBuildWorker: false,
  },
  async headers() {
    const extraAncestors = process.env.ALLOWED_FRAME_ANCESTORS?.trim();
    const frameAncestors = extraAncestors ? `'self' ${extraAncestors}` : "'self'";

    return [
      {
        source: '/(.*)',
        headers: [
          // X-Frame-Options only supports SAMEORIGIN (no allow-list),
          // so we omit it when custom ancestors are configured.
          ...(!extraAncestors ? [{ key: 'X-Frame-Options', value: 'SAMEORIGIN' }] : []),
          {
            key: 'Content-Security-Policy',
            value: `frame-ancestors ${frameAncestors}`,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
