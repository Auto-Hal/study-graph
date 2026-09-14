import Link from "next/link";

/** Shared learner-facing chrome for the redesigned app surfaces. */
export default function AppHeader({
  context,
  backHref,
  backLabel,
}: {
  context?: string;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <header className="phase5-header">
      <div className="phase5-header-leading">
        {backHref && (
          <Link className="phase5-back" href={backHref} prefetch aria-label={backLabel ?? "戻る"}>
            <span aria-hidden="true">←</span>
            <span className="phase5-back-label">{backLabel ?? "戻る"}</span>
          </Link>
        )}
        <Link className="phase5-brand" href="/" prefetch aria-label="Study Graph 今日へ">
          <span className="phase5-brand-mark" aria-hidden="true">sg</span>
          <span>
            <strong>Study Graph</strong>
            {context && <small>{context}</small>}
          </span>
        </Link>
      </div>
      <Link className="phase5-settings-link" href="/settings" prefetch aria-label="設定">
        <span aria-hidden="true">⚙</span>
      </Link>
    </header>
  );
}
