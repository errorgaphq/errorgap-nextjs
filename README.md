# @errorgap/nextjs

Next.js SDK for [Errorgap](https://errorgap.com). It reports both **server**
(Route Handlers, Server Components, middleware, server actions) and **client**
(browser/React) errors, wiring
[`@errorgap/node`](https://github.com/errorgaphq/errorgap-node) and
[`@errorgap/browser`](https://github.com/errorgaphq/errorgap-js) into Next.js.

Works with the Next.js **App Router** (13.4+; `onRequestError` requires 15+).

## Install

```sh
npm install @errorgap/nextjs
```

## Configure

Set the connection env vars. The client build needs the `NEXT_PUBLIC_` copies
(the ingestion key is submit-only — safe in the browser, like a Sentry DSN):

```sh
# .env
ERRORGAP_ENDPOINT=https://errorgap.example.com
ERRORGAP_PROJECT_SLUG=my-project
ERRORGAP_API_KEY=flk_...

NEXT_PUBLIC_ERRORGAP_ENDPOINT=https://errorgap.example.com
NEXT_PUBLIC_ERRORGAP_PROJECT_SLUG=my-project
NEXT_PUBLIC_ERRORGAP_API_KEY=flk_...
```

### Server errors — `instrumentation.ts`

```ts
// instrumentation.ts (project root or src/)
export { register, onRequestError } from "@errorgap/nextjs";
```

`register()` initializes the notifier at server startup; `onRequestError`
(Next 15+) reports every unhandled server error with its route and method.

### Client errors — `instrumentation-client.ts`

```ts
// instrumentation-client.ts (Next 15.3+)
import { initErrorgapClient } from "@errorgap/nextjs/client";

initErrorgapClient();
```

This hooks `window` errors and unhandled rejections with source-map-resolved
stack traces.

### Browser performance

Turn on page-load, client-side navigation, Core Web Vitals and API-call timing
(Errorgap → Performance → Browser) with `NEXT_PUBLIC_ERRORGAP_PERFORMANCE=true`,
or in code:

```ts
initErrorgapClient({ performance: { sampleRate: 0.25 } });
```

Routes are grouped by path with ids templated (`/orders/123` → `/orders/:id`);
pass `performance: { routeName }` to name them yourself.

API calls carry an `x-errorgap-trace` header — same-origin by default, other
origins via `performance: { tracePropagationTargets: [...] }` — so a server
SDK that records it links each call to the server trace that answered it.

### Server performance (APM) — route handlers

Next.js has no request hook for route handlers, so wrap the ones you want
timed. Set `ERRORGAP_APM=true` (or `register({ apm: true })`); each request is
an APM transaction grouped by its route (`/api/orders/[id]`, derived from the
params Next passes — or pass `{ route }`), and errors it throws link to it
through `onRequestError`.

```ts
// app/api/orders/[id]/route.ts
import { withErrorgap, requestSpans } from "@errorgap/nextjs";

export const GET = withErrorgap(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  // requestSpans(request)?.database("SELECT * FROM orders WHERE id = $1", ms);
  return Response.json(await loadOrder(id));
});
```

Pages Router API routes use `withErrorgapApi(handler)`. Both record the
`x-errorgap-trace` header the browser SDK sends, so Performance → Browser links
each API call to the server request that answered it. Server Components and
server actions are not timed.

### React render errors — `error.tsx` / `global-error.tsx`

App Router error boundaries catch render errors that never reach
`window.onerror`. Report them:

```tsx
"use client";
import { useCaptureError } from "@errorgap/nextjs/react";

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  useCaptureError(error);
  return (
    <html>
      <body>
        <button onClick={() => reset()}>Try again</button>
      </body>
    </html>
  );
}
```

## Manual reporting

```ts
import { Errorgap } from "@errorgap/nextjs";        // server
// import { Errorgap } from "@errorgap/nextjs/client"; // client

await Errorgap.notify(error, { context: { component: "Checkout" } });
```

## Notes

- Server capture targets the **Node.js runtime**; it no-ops on the Edge runtime.
- `apiKey` is an ingestion-only key and may be exposed via `NEXT_PUBLIC_`.

## License

MIT.
