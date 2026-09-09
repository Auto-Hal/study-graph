import Link from "next/link";
import { notFound } from "next/navigation";
import AppHeader from "@/src/components/AppHeader";
import PrimaryNav from "@/src/components/PrimaryNav";
import { getKuzushijiDashboard } from "@/src/lib/notion/kuzushiji";
import { getKuzushijiReferenceData } from "@/src/lib/notion/kuzushiji-reference";

export const dynamic = "force-dynamic";

type Section = "lectures" | "characters" | "mistakes" | "sources" | "expressions";

const sectionMeta: Record<Section, { title: string; description: string }> = {
  lectures: {
    title: "講義",
    description: "これまでの講義と、次に読むテーマ",
  },
  characters: {
    title: "文字",
    description: "読みと字形の学習項目",
  },
  mistakes: {
    title: "誤読記録",
    description: "読み違いから、もう一度確認したい項目",
  },
  sources: {
    title: "資料",
    description: "講義で扱った原資料と教材",
  },
  expressions: {
    title: "頻出表現",
    description: "読み・意味・用例を確認する表現",
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
  const sourceIsTrusted = needsReference ? reference?.mode === "notion" : data.mode === "notion";

  const count = sourceIsTrusted && section === "lectures"
    ? data.lectures.length
    : sourceIsTrusted && section === "characters"
      ? data.characters.length
      : sourceIsTrusted && section === "mistakes"
        ? data.mistakes.length
        : sourceIsTrusted && section === "sources"
          ? reference?.sources.length ?? 0
          : sourceIsTrusted
            ? reference?.expressions.length ?? 0
            : 0;

  return (
    <main className="phase5-shell phase5-deep-shell">
      <AppHeader context={`くずし字 · ${meta.title}`} backHref="/projects/kuzushiji" backLabel="くずし字" />

      <div className="phase5-context-nav" aria-label="現在地">
        <Link href="/projects/kuzushiji">くずし字</Link>
        <span aria-hidden="true">›</span>
        <span>{meta.title}</span>
      </div>

      <section className="phase5-page-heading phase5-deep-heading">
        <div>
          <p className="phase5-eyebrow">くずし字</p>
          <h1 className="phase5-page-title">{meta.title}</h1>
          <p className="phase5-context">{meta.description}</p>
        </div>
        {sourceIsTrusted && <span className="phase5-deep-count">{count}件</span>}
      </section>

      <section className="phase5-deep-list" aria-label={`${meta.title}一覧`}>
        {!sourceIsTrusted ? (
          <div className="phase5-deep-unavailable" role="status">
            <strong>学習データを表示できません。</strong>
            <p>接続を確認できたあと、もう一度この一覧を開いてください。</p>
            <Link href="/settings/advanced/diagnostics">接続を確認する</Link>
          </div>
        ) : <>
        {section === "lectures" && data.lectures.map((lecture) => (
          <Link className="phase5-deep-row" href={`/projects/kuzushiji/lectures/${lecture.id}`} key={lecture.id}>
            <span className="phase5-deep-row-leading">{String(lecture.sequence).padStart(2, "0")}</span>
            <span className="phase5-deep-row-main">
              <strong>{lecture.title || "無題の講義"}</strong>
              <span>{lecture.theme || "学習テーマ未設定"}</span>
            </span>
            <span className="phase5-deep-row-status">{lecture.status || "未設定"}</span>
            <span className="phase5-deep-row-arrow" aria-hidden="true">→</span>
          </Link>
        ))}

        {section === "characters" && data.characters.map((character) => (
          <Link className="phase5-deep-row" href={`/projects/kuzushiji/characters/${character.id}`} key={character.id}>
            <span className="phase5-deep-row-leading">{character.reading || "?"}</span>
            <span className="phase5-deep-row-main">
              <strong>{character.glyph || "文字未設定"}</strong>
              <span>{[character.mother ? `字母 ${character.mother}` : "", character.importance ? `重要度 ${character.importance}` : ""].filter(Boolean).join("・") || "詳細未設定"}</span>
            </span>
            <span className="phase5-deep-row-status">{character.mastery || "未設定"}</span>
            <span className="phase5-deep-row-arrow" aria-hidden="true">→</span>
          </Link>
        ))}

        {section === "mistakes" && data.mistakes.map((mistake) => (
          <Link className="phase5-deep-row" href={`/projects/kuzushiji/mistakes/${mistake.id}`} key={mistake.id}>
            <span className="phase5-deep-row-leading">{mistake.resolved ? "済" : "要"}</span>
            <span className="phase5-deep-row-main">
              <strong>{mistake.title || "誤読記録"}</strong>
              <span>{mistake.cause || "原因未設定"}{mistake.errorDate ? `・${mistake.errorDate}` : ""}</span>
            </span>
            <span className="phase5-deep-row-status">{mistake.resolved ? "克服済み" : mistake.retry ? "再出題" : "記録中"}</span>
            <span className="phase5-deep-row-arrow" aria-hidden="true">→</span>
          </Link>
        ))}

        {section === "sources" && reference?.sources.map((source) => (
          <Link className="phase5-deep-row" href={`/projects/kuzushiji/sources/${source.id}`} key={source.id}>
            <span className="phase5-deep-row-leading">資料</span>
            <span className="phase5-deep-row-main">
              <strong>{source.title || "資料名未設定"}</strong>
              <span>{[source.usage, source.materialType, source.institution].filter(Boolean).join("・") || "詳細未設定"}</span>
            </span>
            <span className="phase5-deep-row-status">{source.difficulty || "未設定"}</span>
            <span className="phase5-deep-row-arrow" aria-hidden="true">→</span>
          </Link>
        ))}

        {section === "expressions" && reference?.expressions.map((expression) => (
          <Link className="phase5-deep-row" href={`/projects/kuzushiji/expressions/${expression.id}`} key={expression.id}>
            <span className="phase5-deep-row-leading">{expression.reading || "?"}</span>
            <span className="phase5-deep-row-main">
              <strong>{expression.expression || "表現未設定"}</strong>
              <span>{[expression.category, expression.meaning].filter(Boolean).join("・") || "詳細未設定"}</span>
            </span>
            <span className="phase5-deep-row-status">{expression.mastery || expression.importance || "未設定"}</span>
            <span className="phase5-deep-row-arrow" aria-hidden="true">→</span>
          </Link>
        ))}

        {count === 0 && (
          <div className="phase5-deep-empty">
            <strong>表示できる項目がありません。</strong>
            <p>学習データが更新されたあと、もう一度確認できます。</p>
          </div>
        )}
        </>}
      </section>

      <PrimaryNav active="learn" />
    </main>
  );
}
