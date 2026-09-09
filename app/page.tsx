import Link from "next/link";
import AppHeader from "@/src/components/AppHeader";
import PrimaryNav from "@/src/components/PrimaryNav";
import { getKuzushijiDashboard } from "@/src/lib/notion/kuzushiji";
import { getDueReviewItems } from "@/src/lib/supabase/review";

export const dynamic = "force-dynamic";

export default async function Home() {
  const data = await getKuzushijiDashboard();
  const scheduledReview = await getDueReviewItems(data.reviewQueue);
  const hasTrustedData = data.mode === "notion";
  const reviewQueue = hasTrustedData ? scheduledReview.items : [];
  const completedLectures = hasTrustedData ? data.lectures.filter((lecture) => lecture.status === "完了").length : 0;
  const weakCharacters = hasTrustedData ? data.characters.filter((character) => character.mastery !== "即読").length : 0;
  const openMistakes = hasTrustedData ? data.mistakes.filter((mistake) => !mistake.resolved).length : 0;
  const recentLectures = hasTrustedData ? [...data.lectures].sort((a, b) => b.sequence - a.sequence).slice(0, 3) : [];
  const latestLecture = recentLectures[0] ?? null;

  const focus = reviewQueue.length > 0
    ? {
        title: "今日の復習",
        detail: `${reviewQueue.length}問 · 約${Math.max(2, Math.ceil(reviewQueue.length * 0.7))}分`,
        description: "期限が来た項目を、思い出せるところから始めます。",
        href: "/review/session?project=kuzushiji",
        label: "始める",
      }
    : latestLecture
      ? {
          title: latestLecture.title,
          detail: "学習を続ける",
          description: latestLecture.theme || "くずし字の現在位置から続けます。",
          href: `/projects/kuzushiji/lectures/${latestLecture.id}`,
          label: "学習を続ける",
        }
      : {
          title: "学習を選ぶ",
          detail: "くずし字から始める",
          description: "学習プロジェクトを選び、現在位置を確認します。",
          href: "/projects",
          label: "学ぶ",
        };

  return (
    <main className="phase5-shell">
      <AppHeader />
      <section className="phase5-page-heading">
        <div><p className="phase5-eyebrow">今日のフォーカス</p><h1 className="phase5-page-title">今日</h1></div>
      </section>

      <section className="phase5-focus" aria-labelledby="today-focus-title">
        <p className="phase5-eyebrow">次の一歩</p>
        <h2 id="today-focus-title">{focus.title}</h2>
        <p>{focus.description}</p>
        <div className="phase5-focus-meta"><span>{focus.detail}</span>{data.mode !== "notion" && <span>学習データを確認中</span>}</div>
        <Link className="phase5-action" href={focus.href}>{focus.label} <span aria-hidden="true">→</span></Link>
      </section>

      {reviewQueue.length > 0 && (
        <section className="phase5-section" aria-labelledby="today-review-title">
          <div className="phase5-section-heading"><h2 id="today-review-title">今日の復習</h2><Link href="/review">すべて見る</Link></div>
          <div className="phase5-row-list">
            {reviewQueue.slice(0, 4).map((item) => (
              <Link className="phase5-row" href="/review" key={`${item.kind}-${item.id}`}>
                <span className="phase5-row-main"><span className="phase5-row-title">{item.label}</span><span className="phase5-row-meta">{item.reason}</span></span>
                <span className="phase5-row-arrow" aria-hidden="true">→</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="phase5-section" aria-labelledby="continue-learning-title">
        <div className="phase5-section-heading"><h2 id="continue-learning-title">学習を続ける</h2><Link href="/projects">すべての学び</Link></div>
        <div className="phase5-row-list">
          <Link className="phase5-row" href="/projects/kuzushiji">
            <span className="phase5-row-main"><span className="phase5-row-title">くずし字</span><span className="phase5-row-meta">{completedLectures > 0 ? `第${completedLectures}回まで完了` : "最初の講義から始める"}</span></span>
            <span className="phase5-row-arrow" aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      <section className="phase5-section" aria-labelledby="recent-title">
        <div className="phase5-section-heading"><h2 id="recent-title">最近</h2><Link href="/projects/kuzushiji/progress">学習記録</Link></div>
        <div className="phase5-row-list">
          {recentLectures.length > 0 ? recentLectures.map((lecture) => (
            <Link className="phase5-row" href={`/projects/kuzushiji/lectures/${lecture.id}`} key={lecture.id}>
              <span className="phase5-row-main"><span className="phase5-row-title">{lecture.title}</span><span className="phase5-row-meta">{lecture.status || "学習項目"}</span></span>
              <span className="phase5-row-status">{lecture.sequence}</span>
            </Link>
          )) : <p className="phase5-empty">まだ学習履歴がありません。</p>}
        </div>
      </section>

      <p className="phase5-context phase5-summary-line">完了講義 {completedLectures} · 要定着文字 {weakCharacters} · 未克服の誤読 {openMistakes}</p>
      <PrimaryNav active="today" />
    </main>
  );
}
