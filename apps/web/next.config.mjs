/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@heather/core", "@heather/ai", "@heather/db", "@heather/platform"],
};

export default nextConfig;
