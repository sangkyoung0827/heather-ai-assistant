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
    icon: "/icons/heather-icon.svg",
    apple: "/icons/heather-icon.svg"
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
