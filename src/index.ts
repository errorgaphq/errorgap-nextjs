import { Errorgap } from "@errorgap/node";
import { isConfigured, serverConfig, type ErrorgapNextOptions } from "./config";
import { requestErrorContext, type NextErrorContext, type NextRequestInfo } from "./context";
import { VERSION } from "./version";

export type { ErrorgapNextOptions } from "./config";
export type { NextErrorContext, NextRequestInfo } from "./context";
export { Errorgap, VERSION };

let initialized = false;

/**
 * Initialize server-side error reporting. Call from the `register()` export of
 * your `instrumentation.ts`:
 *
 * ```ts
 * export { register, onRequestError } from "@errorgap/nextjs";
 * ```
 *
 * No-ops on the Edge runtime — the Node notifier is not Edge-compatible yet.
 */
export function register(options: ErrorgapNextOptions = {}): void {
  if (initialized) return;
  if (typeof process !== "undefined" && process.env.NEXT_RUNTIME === "edge") return;

  const config = serverConfig(options);
  if (!isConfigured(config)) return;

  Errorgap.init({
    endpoint: config.endpoint,
    projectSlug: config.projectSlug,
    projectId: config.projectId,
    apiKey: config.apiKey,
    environment: config.environment,
    captureGlobals: config.captureGlobals ?? true,
  });
  initialized = true;
}

/**
 * Report a server request error. Next.js 15+ calls the `onRequestError` export
 * of `instrumentation.ts` for every unhandled error in Server Components, Route
 * Handlers, middleware, and server actions.
 */
export async function captureRequestError(
  error: unknown,
  request: NextRequestInfo,
  context: NextErrorContext,
): Promise<void> {
  if (!initialized) register();
  if (!initialized) return;

  const { context: ctx, environment } = requestErrorContext(request, context);
  // Deliver synchronously: serverless functions may freeze once the response
  // is sent, so a fire-and-forget request can be dropped.
  await Errorgap.notify(error, { context: ctx, environment, sync: true });
}

/** Alias so `export { register, onRequestError } from "@errorgap/nextjs"` works. */
export const onRequestError = captureRequestError;
