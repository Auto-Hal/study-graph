import Link from "next/link";

type ActiveItem = "home" | "learn" | "review" | "graph" | "settings";

export default function PrimaryNav({
  active,
  variant = "learn",
}: {
  active: ActiveItem;
  variant?: "home" | "learn";
}) {
  const className = variant === "home" ? "bottom-nav" : "learn-bottom-nav";

  return (
    <footer className={className} aria-label="メインナビゲーション">
      <Link className={active === "home" ? "active" : undefined} href="/" aria-current={active === "home" ? "page" : undefined}>
        Home
      </Link>
      <Link className={active === "learn" ? "active" : undefined} href="/projects" aria-current={active === "learn" ? "page" : undefined}>
        Learn
      </Link>
      <Link className={active === "review" ? "active" : undefined} href="/review" aria-current={active === "review" ? "page" : undefined}>
        Review
      </Link>
      <Link className={active === "graph" ? "active" : undefined} href="/graph" aria-current={active === "graph" ? "page" : undefined}>
        Graph
      </Link>
      <Link className={active === "settings" ? "active" : undefined} href="/settings" aria-current={active === "settings" ? "page" : undefined}>
        Settings
      </Link>
    </footer>
  );
}
