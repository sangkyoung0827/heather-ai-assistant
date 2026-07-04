import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Heather AI Assistant / 헤더",
    short_name: "Heather",
    description: "Web-based Jarvis-like personal AI assistant MVP.",
    start_url: "/",
    display: "standalone",
    background_color: "#020617",
    theme_color: "#020617",
    orientation: "any"
  };
}
