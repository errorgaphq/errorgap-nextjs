import { describe, expect, it } from "vitest";
import { requestErrorContext } from "../src/context";

describe("requestErrorContext", () => {
  it("maps Next.js onRequestError args to notice context + environment", () => {
    expect(
      requestErrorContext(
        { path: "/api/orders?debug=1", method: "POST" },
        { routerKind: "App Router", routePath: "/api/orders", routeType: "route" },
      ),
    ).toEqual({
      context: {
        source: "nextjs.onRequestError",
        component: "/api/orders",
        action: "POST",
        url: "/api/orders?debug=1",
        router_kind: "App Router",
        route_type: "route",
      },
      environment: { method: "POST", path: "/api/orders" },
    });
  });

  it("tolerates missing request/context", () => {
    expect(requestErrorContext(undefined, undefined)).toEqual({
      context: { source: "nextjs.onRequestError" },
      environment: {},
    });
  });
});
