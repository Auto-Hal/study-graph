import ReviewSession from "@/src/components/ReviewSession";
import type { ReviewCard, ReviewSessionContext } from "@/src/lib/review/types";

const cards: ReviewCard[] = [
  {
    id: "kuzushiji-open-data-u3042",
    exerciseId: "kuzushiji-open-data-u3042:visual-reading",
    projectId: "kuzushiji",
    kind: "character",
    kindLabel: "実字形",
    eyebrow: "REAL IMAGE PILOT",
    label: "あ",
    prompt: "画像に並ぶくずし字の読みを入力してください。字形差があっても同じ文字です。",
    front: "実資料由来の字形から読む",
    frontStyle: "title",
    reason: "公開くずし字データセットを使った実画像Exerciseの小規模検証です。",
    asset: {
      type: "image",
      src: "https://codh.rois.ac.jp/char-shape/unicode/U%2B3042/100241706.jpg",
      alt: "日本古典籍くずし字データセットに収録された「あ」の複数字形",
      width: 968,
      height: 506,
      presentation: "full",
      caption: "同じ「あ」でも資料・筆跡によって形が大きく変わります。",
      attribution: "『日本古典籍くずし字データセット』（国文研ほか所蔵／CODH加工） doi:10.20676/00000340",
      sourceUrl: "https://codh.rois.ac.jp/char-shape/unicode/U%2B3042/",
      license: "CC BY-SA 4.0",
    },
    answer: {
      type: "text",
      acceptedAnswers: ["あ"],
      placeholder: "読みを入力",
    },
    answerRows: [
      { label: "正解", value: "あ" },
      { label: "学習ポイント", value: "字形を一つの固定形として覚えず、複数の崩れ方を同一文字として認識する" },
      { label: "保存", value: "パイロット回答は永続保存しません" },
    ],
    sourceUrl: "https://codh.rois.ac.jp/char-shape/unicode/U%2B3042/",
  },
];

const session: ReviewSessionContext = {
  projectId: "kuzushiji",
  projectTitle: "くずし字",
  projectHref: "/projects/kuzushiji",
  mode: "practice",
};

export default function KuzushijiVisualPilotPage() {
  return (
    <main className="page-shell review-project-shell">
      <section className="review-project-intro">
        <div>
          <p className="eyebrow">VISUAL EXERCISE PILOT</p>
          <h1>実際のくずし字画像で読む。</h1>
          <p>外部の公開データを参照する最初の実画像Exerciseです。ストレージ追加やNotion書き込みは行いません。</p>
        </div>
        <div className="review-session-badge"><strong>1</strong><span>PILOT</span></div>
      </section>
      <ReviewSession cards={cards} persistence="fallback" session={session} />
    </main>
  );
}
