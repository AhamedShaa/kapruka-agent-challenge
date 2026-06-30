import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pino's pretty-printing transport spawns a worker thread (thread-stream's
  // lib/worker.js). Webpack rewrites that path when bundling per-route, so the
  // worker can't find its script on the second route that imports the logger —
  // keeping these packages external preserves the real node_modules paths.
  serverExternalPackages: ['pino', 'pino-pretty', 'thread-stream'],
  experimental: {
    // Allow ESM-style ".js" imports of local ".ts"/".tsx" files to resolve in webpack.
    extensionAlias: {
      '.js': ['.ts', '.tsx', '.js'],
    },
  },
};

export default nextConfig;
