import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Heather AI Assistant",
    short_name: "Heather",
    description: "Personal AI assistant for projects, memory, voice, and structured analysis.",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f7fa",
    theme_color: "#2f8f80",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/icons/heather-avatar.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable"
      }
    ]
  };
}
