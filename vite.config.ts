// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    resolve: {
      alias: {
        // pdf-lib is compiled with importHelpers and imports tslib as a default
        // import. When bundled for the Cloudflare Worker (production), the CJS
        // interop wrapper resolves tslib's default to undefined and destructuring
        // `__extends` throws at module init. Point tslib at its ESM entry so the
        // named helpers resolve correctly in the Worker bundle.
        tslib: "tslib/tslib.es6.js",
      },
    },
  },
});
