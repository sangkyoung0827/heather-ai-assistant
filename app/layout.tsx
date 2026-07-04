import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Heather AI Assistant / 헤더",
  description:
    "Web-based Jarvis-like personal AI assistant MVP for dashboard, chat, action logs, projects, memory, and settings.",
  applicationName: "Heather AI Assistant"
};

export const viewport: Viewport = {
  themeColor: "#020617",
  width: "device-width",
  initialScale: 1
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
