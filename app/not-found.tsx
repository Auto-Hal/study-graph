import Link from "next/link";

export default function NotFound() {
  return (
    <main className="system-page">
      <section className="system-card">
        <p className="eyebrow">404</p>
        <h1>この学習ページは見つかりません。</h1>
        <p>Notion側で項目が削除・移動されたか、古いリンクを開いている可能性があります。Study Graphの一覧から探し直してください。</p>
        <div className="system-actions">
          <Link className="primary-action" href="/projects">Projectsへ戻る</Link>
          <Link href="/">Homeへ戻る</Link>
        </div>
      </section>
    </main>
  );
}
