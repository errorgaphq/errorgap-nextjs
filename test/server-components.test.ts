import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Errorgap } from "@errorgap/node";
import { captureRequestError, register } from "../src/index";
import { withErrorgapAction, withErrorgapPage } from "../src/server-components";

describe("server actions and pages", () => {
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
    register({ endpoint: `http://127.0.0.1:${port}`, projectSlug: "demo", captureGlobals: false, apm: true });
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

  it("records an action call and links the error it throws", async () => {
    const placeOrder = withErrorgapAction("placeOrder", async (qty: number) => {
      void Errorgap.notify(new Error("card declined"), { sync: true });
      if (qty > 1) throw new Error("out of stock");
      return "ok";
    });
    expect(await placeOrder(1)).toBe("ok");
    const error = await placeOrder(2).catch((e) => e);
    await captureRequestError(error, { path: "/checkout", method: "POST" }, { routerKind: "App Router", routePath: "/checkout", routeType: "action" });
    await settle(5);

    const txns = of("transactions");
    expect(txns.map((t) => [t.path, t.method, t.status_code])).toEqual([
      ["action:placeOrder", "POST", 200],
      ["action:placeOrder", "POST", 500],
    ]);
    const thrown = of("notices").find((n) => (n.errors as Array<{ message: string }>)[0]!.message === "out of stock")!;
    expect((thrown.context as Record<string, unknown>).transaction_id).toBe(txns[1]!.id);
  });

  it("records page renders, treating redirects and notFound as control flow", async () => {
    const Page = withErrorgapPage(async ({ id }: { id: string }) => {
      if (id === "gone") throw Object.assign(new Error("NEXT_HTTP_ERROR_FALLBACK;404"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
      if (id === "moved") throw Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/orders/1;307;" });
      return `order ${id}`;
    }, "/orders/[id]");
    expect(await Page({ id: "7" })).toBe("order 7");
    await Page({ id: "gone" }).catch(() => undefined);
    await Page({ id: "moved" }).catch(() => undefined);
    await settle(3);

    expect(of("transactions").map((t) => [t.path, t.status_code])).toEqual([
      ["/orders/[id]", 200],
      ["/orders/[id]", 404],
      ["/orders/[id]", 307],
    ]);
  });
});
