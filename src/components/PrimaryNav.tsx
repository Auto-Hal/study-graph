"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type ActiveItem = "today" | "learn" | "review" | "home" | "graph" | "settings" | null;

export default function PrimaryNav({
  active,
}: {
  active?: ActiveItem;
}) {
  const pathname = usePathname();
  const current: "today" | "learn" | "review" | null = pathname === "/"
    ? "today"
    : pathname.startsWith("/review")
      ? "review"
      : pathname.startsWith("/projects") || pathname.startsWith("/graph")
        ? "learn"
        : pathname.startsWith("/settings")
          ? null
          : (active === "home" ? "today" : active === "graph" ? "learn" : active === "settings" ? null : active ?? "today");

  return (
    <footer className="phase5-bottom-nav" aria-label="メインナビゲーション">
      <Link className={current === "today" ? "active" : undefined} href="/" aria-current={current === "today" ? "page" : undefined}>
        <span aria-hidden="true">⌂</span>今日
      </Link>
      <Link className={current === "learn" ? "active" : undefined} href="/projects" aria-current={current === "learn" ? "page" : undefined}>
        <span aria-hidden="true">◌</span>学ぶ
      </Link>
      <Link className={current === "review" ? "active" : undefined} href="/review" aria-current={current === "review" ? "page" : undefined}>
        <span aria-hidden="true">↺</span>復習
      </Link>
    </footer>
  );
}
