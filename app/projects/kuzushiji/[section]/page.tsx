import Link from "next/link";
import { notFound } from "next/navigation";
import PrimaryNav from "@/src/components/PrimaryNav";
import { getKuzushijiDashboard } from "@/src/lib/notion/kuzushiji";
import { getKuzushijiReferenceData } from "@/src/lib/notion/kuzushiji-reference";

export const dynamic = "force-dynamic";

type Section = "lectures" | "characters" | "mistakes" | "sources" | "expressions";

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
  sources: {
    eyebrow: "SOURCES",
    title: "資料",
    description: "講義で扱った原資料・教材と、種別・難易度・所蔵情報を確認します。",
  },
  expressions: {
    eyebrow: "EXPRESSIONS",
    title: "頻出表現",
    description: "候文などの表現を、読み・意味・用例・習得状態とともに確認します。",
  },
};

function isSection(value: string): value is Section {
  return ["lectures", "characters", "mistakes", "sources", "expressions"].includes(value);
}

export default async function KuzushijiSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!isSection(section)) notFound();

  const needsReference = section === "sources" || section === "expressions";
  const [data, reference] = await Promise.all([
    getKuzushijiDashboard(),
    needsReference ? getKuzushijiReferenceData() : Promise.resolve(null),
  ]);
  const meta = sectionMeta[section];
  const mode = reference?.mode ?? data.mode;

  const count = section === "lectures"
    ? data.lectures.length
    : section === "characters"
      ? data.characters.length
      : section === "mistakes"
        ? data.mistakes.length
        : section === "sources"
          ? reference?.sources.length ?? 0
          : reference?.expressions.length ?? 0;

  return (
    <main className="learn-shell">
      <header className="learn-header">
        <Link className="learn-brand" href="/">
          <span className="learn-brand-mark" aria-hidden="true">SG</span>
          <span>
            <strong>Study Graph</strong>
            <small>くずし字・{meta.title}</small>
          </span>
        </Link>
        <div className={`sync-pill ${mode === "notion" ? "online" : "demo"}`}>
          <span className="dot" />
          {mode === "notion" ? "Notion 接続中" : "Demo data"}
        </div>
      </header>

      <nav className="breadcrumbs" aria-label="パンくずリスト">
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

        {section === "sources" && reference?.sources.map((source) => (
          <Link className="entity-row" href={`/projects/kuzushiji/sources/${source.id}`} key={source.id}>
            <span className="entity-row-leading">資料</span>
            <div>
              <strong>{source.title || "資料名未設定"}</strong>
              <p>{[source.usage, source.materialType, source.institution].filter(Boolean).join("・") || "詳細未設定"}</p>
            </div>
            <span className="entity-row-status">{source.difficulty || "未設定"}</span>
          </Link>
        ))}

        {section === "expressions" && reference?.expressions.map((expression) => (
          <Link className="entity-row" href={`/projects/kuzushiji/expressions/${expression.id}`} key={expression.id}>
            <span className="entity-row-leading">{expression.reading || "?"}</span>
            <div>
              <strong>{expression.expression || "表現未設定"}</strong>
              <p>{[expression.category, expression.meaning].filter(Boolean).join("・") || "詳細未設定"}</p>
            </div>
            <span className="entity-row-status">{expression.mastery || expression.importance || "未設定"}</span>
          </Link>
        ))}

        {count === 0 && (
          <div className="empty-state-inline">
            <strong>まだ項目がありません。</strong>
            <p>Notionに追加すると、次回の表示時にここへ反映されます。</p>
          </div>
        )}
      </section>

      <PrimaryNav active="learn" />
    </main>
  );
}
