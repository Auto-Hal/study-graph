import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./review-persistence.css";
import "./project-navigation.css";
import "./progress.css";
import "./polish.css";
import "./graph.css";
import "./graph-depth.css";
import "./graph-western-art.css";

export const metadata: Metadata = {
  title: {
    default: "Study Graph",
    template: "%s | Study Graph",
  },
  description: "Notionを知識の母艦にした個人学習アプリ",
  applicationName: "Study Graph",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Study Graph",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#243c2c",
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
