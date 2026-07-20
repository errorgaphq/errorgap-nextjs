// Pure helper that turns Next.js `onRequestError` arguments into Errorgap notice
// options. Framework-object-free so it can be unit tested without Next.

export interface NextRequestInfo {
  path?: string;
  method?: string;
  headers?: Record<string, string>;
}

export interface NextErrorContext {
  routerKind?: string;
  routePath?: string;
  routeType?: string;
  renderSource?: string;
}

export function requestErrorContext(
  request: NextRequestInfo | null | undefined,
  meta: NextErrorContext | null | undefined,
): { context: Record<string, unknown>; environment: Record<string, unknown> } {
  const context: Record<string, unknown> = { source: "nextjs.onRequestError" };
  if (meta?.routePath) context.component = meta.routePath;
  if (request?.method) context.action = request.method;
  if (request?.path) context.url = request.path;
  if (meta?.routerKind) context.router_kind = meta.routerKind;
  if (meta?.routeType) context.route_type = meta.routeType;

  const environment: Record<string, unknown> = {};
  if (request?.method) environment.method = request.method;
  if (request?.path) environment.path = stripQuery(request.path);

  return { context, environment };
}

function stripQuery(path: string): string {
  const index = path.indexOf("?");
  return index === -1 ? path : path.slice(0, index);
}
