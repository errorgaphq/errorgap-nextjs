import { Errorgap } from "@errorgap/browser";
import { clientConfig, isConfigured, type ErrorgapNextOptions } from "./config";
import { VERSION } from "./version";

export type { ErrorgapNextOptions } from "./config";
export { Errorgap, VERSION };

let initialized = false;

/**
 * Initialize client-side error reporting. Call from `instrumentation-client.ts`
 * (Next.js 15.3+), which runs once before hydration:
 *
 * ```ts
 * // instrumentation-client.ts
 * import { initErrorgapClient } from "@errorgap/nextjs/client";
 * initErrorgapClient();
 * ```
 *
 * Reads `NEXT_PUBLIC_ERRORGAP_*` env vars unless overridden by `options`. Hooks
 * `window` error / unhandledrejection and resolves stack frames through source
 * maps. With `performance` (or `NEXT_PUBLIC_ERRORGAP_PERFORMANCE=true`) it also
 * measures page loads, client-side navigations, Web Vitals and API calls.
 */
export function initErrorgapClient(options: ErrorgapNextOptions = {}): void {
  if (initialized) return;
  const config = clientConfig(options);
  if (!isConfigured(config)) return;

  Errorgap.init({
    endpoint: config.endpoint,
    projectSlug: config.projectSlug,
    projectId: config.projectId,
    apiKey: config.apiKey,
    environment: config.environment,
    release: config.release,
    sampleRate: config.sampleRate,
    sourceMaps: config.sourceMaps,
    captureGlobals: config.captureGlobals ?? true,
    performance: config.performance,
  });
  initialized = true;
}
