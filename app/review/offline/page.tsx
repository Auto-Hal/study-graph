import Link from "next/link";
import AppHeader from "@/src/components/AppHeader";
import OfflinePrefetchControl from "@/src/components/OfflinePrefetchControl";
import PrimaryNav from "@/src/components/PrimaryNav";

export const dynamic = "force-dynamic";

export default function OfflinePreparationPage() {
  return (
    <main className="phase5-shell">
      <AppHeader context="オフライン復習" backHref="/review" backLabel="復習" />
      <section className="phase5-page-heading">
        <div><p className="phase5-eyebrow">オフライン</p><h1 className="phase5-page-title">オフライン復習</h1><p className="phase5-context">この端末に準備した問題を、通信なしで復習できます。</p></div>
      </section>
      <section className="phase5-review-focus" aria-labelledby="offline-prepare-title">
        <p className="phase5-eyebrow">くずし字</p>
        <h2 id="offline-prepare-title">復習を準備する</h2>
        <p className="phase5-context">サーバーが発行した問題と確認済みの画像だけを端末に保存します。新しい問題はオフラインでは作成されません。</p>
        <div className="phase5-control-wrap"><OfflinePrefetchControl /></div>
      </section>
      <section className="phase5-section">
        <div className="phase5-section-heading"><h2>準備済みなら</h2></div>
        <div className="phase5-row-list">
          <Link className="phase5-row" href="/offline-review"><span className="phase5-row-main"><span className="phase5-row-title">オフライン復習を開始</span><span className="phase5-row-meta">準備済みの問題を開く</span></span><span className="phase5-row-arrow" aria-hidden="true">→</span></Link>
          <Link className="phase5-row" href="/settings/advanced/diagnostics"><span className="phase5-row-main"><span className="phase5-row-title">保存状態を確認</span><span className="phase5-row-meta">端末保存や送信の問題を診断する</span></span><span className="phase5-row-arrow" aria-hidden="true">→</span></Link>
        </div>
      </section>
      <PrimaryNav active="review" />
    </main>
  );
}
