/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // Enable ESLint during production builds to ensure code quality
    ignoreDuringBuilds: false,
  },
  typescript: {
    // Enable TypeScript checks during builds to prevent type regressions
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
