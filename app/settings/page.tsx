import Link from "next/link";
import AppHeader from "@/src/components/AppHeader";
import PrimaryNav from "@/src/components/PrimaryNav";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <main className="phase5-shell">
      <AppHeader context="設定" />
      <section className="phase5-page-heading"><div><p className="phase5-eyebrow">設定</p><h1 className="phase5-page-title">設定</h1><p className="phase5-context">Study Graphを自分の学習に合わせる</p></div></section>
      <section className="phase5-settings-list" aria-label="設定">
        <Link className="phase5-settings-row" href="/settings"><strong>表示</strong><span>日本語 · Asia/Tokyo</span></Link>
        <Link className="phase5-settings-row" href="/projects"><strong>学習データの更新</strong><span>プロジェクトから確認</span></Link>
        <Link className="phase5-settings-row" href="/review/offline"><strong>オフラインと端末保存</strong><span>準備と保存状態</span></Link>
        <Link className="phase5-settings-row" href="/settings/advanced"><strong>詳細設定</strong><span>接続・診断・運用情報</span></Link>
      </section>
      <p className="phase5-settings-note">学習履歴と復習の判定はサーバーで管理されます。端末に保存された問題や回答は、通信が戻ったときに同期されます。</p>
      <form className="phase5-settings-actions" action="/api/auth/logout" method="post"><button className="phase5-secondary-action" type="submit">ログアウト</button></form>
      <PrimaryNav />
    </main>
  );
}
