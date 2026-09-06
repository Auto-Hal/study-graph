import ReviewSession from "@/src/components/ReviewSession";
import type { ReviewCard, ReviewSessionContext } from "@/src/lib/review/types";

function demoAsset() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
      <rect width="1200" height="800" fill="#f5f0e6"/>
      <g fill="#26332e" font-family="serif" font-size="180" text-anchor="middle">
        <text x="260" y="300">安</text>
        <text x="600" y="300">以</text>
        <text x="940" y="300">宇</text>
        <text x="600" y="610">あ</text>
      </g>
      <rect x="430" y="420" width="340" height="260" rx="28" fill="none" stroke="#8a5d3b" stroke-width="10" stroke-dasharray="22 16"/>
    </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const cards: ReviewCard[] = [
  {
    id: "phase-3-3-asset-demo",
    exerciseId: "phase-3-3-asset-demo:crop",
    projectId: "kuzushiji",
    kind: "character",
    kindLabel: "Visual Exercise",
    eyebrow: "ASSET FOUNDATION",
    label: "画像領域デモ",
    prompt: "切り抜かれた領域に表示されている文字を入力してください。",
    front: "画像Crop / Regionの表示確認",
    frontStyle: "title",
    reason: "Phase 3.3のUI基盤確認用。実資料・外部画像は使用していません。",
    answer: {
      type: "text",
      acceptedAnswers: ["あ"],
      placeholder: "文字を入力",
    },
    answerRows: [
      { label: "正解", value: "あ" },
      { label: "用途", value: "将来のくずし字字形・古文書部分画像Exercise" },
      { label: "保存", value: "このデモ回答は永続保存しません" },
    ],
    sourceUrl: "#",
    asset: {
      type: "image",
      src: demoAsset(),
      alt: "Phase 3.3 Visual Exercise基盤確認用の合成文字画像",
      width: 1200,
      height: 800,
      presentation: "crop",
      region: { x: 0.35, y: 0.5, width: 0.3, height: 0.4 },
      caption: "基盤確認用の合成画像。実資料ではありません。",
      attribution: "Study Graph generated demo",
      license: "Internal demo",
    },
  },
];

const session: ReviewSessionContext = {
  projectId: "kuzushiji",
  projectTitle: "くずし字",
  projectHref: "/projects/kuzushiji",
  mode: "practice",
};

export default function VisualExerciseDemoPage() {
  return (
    <main className="page-shell review-project-shell">
      <section className="review-project-intro">
        <div>
          <p className="eyebrow">PHASE 3.3</p>
          <h1>Visual Exercise / Asset foundation</h1>
          <p>画像全体だけでなく、正規化座標で指定したCrop / RegionをExerciseとして扱うための動作確認ページです。</p>
        </div>
        <div className="review-session-badge"><strong>1</strong><span>DEMO</span></div>
      </section>
      <ReviewSession cards={cards} persistence="fallback" session={session} />
    </main>
  );
}
