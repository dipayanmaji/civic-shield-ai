import type { Metadata, Viewport } from "next";

import { EmergencyAlertMarquee } from "@/components/emergency/emergency-alert-marquee";
import { GlobalActivityLoader } from "@/components/shared/global-activity-loader";
import { PwaRegister } from "@/components/shared/pwa-register";
import { SiteFooter } from "@/components/shared/site-footer";

import "./globals.css";

export const metadata: Metadata = {
  applicationName: "CivicShield AI",
  title: "CivicShield AI | Civic safety, made actionable",
  description:
    "AI-assisted civic issue reporting and emergency safety guidance for communities.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "CivicShield",
  },
  formatDetection: {
    telephone: true,
  },
  icons: {
    icon: [
      { url: "/icons/favicon-48.png", sizes: "48x48", type: "image/png" },
      { url: "/icons/civicshield-icon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#076b5a",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <PwaRegister />
        <GlobalActivityLoader />
        <EmergencyAlertMarquee />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
