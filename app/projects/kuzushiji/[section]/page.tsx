import Link from "next/link";
import { notFound } from "next/navigation";
import { getKuzushijiDashboard } from "@/src/lib/notion/kuzushiji";

export const dynamic = "force-dynamic";

type Section = "lectures" | "characters" | "mistakes";

const sectionMeta: Record<Section, { eyebrow: string; title: string; description: string }> = {
  lectures: {
    eyebrow: "LECTURES",
    title: "講義",
    description: "講義の回次、テーマ、状態をStudy Graph内で確認します。",
  },
  characters: {
    eyebrow: "CHARACTERS",
    title: "文字",
    description: "読み・字母・習得状態・重要度を一覧し、個別の定着状況へ進みます。",
  },
  mistakes: {
    eyebrow: "MISTAKES",
    title: "誤読記録",
    description: "誤った判断と原因を残し、再出題・克服状況を振り返ります。",
  },
};

function isSection(value: string): value is Section {
  return value === "lectures" || value === "characters" || value === "mistakes";
}

export default async function KuzushijiSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!isSection(section)) notFound();

  const data = await getKuzushijiDashboard();
  const meta = sectionMeta[section];

  const count = section === "lectures"
    ? data.lectures.length
    : section === "characters"
      ? data.characters.length
      : data.mistakes.length;

  return (
    <main className="learn-shell">
      <header className="learn-header">
        <Link className="learn-brand" href="/">
          <span className="learn-brand-mark">SG</span>
          <span>
            <strong>Study Graph</strong>
            <small>くずし字・{meta.title}</small>
          </span>
        </Link>
        <div className={`sync-pill ${data.mode === "notion" ? "online" : "demo"}`}>
          <span className="dot" />
          {data.mode === "notion" ? "Notion 接続中" : "Demo data"}
        </div>
      </header>

      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link href="/projects">Projects</Link>
        <span><Link href="/projects/kuzushiji">くずし字</Link></span>
        <span>{meta.title}</span>
      </nav>

      <section className="section-heading">
        <div>
          <p className="eyebrow">{meta.eyebrow}</p>
          <h1>{meta.title}</h1>
          <p>{meta.description}</p>
        </div>
        <span className="section-count">{count} items</span>
      </section>

      <section className="entity-list" aria-label={`${meta.title}一覧`}>
        {section === "lectures" && data.lectures.map((lecture) => (
          <Link className="entity-row" href={`/projects/kuzushiji/lectures/${lecture.id}`} key={lecture.id}>
            <span className="entity-row-leading">{String(lecture.sequence).padStart(2, "0")}</span>
            <div>
              <strong>{lecture.title || "無題の講義"}</strong>
              <p>{lecture.theme || "学習テーマ未設定"}</p>
            </div>
            <span className="entity-row-status">{lecture.status || "未設定"}</span>
          </Link>
        ))}

        {section === "characters" && data.characters.map((character) => (
          <Link className="entity-row" href={`/projects/kuzushiji/characters/${character.id}`} key={character.id}>
            <span className="entity-row-leading">{character.reading || "?"}</span>
            <div>
              <strong>{character.glyph || "文字未設定"}</strong>
              <p>{[character.mother ? `字母 ${character.mother}` : "", character.importance ? `重要度 ${character.importance}` : ""].filter(Boolean).join("・") || "詳細未設定"}</p>
            </div>
            <span className="entity-row-status">{character.mastery || "未設定"}</span>
          </Link>
        ))}

        {section === "mistakes" && data.mistakes.map((mistake) => (
          <Link className="entity-row" href={`/projects/kuzushiji/mistakes/${mistake.id}`} key={mistake.id}>
            <span className="entity-row-leading">{mistake.resolved ? "済" : "要"}</span>
            <div>
              <strong>{mistake.title || "誤読記録"}</strong>
              <p>{mistake.cause || "原因未設定"}{mistake.errorDate ? `・${mistake.errorDate}` : ""}</p>
            </div>
            <span className="entity-row-status">{mistake.resolved ? "克服済み" : mistake.retry ? "再出題" : "記録中"}</span>
          </Link>
        ))}

        {count === 0 && <p className="empty" style={{ padding: 20 }}>まだ項目がありません。</p>}
      </section>

      <footer className="learn-bottom-nav" aria-label="Primary navigation">
        <Link href="/">Home</Link>
        <Link className="active" href="/projects">Learn</Link>
        <Link href="/review">Review</Link>
        <span>Graph</span>
        <span>Settings</span>
      </footer>
    </main>
  );
}
