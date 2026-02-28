import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  transpilePackages: ['@proc-geo/core', '@proc-geo/dashboard', '@proc-geo/test-fixtures'],
  turbopack:{
      root: path.join(__dirname, '../..')
  }
};

export default nextConfig;
