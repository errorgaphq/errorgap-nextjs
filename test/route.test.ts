import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Errorgap } from "@errorgap/node";
import { captureRequestError, register } from "../src/index";
import { requestSpans, routeTemplate, withErrorgap, withErrorgapApi } from "../src/route";

describe("routeTemplate", () => {
  it("swaps dynamic segment values for their param names", () => {
    expect(routeTemplate("/api/orders/7/items/3", { id: "7", item: "3" })).toBe("/api/orders/[id]/items/[item]");
    expect(routeTemplate("/docs/a/b/c", { slug: ["a", "b", "c"] })).toBe("/docs/[...slug]");
    expect(routeTemplate("/api/health?x=1", {})).toBe("/api/health");
    expect(routeTemplate("/api/users/john%20doe", { name: "john doe" })).toBe("/api/users/[name]");
    expect(routeTemplate("/api/x", undefined)).toBe("/api/x");
  });
});

describe("request tracking", () => {
  let server: Server;
  let bodies: Array<{ url: string; body: Record<string, unknown> }>;

  beforeEach(async () => {
    bodies = [];
    server = createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        bodies.push({ url: req.url ?? "", body: JSON.parse(raw || "{}") });
        res.writeHead(201);
        res.end("{}");
      });
    });
    const port = await new Promise<number>((r) => server.listen(0, "127.0.0.1", () => r((server.address() as AddressInfo).port)));
    Errorgap.init({ endpoint: `http://127.0.0.1:${port}`, projectSlug: "demo", async: false, captureGlobals: false, apmEnabled: true });
  });

  afterEach(() => {
    server.close();
  });

  async function settle(count: number): Promise<void> {
    for (let i = 0; i < 100 && bodies.length < count; i++) await new Promise((r) => setTimeout(r, 10));
    await Errorgap.flush();
  }
  const of = (kind: string) => bodies.filter((b) => b.url.endsWith(`/${kind}`)).map((b) => b.body);

  it("records an App Router handler with its template, status, spans and browser trace", async () => {
    const GET = withErrorgap(async (request: Request, _ctx: { params: Promise<{ id: string }> }) => {
      requestSpans(request)?.database("SELECT * FROM orders WHERE id = 7", 1.5);
      await new Promise((r) => setTimeout(r, 5));
      void Errorgap.notify(new Error("card declined"), { sync: true });
      return new Response("ok", { status: 201 });
    });
    const request = new Request("http://app.test/api/orders/7?x=1", {
      headers: { "x-errorgap-trace": "0192F3C4-7A1B-4C2D-9E3F-0123456789AB" },
    });
    const response = await GET(request, { params: Promise.resolve({ id: "7" }) });
    expect(response.status).toBe(201);
    await settle(2);

    const [txn] = of("transactions");
    expect(txn!.path).toBe("/api/orders/[id]");
    expect(txn!.path_raw).toBe("/api/orders/7");
    expect(txn!.status_code).toBe(201);
    expect(txn!.trace_id).toBe("0192f3c4-7a1b-4c2d-9e3f-0123456789ab");
    expect((txn!.spans as Array<Record<string, unknown>>)[0]!.sql).toBe("SELECT * FROM orders WHERE id = ?");
    const [notice] = of("notices");
    expect((notice!.context as Record<string, unknown>).transaction_id).toBe(txn!.id);
  });

  it("links a thrown error reported by onRequestError to the failed request", async () => {
    register({ endpoint: Errorgap.configuration().endpoint, projectSlug: "demo", captureGlobals: false, apm: true });
    const POST = withErrorgap(async () => {
      throw new Error("kaboom");
    }, { route: "/api/checkout" });
    const error = await POST(new Request("http://app.test/api/checkout", { method: "POST" }), undefined).catch((e) => e);
    await captureRequestError(error, { path: "/api/checkout", method: "POST" }, { routerKind: "App Router", routePath: "/api/checkout", routeType: "route" });
    await settle(2);

    const [txn] = of("transactions");
    expect(txn!.status_code).toBe(500);
    expect(txn!.path).toBe("/api/checkout");
    expect(txn).not.toHaveProperty("trace_id");
    const [notice] = of("notices");
    expect((notice!.context as Record<string, unknown>).transaction_id).toBe(txn!.id);
  });

  it("records a Pages Router API route when the response finishes", async () => {
    const listeners: Record<string, () => void> = {};
    const res = { statusCode: 200, once: (event: string, fn: () => void) => (listeners[event] = fn) };
    const handler = withErrorgapApi(async (_req, response: typeof res) => {
      response.statusCode = 204;
    });
    await handler(
      { method: "DELETE", url: "/api/orders/9?force=1", query: { id: "9", force: "1" }, headers: { "x-errorgap-trace": "bad" } },
      res,
    );
    listeners.finish!();
    await settle(1);

    const [txn] = of("transactions");
    expect(txn!.path).toBe("/api/orders/[id]");
    expect(txn!.status_code).toBe(204);
    expect(txn).not.toHaveProperty("trace_id");
  });
});
