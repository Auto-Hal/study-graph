import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./review-persistence.css";
import "./review-cross-project.css";
import "./project-navigation.css";
import "./progress.css";
import "./polish.css";
import "./graph.css";
import "./graph-depth.css";
import "./graph-western-art.css";
import "./graph-philosophy.css";
import "./graph-learning.css";
import "./phase5.css";
import "./phase5-review-session.css";
import OfflineShellRegistration from "@/src/components/OfflineShellRegistration";

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
  themeColor: "#3659b8",
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body><OfflineShellRegistration />{children}</body>
    </html>
  );
}
