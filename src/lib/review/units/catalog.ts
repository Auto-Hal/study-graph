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
];

export function getStudyUnit(id: string | null | undefined) {
  return studyUnits.find((unit) => unit.id === id) ?? null;
}
