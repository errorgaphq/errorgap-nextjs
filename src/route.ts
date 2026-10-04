import {
  Errorgap,
  TRACE_HEADER,
  browserTraceId,
  newTransactionId,
  runInTransaction,
  SpanCollector,
} from "@errorgap/node";

type Params = Record<string, string | string[] | undefined>;

/** Options for {@link withErrorgap} and {@link withErrorgapApi}. */
export interface RouteTrackingOptions {
  /**
   * The route template requests are grouped by, e.g. `/api/orders/[id]`.
   * Defaults to the request path with dynamic segments replaced by their
   * param names, from the params Next.js passes the handler.
   */
  route?: string;
}

const TRANSACTION_ID = Symbol.for("@errorgap/nextjs/transaction-id");
const SPANS = Symbol.for("@errorgap/nextjs/spans");

/**
 * The request path with dynamic segment values swapped for their param names
 * (`/api/orders/7` + `{ id: "7" }` → `/api/orders/[id]`); catch-all params
 * cover their run of segments (`[...slug]`).
 */
export function routeTemplate(pathname: string, params: Params | undefined): string {
  const path = pathname.split("?")[0] || "/";
  if (!params) return path;
  let segments = path.split("/");
  for (const [name, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      const joined = value.map(encodeSegment);
      const at = indexOfRun(segments, joined);
      if (at >= 0) segments = [...segments.slice(0, at), `[...${name}]`, ...segments.slice(at + joined.length)];
    } else if (typeof value === "string" && value.length > 0) {
      const at = segments.lastIndexOf(encodeSegment(value));
      if (at > 0) segments[at] = `[${name}]`;
    }
  }
  return segments.join("/") || "/";
}

function encodeSegment(value: string): string {
  return encodeURIComponent(value);
}

function indexOfRun(segments: string[], run: string[]): number {
  for (let i = 1; i + run.length <= segments.length; i++) {
    if (run.every((part, j) => segments[i + j] === part)) return i;
  }
  return -1;
}

/**
 * The transaction id of the request an error was raised in, when it was
 * thrown through {@link withErrorgap}; `onRequestError` puts it on the notice.
 */
export function transactionIdOf(error: unknown): string | undefined {
  if (error && typeof error === "object") {
    const id = (error as Record<symbol, unknown>)[TRANSACTION_ID];
    if (typeof id === "string") return id;
  }
  return undefined;
}

function tag(error: unknown, id: string): void {
  if (error && typeof error === "object" && Object.isExtensible(error)) {
    try {
      Object.defineProperty(error, TRANSACTION_ID, { value: id, configurable: true });
    } catch {
      // Frozen or exotic errors simply stay unlinked.
    }
  }
}

/**
 * The span collector of the request a handler wrapped by {@link withErrorgap}
 * is serving, for recording DB and outbound HTTP spans.
 */
export function requestSpans(request: unknown): SpanCollector | undefined {
  if (request && typeof request === "object") {
    return (request as Record<symbol, unknown>)[SPANS] as SpanCollector | undefined;
  }
  return undefined;
}

type RouteContext = { params?: Params | Promise<Params> } | undefined;

/**
 * Wrap an App Router route handler so each request is an APM transaction
 * (with `apm` on in `register`). Errors reported while it runs — and the
 * error it throws, through `onRequestError` — carry the transaction id, and
 * the browser SDK's `x-errorgap-trace` header links the browser's view of the
 * call to it.
 *
 * ```ts
 * export const GET = withErrorgap(async (request, { params }) => { ... });
 * ```
 */
export function withErrorgap<C extends RouteContext, R extends Response>(
  handler: (request: Request, context: C) => R | Promise<R>,
  options: RouteTrackingOptions = {},
): (request: Request, context: C) => Promise<R> {
  return async (request, context) => {
    const id = newTransactionId();
    const spans = new SpanCollector();
    try {
      Object.defineProperty(request, SPANS, { value: spans, configurable: true });
    } catch {
      // A frozen request just has no span collector.
    }
    const startedAt = new Date().toISOString();
    const start = performance.now();
    const url = new URL(request.url);
    let status = 500;
    try {
      const response = await runInTransaction(id, () => handler(request, context));
      status = response.status;
      return response;
    } catch (error) {
      tag(error, id);
      throw error;
    } finally {
      const params = await Promise.resolve(context?.params).catch(() => undefined);
      void Errorgap.notifyTransaction({
        id,
        traceId: browserTraceId(request.headers.get(TRACE_HEADER)),
        kind: "web",
        method: request.method,
        path: options.route ?? routeTemplate(url.pathname, params),
        pathRaw: url.pathname,
        statusCode: status,
        durationMs: performance.now() - start,
        occurredAt: startedAt,
        spans: spans.snapshot(),
      });
    }
  };
}

interface ApiRequestLike {
  method?: string;
  url?: string;
  query?: Params;
  headers: Record<string, string | string[] | undefined>;
}

interface ApiResponseLike {
  statusCode: number;
  once(event: "finish" | "close", listener: () => void): unknown;
}

/**
 * Wrap a Pages Router API route (`pages/api/*`) so each request is an APM
 * transaction; see {@link withErrorgap}.
 */
export function withErrorgapApi<Q extends ApiRequestLike, S extends ApiResponseLike>(
  handler: (req: Q, res: S) => unknown | Promise<unknown>,
  options: RouteTrackingOptions = {},
): (req: Q, res: S) => Promise<void> {
  return async (req, res) => {
    const id = newTransactionId();
    const spans = new SpanCollector();
    (req as unknown as Record<symbol, unknown>)[SPANS] = spans;
    const startedAt = new Date().toISOString();
    const start = performance.now();
    const pathname = (req.url ?? "/").split("?")[0] || "/";
    let failed = false;
    let recorded = false;
    const record = () => {
      if (recorded) return;
      recorded = true;
      void Errorgap.notifyTransaction({
        id,
        traceId: browserTraceId(req.headers[TRACE_HEADER]),
        kind: "web",
        method: req.method,
        path: options.route ?? routeTemplate(pathname, req.query),
        pathRaw: pathname,
        statusCode: failed ? 500 : res.statusCode,
        durationMs: performance.now() - start,
        occurredAt: startedAt,
        spans: spans.snapshot(),
      });
    };
    res.once("finish", record);
    res.once("close", record);
    try {
      await runInTransaction(id, () => handler(req, res));
    } catch (error) {
      failed = true;
      tag(error, id);
      throw error;
    }
  };
}
