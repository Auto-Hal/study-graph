export type UnitProjectId = "kuzushiji" | "western-art-history" | "philosophy";

export type StudyUnit = Readonly<{
  id: string;
  version: 1;
  projectId: UnitProjectId;
  projectTitle: string;
  title: string;
  questionCount: number;
  minutes: string;
  goal: string;
  notes: readonly string[];
  sources: readonly { title: string; url: string }[];
}>;

// Browser-safe descriptions only. Immutable questions and graders stay in the server registry.
export const studyUnits: readonly StudyUnit[] = [
  {
    id: "kuzushiji-kana-1", version: 1, projectId: "kuzushiji", projectTitle: "くずし字",
    title: "あ・い・うを字形から読む", questionCount: 6, minutes: "5〜10分",
    goal: "同じ読みでも形が違う6つの実例を見て、ひらがな1字で答える。",
    notes: [
      "第1回の「あ・い・う」を練習します。各文字に2つの字形を用意しました。",
      "まず字形だけで読みを考え、解答後に別の字形と見比べてください。",
      "画像は『日本永代蔵』の実資料です。この練習では字母の判定や文章全体の読解は扱いません。",
    ],
    sources: [
      { title: "Notion 第1回 くずし字を「読む」とは何か", url: "https://app.notion.com/p/3ccd2793413481819baff81888996b38" },
      { title: "CODH 日本古典籍くずし字データセット", url: "https://codh.rois.ac.jp/char-shape/book/200015843/" },
    ],
  },
  {
    id: "art-prehistory-1", version: 1, projectId: "western-art-history", projectTitle: "西洋美術史",
    title: "先史美術：作品と背景を結ぶ", questionCount: 7, minutes: "5〜10分",
    goal: "洞窟壁画と女性像を、時代・国・素材・表現の特徴と結び付ける。",
    notes: [
      "第1回のラスコー、アルタミラ、ヴィレンドルフのヴィーナスを中心に練習します。",
      "美術検定の基礎知識と情報の関連付けを参考にした独自教材です。特定の級の全範囲や公式過去問ではありません。",
      "短答6問と説明1問。用途や意味が確定していない作品では、仮説と事実を区別します。",
    ],
    sources: [
      { title: "Notion 第1回 人類はなぜ絵を描いたのか", url: "https://app.notion.com/p/3bdd2793413481058e0fc17980f50ec8" },
      { title: "美術検定協会 出題範囲", url: "https://www.bijutsukentei.com/coverage" },
    ],
  },
  {
    id: "philosophy-arche-1", version: 1, projectId: "philosophy", projectTitle: "西洋哲学史",
    title: "アルケー：答えと説明をつなぐ", questionCount: 6, minutes: "10〜15分",
    goal: "3人の根源説を思い出し、共通する問いと説明の違いを自分の言葉で述べる。",
    notes: [
      "第1回のタレス、アナクシマンドロス、アナクシメネスを扱います。",
      "前半3問は用語の短答、後半3問は1〜3文の説明・比較です。",
      "説明の表現は自由です。模範解答、必要な要点、言い換えの例、重大な誤解を読み、自分で評価します。",
    ],
    sources: [{ title: "Notion 第1回 なぜ哲学はギリシアで始まったのか", url: "https://app.notion.com/p/3bdd279341348105904bd47a4f0f6f52" }],
  },
  {
    id: "kuzushiji-kana-2", version: 1, projectId: "kuzushiji", projectTitle: "くずし字",
    title: "あ・い・う：別の字形を見比べる", questionCount: 6, minutes: "5〜10分",
    goal: "新しい6つの実例を読み、解答後に前の単元の同じ読みと比べて形の幅を確かめる。",
    notes: ["第1回の学習済みの3文字を、前の単元とは異なる実資料の字形で練習します。", "解答後に今回の字形と前の単元の例を並べて見比べます。比較画像は解答前には表示しません。", "字形ごとの細かい特徴は自分で観察します。画像だけから字母を判定したり、文章全体を読んだりする練習は含みません。"],
    sources: [{ title: "Notion 第1回 くずし字を読む", url: "https://app.notion.com/p/3ccd2793413481819baff81888996b38" }, { title: "CODH 日本古典籍くずし字データセット", url: "https://codh.rois.ac.jp/char-shape/book/200015843/" }],
  },
  {
    id: "art-megaliths-2", version: 1, projectId: "western-art-history", projectTitle: "西洋美術史",
    title: "巨石文化：形・時代・共同体", questionCount: 8, minutes: "10〜15分",
    goal: "写真と構造から巨石記念物を思い出し、場所・時代・共同体の背景につなげる。",
    notes: ["第2回のストーンヘンジ、メンヒル、ドルメン、クロムレック、トリリトンを扱います。", "画像を見て答える問題と用語・場所・時代の短答7問、背景を説明する1問です。説明は要点を見て自己評価します。", "美術検定の基礎知識と関連付けを参考にした独自教材です。級全体の網羅や公式過去問ではありません。用途の仮説と証拠を区別します。"],
    sources: [{ title: "Notion 第2回 新石器革命と巨石文化", url: "https://app.notion.com/p/3c5d27934134816b8acbd847d0e539e6" }, { title: "English Heritage: History of Stonehenge", url: "https://www.english-heritage.org.uk/visit/places/stonehenge/history-and-stories/history/" }, { title: "写真とライセンス（Wikimedia Commons）", url: "https://commons.wikimedia.org/wiki/File:Stonehenge2007_07_30.jpg" }, { title: "美術検定協会 出題範囲", url: "https://www.bijutsukentei.com/coverage" }],
  },
  {
    id: "philosophy-change-2", version: 1, projectId: "philosophy", projectTitle: "西洋哲学史",
    title: "変化と不変：二人の考えを比べる", questionCount: 7, minutes: "10〜15分",
    goal: "ヘラクレイトスとパルメニデスを区別し、川・ロゴス・有と無を手掛かりに理由を説明する。",
    notes: ["学習済みの第2回を扱います。短答3問と1〜3文で述べる説明・比較4問です。", "説明は一言一句の一致やキーワードの数で採点しません。必要な要点・許容する言い換え・重大な誤解で自己評価します。", "考え方を説明することと、その結論に自分が賛成することは別です。模範解答は一つの例として使います。"],
    sources: [{ title: "Notion 第2回 ヘラクレイトス――万物は流転するのか", url: "https://app.notion.com/p/3ccd27934134811ab6aeebf187c27663" }],
  },
];

export function getStudyUnit(id: string | null | undefined) {
  return studyUnits.find((unit) => unit.id === id) ?? null;
}
