import Link from "next/link";
import AppHeader from "@/src/components/AppHeader";
import PilotBlockedAttemptDiagnostics from "@/src/components/PilotBlockedAttemptDiagnostics";
import PrimaryNav from "@/src/components/PrimaryNav";

export const dynamic = "force-dynamic";

export default function DiagnosticsPage() {
  return (
    <main className="phase5-shell">
      <AppHeader context="保存・送信の診断" backHref="/settings/advanced" backLabel="詳細設定" />
      <section className="phase5-page-heading"><div><p className="phase5-eyebrow">診断</p><h1 className="phase5-page-title">保存・送信の診断</h1><p className="phase5-context">端末に保存された回答の状態を確認します。</p></div></section>
      <section className="phase5-review-focus"><PilotBlockedAttemptDiagnostics /></section>
      <Link className="phase5-secondary-action phase5-back-action" href="/settings/advanced">詳細設定へ戻る</Link>
      <PrimaryNav />
    </main>
  );
}
