import AppHeader from "@/src/components/AppHeader";

export default function ReviewSessionLoading() {
  return <main className="phase5-session-shell" data-review-loading="true" aria-busy="true">
    <AppHeader context="今日の復習" backHref="/review" backLabel="復習" />
    <section className="review-stage">
      <p className="eyebrow">今日の復習</p><h1>問題を準備しています</h1>
      <p role="status">復習の問題を準備しています…</p>
    </section>
  </main>;
}
