import Link from "next/link";
import { notFound } from "next/navigation";
import AppHeader from "@/src/components/AppHeader";
import PrimaryNav from "@/src/components/PrimaryNav";
import { getKuzushijiDashboard } from "@/src/lib/notion/kuzushiji";
import { getKuzushijiReferenceData } from "@/src/lib/notion/kuzushiji-reference";
import {
  getReviewHistory,
  getReviewStates,
  isReviewPersistenceConfigured,
  type ReviewAttempt,
  type ReviewGrade,
  type ReviewState,
} from "@/src/lib/supabase/review";

export const dynamic = "force-dynamic";

type Section = "lectures" | "characters" | "mistakes" | "sources" | "expressions";

const sectionLabels: Record<Section, string> = {
  lectures: "講義",
  characters: "文字",
  mistakes: "誤読記録",
  sources: "資料",
  expressions: "頻出表現",
};

const gradeLabels: Record<ReviewGrade, string> = {
  again: "もう一度",
  hard: "難しい",
  good: "できた",
  easy: "即答",
};

function isSection(value: string): value is Section {
  return ["lectures", "characters", "mistakes", "sources", "expressions"].includes(value);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "未設定";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const hasTime = value.includes("T") || /\d{2}:\d{2}/.test(value);
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: hasTime ? "2-digit" : undefined,
    minute: hasTime ? "2-digit" : undefined,
  }).format(date);
}

function formatPercent(value: number | null) {
  if (value === null) return "未設定";
  const normalized = value <= 1 ? value * 100 : value;
  return `${Math.round(normalized * 10) / 10}%`;
}

async function reviewDataForItem(id: string): Promise<{ state: ReviewState | null; attempts: ReviewAttempt[] }> {
  if (!isReviewPersistenceConfigured()) return { state: null, attempts: [] };
  try {
    const [states, history] = await Promise.all([getReviewStates(), getReviewHistory(100)]);
    return {
      state: states.find((state) => state.item_id === id) ?? null,
      attempts: history.filter((attempt) => attempt.item_id === id),
    };
  } catch {
    return { state: null, attempts: [] };
  }
}

function Property({ label, value, wide = false }: { label: string; value: string | number; wide?: boolean }) {
  return (
    <div className={`phase5-info-row ${wide ? "wide" : ""}`}>
      <span>{label}</span>
      <strong>{value === "" ? "未設定" : value}</strong>
    </div>
  );
}

export default async function KuzushijiEntityDetailPage({
  params,
}: {
  params: Promise<{ section: string; id: string }>;
}) {
  const { section, id } = await params;
  if (!isSection(section)) notFound();

  const [data, reference, review] = await Promise.all([
    getKuzushijiDashboard(),
    getKuzushijiReferenceData(),
    reviewDataForItem(id),
  ]);
  const sourceIsTrusted = section === "sources" || section === "expressions"
    ? reference.mode === "notion"
    : data.mode === "notion";

  if (!sourceIsTrusted) {
    return (
      <main className="phase5-shell phase5-deep-shell">
        <AppHeader context={`くずし字 · ${sectionLabels[section]}`} backHref={`/projects/kuzushiji/${section}`} backLabel={sectionLabels[section]} />
        <div className="phase5-context-nav" aria-label="現在地">
          <Link href="/projects/kuzushiji">くずし字</Link>
          <span aria-hidden="true">›</span>
          <Link href={`/projects/kuzushiji/${section}`}>{sectionLabels[section]}</Link>
        </div>
        <section className="phase5-deep-unavailable" role="status">
          <p className="phase5-eyebrow">{sectionLabels[section]}</p>
          <h1 className="phase5-page-title">学習データを表示できません</h1>
          <p>接続を確認できたあと、もう一度この項目を開いてください。</p>
          <Link href={`/projects/kuzushiji/${section}`}>一覧へ戻る</Link>
        </section>
        <PrimaryNav active="learn" />
      </main>
    );
  }
  const reviewState = review.state;

  const lecture = section === "lectures" ? data.lectures.find((item) => item.id === id) : null;
  const character = section === "characters" ? data.characters.find((item) => item.id === id) : null;
  const mistake = section === "mistakes" ? data.mistakes.find((item) => item.id === id) : null;
  const source = section === "sources" ? reference.sources.find((item) => item.id === id) : null;
  const expression = section === "expressions" ? reference.expressions.find((item) => item.id === id) : null;
  const item = lecture ?? character ?? mistake ?? source ?? expression;
  if (!item) notFound();

  const title = lecture?.title || character?.glyph || mistake?.title || source?.title || expression?.expression || sectionLabels[section];
  const status = lecture?.status || character?.mastery || (mistake ? (mistake.resolved ? "克服済み" : "未克服") : "") || source?.difficulty || expression?.mastery || "";
  const itemUrl = "url" in item ? item.url : "#";

  return (
    <main className="phase5-shell phase5-deep-shell">
      <AppHeader context={`くずし字 · ${sectionLabels[section]}`} backHref={`/projects/kuzushiji/${section}`} backLabel={sectionLabels[section]} />

      <div className="phase5-context-nav" aria-label="現在地">
        <Link href="/projects/kuzushiji">くずし字</Link>
        <span aria-hidden="true">›</span>
        <Link href={`/projects/kuzushiji/${section}`}>{sectionLabels[section]}</Link>
      </div>

      <header className="phase5-detail-heading">
        <div>
          <p className="phase5-eyebrow">{sectionLabels[section]}</p>
          <h1 className="phase5-page-title">{title}</h1>
        </div>
        {status && <span className="phase5-detail-status">{status}</span>}
      </header>

      <section className="phase5-detail-section" aria-labelledby="detail-facts-title">
        <h2 id="detail-facts-title">内容</h2>
        <div className="phase5-info-list">
          {lecture && <>
            <Property label="回次" value={lecture.sequence} />
            <Property label="状態" value={lecture.status || "未設定"} />
            <Property label="実施日" value={formatDate(lecture.completedAt)} />
            <Property label="新規字数" value={lecture.newCharactersCount ?? "未設定"} />
            <Property label="復習正答率" value={formatPercent(lecture.reviewAccuracy)} />
            <Property label="学習テーマ" value={lecture.theme || "未設定"} wide />
          </>}

          {character && <>
            <Property label="登録名" value={character.glyph || "未設定"} />
            <Property label="読み" value={character.reading || "未設定"} />
            <Property label="字母" value={character.mother || "未設定"} />
            <Property label="分類" value={character.category || "未設定"} />
            <Property label="習得状態" value={character.mastery || "未設定"} />
            <Property label="重要度" value={character.importance || "未設定"} />
            <Property label="誤読回数（学習データ）" value={character.errorCount} />
            <Property label="学習データ上の最終復習日" value={formatDate(character.lastReviewedAt)} />
          </>}

          {mistake && <>
            <Property label="原因" value={mistake.cause || "未設定"} />
            <Property label="誤読日" value={formatDate(mistake.errorDate)} />
            <Property label="再出題" value={mistake.retry ? "対象" : "対象外"} />
            <Property label="克服状態" value={mistake.resolved ? "克服済み" : "未克服"} />
            <Property label="自分の回答" value={mistake.answer || "未設定"} wide />
            <Property label="正解" value={mistake.correctAnswer || "未設定"} wide />
          </>}

          {source && <>
            <Property label="用途" value={source.usage || "未設定"} />
            <Property label="資料種別" value={source.materialType || "未設定"} />
            <Property label="難易度" value={source.difficulty || "未設定"} />
            <Property label="時代" value={source.period || "未設定"} />
            <Property label="年代" value={source.era || "未設定"} />
            <Property label="所蔵機関" value={source.institution || "未設定"} />
            <Property label="読解率" value={formatPercent(source.readingAccuracy)} />
            <Property label="苦手ポイント" value={source.weakPoint || "未設定"} wide />
          </>}

          {expression && <>
            <Property label="読み" value={expression.reading || "未設定"} />
            <Property label="分類" value={expression.category || "未設定"} />
            <Property label="習得状態" value={expression.mastery || "未設定"} />
            <Property label="重要度" value={expression.importance || "未設定"} />
            <Property label="意味" value={expression.meaning || "未設定"} wide />
            <Property label="用例" value={expression.example || "未設定"} wide />
            <Property label="注意点" value={expression.notes || "未設定"} wide />
          </>}
        </div>
      </section>

      {reviewState && (
        <section className="phase5-detail-section" aria-labelledby="detail-learning-title">
          <h2 id="detail-learning-title">学習状況</h2>
          <div className="phase5-info-list">
            <Property label="Study Graph 最終評価" value={gradeLabels[reviewState.last_grade]} />
            <Property label="反復回数" value={reviewState.repetitions} />
            <Property label="最終復習" value={formatDate(reviewState.last_reviewed_at)} />
            <Property label="次回復習" value={formatDate(reviewState.due_at)} />
          </div>
        </section>
      )}

      {source?.referenceUrl && (
        <section className="phase5-detail-reference">
          <span>参照資料</span>
          <a href={source.referenceUrl} target="_blank" rel="noreferrer">外部資料を開く <span aria-hidden="true">↗</span></a>
        </section>
      )}

      {review.attempts.length > 0 && (
        <section className="phase5-detail-section phase5-detail-history" aria-labelledby="detail-history-title">
          <h2 id="detail-history-title">復習履歴</h2>
          <div className="phase5-detail-history-list">
            {review.attempts.slice(0, 12).map((attempt) => (
              <div className="phase5-detail-history-row" key={attempt.id}>
                <span>{formatDate(attempt.reviewed_at)}</span>
                <div>
                  <strong>{gradeLabels[attempt.grade]}</strong>
                  <p>間隔 {attempt.interval_days === 0 ? "10分" : `${attempt.interval_days}日`}・次回 {formatDate(attempt.due_at)}</p>
                </div>
                <em>{attempt.previous_interval_days === 0 ? "初回" : `前 ${attempt.previous_interval_days}日`}</em>
              </div>
            ))}
          </div>
        </section>
      )}

      <nav className="phase5-detail-actions" aria-label="この項目の操作">
        <Link href={`/projects/kuzushiji/${section}`}>一覧へ戻る</Link>
        <Link href={`/graph?node=${encodeURIComponent(id)}&view=focus`}>知識のつながりを見る</Link>
        {(section === "characters" || section === "mistakes") && <Link href="/projects/kuzushiji/progress">学習記録を見る</Link>}
        {itemUrl !== "#" && <a href={itemUrl} target="_blank" rel="noreferrer">元の資料を開く <span aria-hidden="true">↗</span></a>}
      </nav>

      <PrimaryNav active="learn" />
    </main>
  );
}
