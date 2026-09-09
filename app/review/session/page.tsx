import Link from "next/link";
import AppHeader from "@/src/components/AppHeader";
import ReviewSession from "@/src/components/ReviewSession";
import { loadReviewProject } from "@/src/lib/review/registry";

export const dynamic = "force-dynamic";

export default async function ReviewSessionPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const query = await searchParams;
  const data = await loadReviewProject(query.project);
  const practice = data.session.mode === "practice";

  return (
    <main className="phase5-session-shell">
      <AppHeader context={`${data.project.shortLabel} · ${practice ? "練習" : "今日の復習"}`} backHref="/review" backLabel="復習" />
      <section className="review-project-intro">
        <div><p className="phase5-eyebrow">{practice ? "練習" : "今日の復習"}</p><h1>{practice ? "知識を思い出す" : "今日の復習"}</h1><p>{data.cards.length > 0 ? `${data.cards.length}問を、自分のペースで進めます。` : "現在取り組める問題はありません。"}</p></div><div className="review-session-badge"><strong>{data.cards.length}</strong><span>問題</span></div>
      </section>
      {data.sourceMode === "demo" && <section className="notice" role="status"><strong>学習データを確認できません。</strong><span>通信が戻ってから、もう一度お試しください。</span></section>}
      {data.sourceMode === "notion" && data.persistence === "fallback" && <section className="notice" role="status"><strong>復習履歴を確認できません。</strong><span>このセッションの評価は保存されません。</span></section>}
      {data.cards.length > 0 ? <ReviewSession cards={data.cards} persistence={data.persistence} session={data.session} /> : <section className="review-stage empty-stage"><p className="phase5-eyebrow">{data.session.emptyReason === "scope-unavailable" ? "準備中" : "完了"}</p><h1>今取り組める問題はありません。</h1><p>学ぶ画面から講義を続けるか、あとで復習に戻ってきてください。</p><div className="result-actions single-action-row"><Link className="secondary-action" href="/review">復習へ戻る</Link><Link className="secondary-action" href={data.session.projectHref}>プロジェクトを見る</Link></div></section>}
    </main>
  );
}
