import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Study Graph",
    short_name: "Study Graph",
    description: "Notionを知識の母艦にした個人学習アプリ",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f2ed",
    theme_color: "#243c2c",
    lang: "ja",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any maskable",
      },
    ],
  };
}
