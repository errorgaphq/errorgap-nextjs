import { useEffect } from "react";
import { Errorgap } from "@errorgap/browser";

export { ErrorgapBoundary } from "@errorgap/browser/react";
export type { ErrorgapBoundaryProps } from "@errorgap/browser/react";

export interface CapturedError extends Error {
  digest?: string;
}

/**
 * Report an error received by a Next.js App Router `error.tsx` / `global-error.tsx`
 * boundary — these catch React render errors, which never reach `window.onerror`.
 * Call it at the top of the (client) boundary component:
 *
 * ```tsx
 * "use client";
 * import { useCaptureError } from "@errorgap/nextjs/react";
 *
 * export default function GlobalError({ error, reset }) {
 *   useCaptureError(error);
 *   return (
 *     <html><body><button onClick={() => reset()}>Try again</button></body></html>
 *   );
 * }
 * ```
 */
export function useCaptureError(
  error: CapturedError,
  context: Record<string, unknown> = {},
): void {
  useEffect(() => {
    void Errorgap.notify(error, {
      context: {
        source: "nextjs.error-boundary",
        ...(error?.digest ? { digest: error.digest } : {}),
        ...context,
      },
    });
    // Re-report only when the error instance changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);
}
