import { afterEach, describe, expect, it } from "vitest";
import { clientConfig, serverConfig } from "../src/config";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe("serverConfig", () => {
  it("prefers ERRORGAP_* then falls back to NEXT_PUBLIC_*", () => {
    process.env.ERRORGAP_ENDPOINT = "https://ingest.example.com";
    process.env.NEXT_PUBLIC_ERRORGAP_PROJECT_SLUG = "demo";
    process.env.ERRORGAP_API_KEY = "flk_secret";

    const config = serverConfig();
    expect(config.endpoint).toBe("https://ingest.example.com");
    expect(config.projectSlug).toBe("demo");
    expect(config.apiKey).toBe("flk_secret");
  });

  it("lets explicit options win over env", () => {
    process.env.ERRORGAP_ENDPOINT = "https://env.example.com";
    expect(serverConfig({ endpoint: "https://opt.example.com" }).endpoint).toBe("https://opt.example.com");
  });
});

describe("clientConfig", () => {
  it("reads only the public NEXT_PUBLIC_* vars", () => {
    process.env.ERRORGAP_ENDPOINT = "https://server-only.example.com";
    process.env.NEXT_PUBLIC_ERRORGAP_ENDPOINT = "https://public.example.com";
    process.env.NEXT_PUBLIC_ERRORGAP_PROJECT_SLUG = "demo";

    const config = clientConfig();
    expect(config.endpoint).toBe("https://public.example.com");
    expect(config.projectSlug).toBe("demo");
  });
});

describe("clientConfig performance", () => {
  it("is off unless asked for", () => {
    expect(clientConfig().performance).toBe(false);
  });

  it("turns on from NEXT_PUBLIC_ERRORGAP_PERFORMANCE or an explicit option", () => {
    process.env.NEXT_PUBLIC_ERRORGAP_PERFORMANCE = "true";
    expect(clientConfig().performance).toBe(true);
    const routeName = () => "/orders/[id]";
    expect(clientConfig({ performance: { routeName } }).performance).toEqual({ routeName });
  });
});

describe("clientConfig replay", () => {
  it("follows the project's settings by default", () => {
    delete process.env.NEXT_PUBLIC_ERRORGAP_REPLAY;
    expect(clientConfig().replay).toBe(true);
  });

  it("turns off from NEXT_PUBLIC_ERRORGAP_REPLAY=false or an explicit option", () => {
    process.env.NEXT_PUBLIC_ERRORGAP_REPLAY = "false";
    expect(clientConfig().replay).toBe(false);
    delete process.env.NEXT_PUBLIC_ERRORGAP_REPLAY;
    expect(clientConfig({ replay: false }).replay).toBe(false);
    expect(clientConfig({ replay: { flushIntervalMs: 5000 } }).replay).toEqual({ flushIntervalMs: 5000 });
  });
});
