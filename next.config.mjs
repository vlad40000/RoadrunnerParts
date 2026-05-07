/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ["127.0.0.1"],
  typescript: {
    // Enable TypeScript checks during builds to prevent type regressions
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
