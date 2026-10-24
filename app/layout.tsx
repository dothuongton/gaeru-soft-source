import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaRegistration } from "@/components/pwa-registration";

export const metadata: Metadata = {
  title: "Mộc — Gọi món tại bàn",
  description: "Một bữa ngon, một ngày vui. Khám phá thực đơn, gọi món và theo dõi đơn ngay tại bàn.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "GAERU Soft",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#244f3c",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" style={{ backgroundColor: "#f7f8f4" }}>
      <head>
        {/* Emit explicitly: the current renderer omits appleWebApp.capable. */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="theme-color" content="#244f3c" />
        <style dangerouslySetInnerHTML={{ __html: "html,body{background-color:#f7f8f4!important;color:#27382e;}" }} />
      </head>
      <body className="antialiased" style={{ backgroundColor: "#f7f8f4" }}>
        {children}
        <PwaRegistration />
      </body>
    </html>
  );
}
