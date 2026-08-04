/** @type {import('next').NextConfig} */
const tauriBuild = process.env.NEXT_PUBLIC_TAURI_BUILD === "true";

const nextConfig = {
  reactStrictMode: true,
  ...(tauriBuild
    ? {
        output: "export",
        trailingSlash: true,
        images: { unoptimized: true }
      }
    : {}),
  // This non-secret rollout flag must be available to the client selector and server router.
  env: {
    CHAT_EXECUTION_MODE_SELECTOR_ENABLED: process.env.CHAT_EXECUTION_MODE_SELECTOR_ENABLED ?? "true",
    NEXT_PUBLIC_TAURI_BUILD: tauriBuild ? "true" : "false"
  }
};

export default nextConfig;
