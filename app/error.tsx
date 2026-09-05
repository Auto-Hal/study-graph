"use client";

import Link from "next/link";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="system-page">
      <section className="system-card" role="alert">
        <p className="eyebrow">TEMPORARY ERROR</p>
        <h1>学習データを表示できませんでした。</h1>
        <p>通信や外部サービスの一時的な問題の可能性があります。再試行しても戻らない場合はSettingsで接続状態を確認してください。</p>
        <div className="system-actions">
          <button className="primary-action" type="button" onClick={reset}>もう一度試す</button>
          <Link href="/settings">Settingsを開く</Link>
          <Link href="/">Homeへ戻る</Link>
        </div>
      </section>
    </main>
  );
}
