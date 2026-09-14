import AppHeader from "./AppHeader";
import PrimaryNav from "./PrimaryNav";

/** Lightweight destination context shown while a main tab resolves. */
export default function Phase5DestinationLoading({
  eyebrow,
  title,
  context,
  active,
}: {
  eyebrow: string;
  title: string;
  context: string;
  active: "learn" | "review";
}) {
  return (
    <main className="phase5-shell" aria-busy="true" aria-live="polite">
      <AppHeader />
      <section className="phase5-page-heading">
        <div>
          <p className="phase5-eyebrow">{eyebrow}</p>
          <h1 className="phase5-page-title">{title}</h1>
          <p className="phase5-context">{context}</p>
        </div>
      </section>
      <section className="phase5-loading" aria-label="読み込み中">
        <span className="phase5-loading-line phase5-loading-focus" />
        <span className="phase5-loading-line phase5-loading-row" />
        <span className="phase5-loading-line phase5-loading-row" />
      </section>
      <PrimaryNav active={active} />
    </main>
  );
}
