import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The shared package ships TypeScript source, so Next.js compiles it with
  // the app instead of expecting a build step.
  transpilePackages: ["@askwell/shared"],
};

export default nextConfig;
