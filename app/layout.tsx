import type { Metadata } from "next";
import "./globals.css";
import "./review-persistence.css";
import "./project-navigation.css";

export const metadata: Metadata = {
  title: "Study Graph",
  description: "Notionを知識の母艦にした個人学習アプリ",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
