import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/client.ts", "src/react.tsx"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "es2020",
  splitting: false,
  treeshake: true,
  external: ["react", "next", "@errorgap/browser", "@errorgap/node"],
});
