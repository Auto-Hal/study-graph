import Link from "next/link";
import AppHeader from "@/src/components/AppHeader";
import PrimaryNav from "@/src/components/PrimaryNav";

export const dynamic = "force-dynamic";

export default function AdvancedSettingsPage() {
  return (
    <main className="phase5-shell">
      <AppHeader context="詳細設定" backHref="/settings" backLabel="設定" />
      <section className="phase5-page-heading"><div><p className="phase5-eyebrow">詳細設定</p><h1 className="phase5-page-title">詳細設定</h1><p className="phase5-context">通常の学習には必要ない情報</p></div></section>
      <section className="phase5-settings-list" aria-label="詳細設定">
        <Link className="phase5-settings-row" href="/settings/advanced/diagnostics"><strong>保存・送信の診断</strong><span>確認が必要な回答を見る</span></Link>
        <Link className="phase5-settings-row" href="/graph"><strong>知識のつながり</strong><span>関係を表示</span></Link>
      </section>
      <PrimaryNav />
    </main>
  );
}
