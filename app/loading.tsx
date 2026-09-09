import AppHeader from "@/src/components/AppHeader";
import PrimaryNav from "@/src/components/PrimaryNav";

/** Keep navigation responsive while a learner-facing page resolves its server data. */
export default function Loading() {
  return (
    <main className="phase5-shell" aria-busy="true" aria-live="polite">
      <AppHeader />
      <section className="phase5-loading" aria-label="読み込み中">
        <span className="phase5-loading-line phase5-loading-kicker" />
        <span className="phase5-loading-line phase5-loading-title" />
        <span className="phase5-loading-line phase5-loading-focus" />
        <span className="phase5-loading-line phase5-loading-row" />
        <span className="phase5-loading-line phase5-loading-row" />
      </section>
      <PrimaryNav />
    </main>
  );
}
