import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Deployed to the VM as a self-contained bundle (see design.md "Build location").
  output: "standalone",
  // SEC-19 / SEC-12: never disclose the framework in response headers.
  poweredByHeader: false,
};

export default nextConfig;
