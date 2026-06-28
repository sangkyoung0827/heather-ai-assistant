import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Heather AI Assistant",
  description: "A modular personal AI assistant PWA for projects, memory, voice, and analysis.",
  applicationName: "Heather AI Assistant",
  appleWebApp: {
    capable: true,
    title: "Heather"
  },
  icons: {
    icon: "/icons/heather-avatar.png",
    apple: "/icons/heather-avatar.png"
  }
};

export const viewport: Viewport = {
  themeColor: "#2f8f80",
  width: "device-width",
  initialScale: 1
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
