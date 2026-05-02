/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    // Enable TypeScript checks during builds to prevent type regressions
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
