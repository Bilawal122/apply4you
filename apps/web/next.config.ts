import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Monorepo root — silences multi-lockfile inference warning.
    root: path.join(__dirname, "..", ".."),
  },
};

export default nextConfig;
