# Offline Three.js runtime

`three-r150.min.js` is the unmodified UMD build of Three.js **0.150.1**. The
filename retains the r150 family name; 0.150.0 must not be substituted because
its WebGL1 shader regression leaves standard-material scenes blank.

- Source: https://registry.npmjs.org/three/-/three-0.150.1.tgz
- npm archive integrity: `sha512-5C1MqKUWaHYo13BX0Q64qcdwImgnnjSOFgBscOzAo8MYCzEtqfQqorEKMcajnA3FHy1yVlIe9AmaMQ0OQracNA==`
- Build SHA-256: `72c8a8302444fb39cb8e04be1f556b2fdca798e606a99b4b37c8cfe3e3ee3272`
- License: MIT; see `three-LICENSE.txt`.
- Regression coverage: `tests/interactive-browser.test.ts` renders visible
  standard-material geometry using both WebGL1 and WebGL2 with no network.

## Cinematic renderer

`cinematic-three-r150.min.js` bundles the same verified Three.js 0.150.1
archive with its official `EffectComposer`, `RenderPass`, `UnrealBloomPass`
and `RoomEnvironment` modules, plus a final `GammaCorrectionShader` pass.
No CDN is needed by generated scenes.

- Rebuild: `node ops/build-cinematic-vendor.mjs /absolute/path/to/extracted/three/package`
- Entry: `services/agent-runtime/lib/cinematic/three-vendor-entry.js`
- Build tool: esbuild 0.27.7, existing Vitest dependency.
- Bundle SHA-256: `52c83c2ff1e567b53ea0a4cb8a6823111644cf69f7700711278fb43f54fe17bc`
- License: MIT, same Three.js license above; procedural models and player are project code.
