/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // This non-secret rollout flag must be available to the client selector and server router.
  env: {
    CHAT_EXECUTION_MODE_SELECTOR_ENABLED: process.env.CHAT_EXECUTION_MODE_SELECTOR_ENABLED ?? "true"
  }
};

export default nextConfig;
