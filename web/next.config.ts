import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Deployed to the VM as a self-contained bundle (see design.md "Build location").
  output: "standalone",
  // SEC-19 / SEC-12: never disclose the framework in response headers.
  poweredByHeader: false,
  // Keep these as real Node externals — they pull in binary / dynamic-require
  // internals that must not be transformed. `firebase-admin` is a webpack
  // default external; `google-auth-library` is listed explicitly.
  serverExternalPackages: ["firebase-admin", "google-auth-library"],
};

export default nextConfig;
