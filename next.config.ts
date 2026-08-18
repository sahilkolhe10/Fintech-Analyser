import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  serverExternalPackages: [
    "firebase-admin",
    "@google-cloud/firestore",
    "@google-cloud/storage",
    "google-auth-library",
    "google-gax",
    "@grpc/grpc-js",
    "@grpc/proto-loader",
    "gcp-metadata",
    "pdf-parse",
    "pdfjs-dist",
    "xlsx",
  ],
};

export default nextConfig;