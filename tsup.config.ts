import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  treeshake: true,
  // React stays a peer: bundling it would give a consumer two Reacts and the
  // hook error that follows is famously hard to trace back here.
  external: ["react"],
});
