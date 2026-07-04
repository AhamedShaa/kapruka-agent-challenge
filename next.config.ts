import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pino's pretty-printing transport spawns a worker thread (thread-stream's
  // lib/worker.js). Webpack rewrites that path when bundling per-route, so the
  // worker can't find its script on the second route that imports the logger —
  // keeping these packages external preserves the real node_modules paths.
  // better-sqlite3 is a native addon; @langchain/langgraph-checkpoint-sqlite
  // wraps it. Both must be external so webpack doesn't try to bundle the .node file.
  serverExternalPackages: ['pino', 'pino-pretty', 'thread-stream', 'better-sqlite3', '@langchain/langgraph-checkpoint-sqlite'],
  experimental: {
    // Allow ESM-style ".js" imports of local ".ts"/".tsx" files to resolve in webpack.
    extensionAlias: {
      '.js': ['.ts', '.tsx', '.js'],
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'www.kapruka.com',
        pathname: '/static/image/**',
      },
    ],
  },
};

export default nextConfig;
