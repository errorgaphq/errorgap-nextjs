export interface ErrorgapNextOptions {
  endpoint?: string;
  projectSlug?: string;
  projectId?: string;
  /**
   * Ingestion-only key (`x-errorgap-project-key`). It can submit notices but not
   * read data, so on the client it is exposed through `NEXT_PUBLIC_ERRORGAP_API_KEY`
   * — like a Sentry DSN.
   */
  apiKey?: string;
  environment?: string;
  release?: string;
  /** Fraction (0..1) of captured errors to report. */
  sampleRate?: number;
  /** Resolve client stack frames through deployed source maps. Client only. */
  sourceMaps?: boolean;
  /** Install global window/process handlers. Defaults to true. */
  captureGlobals?: boolean;
}

type Env = Record<string, string | undefined>;

function env(): Env {
  return typeof process !== "undefined" && process.env ? process.env : {};
}

/** Server-side config: reads `ERRORGAP_*`, falling back to the public vars. */
export function serverConfig(options: ErrorgapNextOptions = {}): ErrorgapNextOptions {
  const e = env();
  return {
    endpoint: options.endpoint ?? e.ERRORGAP_ENDPOINT ?? e.NEXT_PUBLIC_ERRORGAP_ENDPOINT,
    projectSlug: options.projectSlug ?? e.ERRORGAP_PROJECT_SLUG ?? e.NEXT_PUBLIC_ERRORGAP_PROJECT_SLUG,
    projectId: options.projectId ?? e.ERRORGAP_PROJECT_ID ?? e.NEXT_PUBLIC_ERRORGAP_PROJECT_ID,
    apiKey: options.apiKey ?? e.ERRORGAP_API_KEY ?? e.NEXT_PUBLIC_ERRORGAP_API_KEY,
    environment: options.environment ?? e.ERRORGAP_ENVIRONMENT ?? e.NODE_ENV,
    release: options.release ?? e.ERRORGAP_RELEASE,
    sampleRate: options.sampleRate,
    captureGlobals: options.captureGlobals,
  };
}

/**
 * Client-side config: reads the build-time `NEXT_PUBLIC_ERRORGAP_*` vars.
 *
 * These must be referenced as literal `process.env.NEXT_PUBLIC_*` expressions —
 * Next.js inlines them at build time by matching that exact token, so aliasing
 * `process.env` to a variable first would leave them `undefined` in the browser.
 */
export function clientConfig(options: ErrorgapNextOptions = {}): ErrorgapNextOptions {
  return {
    endpoint: options.endpoint ?? process.env.NEXT_PUBLIC_ERRORGAP_ENDPOINT,
    projectSlug: options.projectSlug ?? process.env.NEXT_PUBLIC_ERRORGAP_PROJECT_SLUG,
    projectId: options.projectId ?? process.env.NEXT_PUBLIC_ERRORGAP_PROJECT_ID,
    apiKey: options.apiKey ?? process.env.NEXT_PUBLIC_ERRORGAP_API_KEY,
    environment: options.environment ?? process.env.NEXT_PUBLIC_ERRORGAP_ENVIRONMENT ?? process.env.NODE_ENV,
    release: options.release ?? process.env.NEXT_PUBLIC_ERRORGAP_RELEASE,
    sampleRate: options.sampleRate,
    sourceMaps: options.sourceMaps,
    captureGlobals: options.captureGlobals,
  };
}

export function isConfigured(config: ErrorgapNextOptions): boolean {
  return Boolean(config.endpoint && config.projectSlug);
}
