import Link from "next/link";
import ReviewSession, { type ReviewCard } from "@/src/components/ReviewSession";
import { getKuzushijiDashboard } from "@/src/lib/notion/kuzushiji";

export const dynamic = "force-dynamic";

function displayGlyph(value: string) {
  return value.replace(/（.*?）/g, "").trim() || value || "?";
}

export default async function ReviewPage() {
  const data = await getKuzushijiDashboard();
  const cards: ReviewCard[] = [];

  for (const item of data.reviewQueue) {
    if (item.kind === "character") {
      const character = data.characters.find((candidate) => candidate.id === item.id);
      if (!character) continue;

      cards.push({
        id: character.id,
        kind: "character",
        label: character.glyph,
        prompt: "この文字の読みと字母を思い出してください。",
        front: displayGlyph(character.glyph),
        reason: item.reason,
        answerRows: [
          { label: "登録名", value: character.glyph },
          { label: "読み", value: character.reading },
          { label: "字母", value: character.mother },
          { label: "習得状態", value: character.mastery },
        ],
        sourceUrl: character.url,
      });
      continue;
    }

    const mistake = data.mistakes.find((candidate) => candidate.id === item.id);
    if (!mistake) continue;

    cards.push({
      id: mistake.id,
      kind: "mistake",
      label: mistake.title,
      prompt: "この誤読の問題点と、正しい判断を思い出してください。",
      front: mistake.title || "誤読記録",
      reason: item.reason,
      answerRows: [
        { label: "自分の回答", value: mistake.answer },
        { label: "正解", value: mistake.correctAnswer },
        { label: "原因", value: mistake.cause },
      ],
      sourceUrl: mistake.url,
    });
  }

  return (
    <main className="review-page-shell">
      <header className="review-page-header">
        <Link className="brand-link" href="/">
          <span className="brand-mark">SG</span>
          <span>
            <strong>Study Graph</strong>
            <small>くずし字・今日の復習</small>
          </span>
        </Link>
        <div className={`sync-pill ${data.mode === "notion" ? "online" : "demo"}`}>
          <span className="dot" />
          {data.mode === "notion" ? "Notion 接続中" : "Demo data"}
        </div>
      </header>

      <ReviewSession cards={cards} />
    </main>
  );
}
