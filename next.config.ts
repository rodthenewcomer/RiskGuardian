import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ['lucide-react', 'framer-motion'],
  },
  // Silence the "webpack config with no turbopack config" warning in Next.js 16.
  // pdfjs-dist is dynamically imported client-side only (text extraction, no canvas rendering).
  turbopack: {},
};

export default nextConfig;
