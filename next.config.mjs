/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Keep the BigQuery SDK (and its gRPC/native deps) out of the bundler.
    serverComponentsExternalPackages: ['@google-cloud/bigquery'],
  },
};

export default nextConfig;
