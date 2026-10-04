import {
  Errorgap,
  TRACE_HEADER,
  browserTraceId,
  newTransactionId,
  runInTransaction,
} from "@errorgap/node";
import { tagWithTransaction } from "./route";

/**
 * The `x-errorgap-trace` header of the request being rendered, if any. The
 * browser SDK adds it to the fetches Next.js makes for client-side
 * navigations and server actions.
 */
async function requestTraceId(): Promise<string | undefined> {
  try {
    const { headers } = await import("next/headers");
    const list = await headers();
    return browserTraceId(list.get(TRACE_HEADER));
  } catch {
    // Outside a request scope (tests, build-time prerendering).
    return undefined;
  }
}

/**
 * Next.js signals redirects and not-found by throwing errors with a `digest`;
 * they are control flow, not failures.
 */
function controlFlowStatus(error: unknown): number | undefined {
  const digest = (error as { digest?: unknown } | null)?.digest;
  if (typeof digest !== "string") return undefined;
  if (digest.startsWith("NEXT_REDIRECT")) return 307;
  if (digest === "NEXT_NOT_FOUND" || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK;404")) return 404;
  if (digest.startsWith("NEXT_HTTP_ERROR_FALLBACK;")) {
    const status = Number(digest.split(";")[1]);
    return Number.isFinite(status) ? status : undefined;
  }
  return undefined;
}

async function track<T>(
  meta: { method: string; path: string },
  operation: () => Promise<T> | T,
): Promise<T> {
  const id = newTransactionId();
  const traceId = await requestTraceId();
  const startedAt = new Date().toISOString();
  const start = performance.now();
  let status = 200;
  try {
    return await runInTransaction(id, operation);
  } catch (error) {
    const controlFlow = controlFlowStatus(error);
    if (controlFlow !== undefined) {
      status = controlFlow;
    } else {
      status = 500;
      tagWithTransaction(error, id);
    }
    throw error;
  } finally {
    void Errorgap.notifyTransaction({
      id,
      traceId,
      kind: "web",
      method: meta.method,
      path: meta.path,
      durationMs: performance.now() - start,
      statusCode: status,
      occurredAt: startedAt,
    });
  }
}

/**
 * Wrap a server action so each call is an APM transaction named
 * `action:<name>` (with `apm` on in `register`). Errors reported while it
 * runs — and the error it throws, through `onRequestError` — carry the
 * transaction id, and the browser SDK's `x-errorgap-trace` header links the
 * browser's view of the call to it.
 *
 * ```ts
 * "use server";
 * export const placeOrder = withErrorgapAction("placeOrder", async (form: FormData) => { ... });
 * ```
 */
export function withErrorgapAction<A extends unknown[], R>(
  name: string,
  action: (...args: A) => Promise<R> | R,
): (...args: A) => Promise<R> {
  return (...args: A) => track({ method: "POST", path: `action:${name}` }, () => action(...args));
}

/**
 * Wrap a Server Component page so each render is an APM transaction grouped
 * under `route` (the page's path template, e.g. `/orders/[id]`). It times the
 * page function — its data fetching — not the streaming of the HTML after.
 * Redirects and `notFound()` are recorded as 307 / 404, not errors.
 *
 * ```tsx
 * async function OrderPage({ params }: { params: Promise<{ id: string }> }) { ... }
 * export default withErrorgapPage(OrderPage, "/orders/[id]");
 * ```
 */
export function withErrorgapPage<P, R>(
  page: (props: P) => Promise<R> | R,
  route: string,
): (props: P) => Promise<R> {
  const wrapped = (props: P) => track({ method: "GET", path: route }, () => page(props));
  Object.defineProperty(wrapped, "name", { value: page.name || "ErrorgapPage" });
  return wrapped;
}
