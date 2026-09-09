import AppHeader from "@/src/components/AppHeader";

/** Focused review keeps its own quiet loading surface and no main tab bar. */
export default function ReviewSessionLoading() {
  return (
    <main className="phase5-session-shell" aria-busy="true" aria-live="polite">
      <AppHeader context="復習" backHref="/review" backLabel="復習" />
      <section className="phase5-loading" aria-label="読み込み中">
        <span className="phase5-loading-line phase5-loading-kicker" />
        <span className="phase5-loading-line phase5-loading-title" />
        <span className="phase5-loading-line phase5-loading-focus" />
      </section>
    </main>
  );
}
