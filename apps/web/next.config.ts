import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

// ESM-safe (this file has no __dirname when loaded as a module); swc rewrites
// import.meta.url correctly under Next's CJS transpile path too.
const configDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    // Monorepo root — silences multi-lockfile inference warning.
    root: path.join(configDir, "..", ".."),
  },
};

export default nextConfig;
