import type { ExplanationRubric } from "../exercises/types.ts";
import { westernArtObjectiveRegistry } from "../western-art-objective-registry.ts";
import { buildUnitExercise as build, type UnitExercise } from "./exercise-builder.ts";
import glyphAssets from "./glyph-assets.ts";
import nextGlyphAssets from "./next-glyph-assets.ts";
import { stonehengeAsset } from "./art-assets.ts";

const notion = (id: string) => "https://app.notion.com/p/" + id.replaceAll("-", "");
const characters: Record<string, string> = {
  "あ": "3ccd2793-4134-815f-95f0-cc64dcdb86c7",
  "い": "3ccd2793-4134-8183-8cb4-c0bf821aba3f",
  "う": "3ccd2793-4134-81fe-81f8-fa1c4f33987c",
};
const kuz = nextGlyphAssets.map(({ reading, asset }, i) => build({
  projectId: "kuzushiji", exerciseId: "kuzushiji.unit-reading." + asset.assetId,
  subjectId: characters[reading], subjectUrl: notion(characters[reading]),
  title: "新しい実資料の字形", prompt: "この字形の読みを、ひらがな1字で答えてください。",
  answers: [reading], asset, comparisonAsset: glyphAssets[i].asset,
  explanation: `読みは「${reading}」です。前の単元の同じ読みと、線のつながり・曲がり・広がりを見比べてください。一つの形だけを覚えず、字形の幅を確かめます。画像だけから字母は判定しません。`,
  lectureUrl: notion("3ccd2793-4134-8181-9baf-f81888996b38"),
}));
export const kuzComparisonQuestions: readonly UnitExercise[] = [kuz[0], kuz[4], kuz[2], kuz[1], kuz[3], kuz[5]];

const artLecture = notion("3c5d2793-4134-816b-8acb-d847d0e539e6");
const stonehenge = "3c5d2793-4134-8154-94d5-d9d86589916c";
const neolithic = "3c5d2793-4134-8120-8829-f034d209ec9e";
const artSources = [{ kind: "text-reference" as const, title: "English Heritage: History of Stonehenge",
  url: "https://www.english-heritage.org.uk/visit/places/stonehenge/history-and-stories/history/", attribution: "English Heritage" }];
export const artMegalithQuestions: readonly UnitExercise[] = [
  build({
    projectId: "western-art-history", exerciseId: "western-art-history.unit.stonehenge-image",
    subjectId: stonehenge, subjectUrl: notion(stonehenge), title: "巨石を組み合わせた遺跡",
    prompt: "写真に写っている、イングランド南部の代表的な巨石記念物の名称を答えてください。",
    answers: ["ストーンヘンジ", "ストーン・ヘンジ", "Stonehenge"], asset: stonehengeAsset,
    explanation: "ストーンヘンジです。垂直の石に横石を載せた構造と、円環状の配置を、作品名と結び付けます。現在残る姿は、複数段階の造営と長い時間の経過を経たものです。",
    lectureUrl: artLecture, additionalSources: artSources,
  }),
  // Reuse the four existing short-answer revisions; their answers and SRS identities do not change.
  ...westernArtObjectiveRegistry.slice(3),
  build({
    projectId: "western-art-history", exerciseId: "western-art-history.unit.stonehenge-country",
    subjectId: stonehenge, subjectUrl: notion(stonehenge), title: "巨石記念物と場所",
    prompt: "ストーンヘンジがある現在の国、またはその構成国を答えてください。",
    answers: ["イギリス", "英国", "連合王国", "グレートブリテン及び北アイルランド連合王国", "イングランド", "United Kingdom", "UK", "England"],
    explanation: "現在のイギリス（連合王国）のイングランド南部にあります。フランスのラスコー、スペインのアルタミラと、場所と形式を区別します。",
    lectureUrl: artLecture, additionalSources: artSources,
  }),
  build({
    projectId: "western-art-history", exerciseId: "western-art-history.unit.stonehenge-period",
    subjectId: neolithic, subjectUrl: notion(neolithic), title: "巨石記念物と時代",
    prompt: "ストーンヘンジの中心の石組みが造られた紀元前2500年頃は、主に何時代にあたりますか。",
    answers: ["新石器時代", "新石器時代後期", "後期新石器時代", "後期新石器", "新石器"],
    explanation: "新石器時代の後期です。遺跡全体は紀元前3000年頃から段階的に造られ、青銅器時代にも利用・改変されました。一つの年や時代だけで遺跡全体を説明しないことも大切です。",
    lectureUrl: artLecture, additionalSources: artSources,
  }),
  build({
    projectId: "western-art-history", exerciseId: "western-art-history.unit.stonehenge-context",
    subjectId: stonehenge, subjectUrl: notion(stonehenge), title: "巨石記念物の背景を考える",
    prompt: "ストーンヘンジを「天体観測の装置だけ」と断定しにくい理由を、埋葬や共同体にも触れて1〜3文で説明してください。",
    asset: stonehengeAsset, explanation: "形や天体との関係に加え、埋葬の証拠と共同体の儀礼・景観の文脈を合わせて考えます。具体的な意味や用途を一つに決め付けません。",
    rubric: {
      modelAnswer: "太陽の動きと関係する配置がある一方、遺跡には埋葬の証拠もある。共同体が大きな労力をかけて造り、儀礼や祖先との関係を共有した可能性も考えられるため、観測だけが唯一の用途とは断定できない。",
      requiredPoints: ["埋葬の証拠があることに触れ、天体観測だけに説明を絞らない。", "共同体の儀礼・祖先・共有空間などの背景を考え、具体的な用途や意味には不確実さがあると述べる。"],
      allowedParaphrases: ["「墓としても使われた跡がある」「亡くなった人と関わる場所だった」でもよい。", "「みんなで造った儀式の場所かもしれないが、使い道は一つに決められない」でもよい。"],
      majorMisconceptions: ["太陽と関係する配置だけで、観測以外の用途を否定する。", "特定の神や祭祀、円環の象徴的意味が確定していると断言する。"],
    }, lectureUrl: artLecture, additionalSources: artSources,
  }),
];

const phiLecture = notion("3ccd2793-4134-811a-b6ae-ebf187c27663");
const heraclitus = "3ccd2793-4134-8125-874d-ce67b171d099";
const parmenides = "3ccd2793-4134-8191-b6d1-dd663388a764";
const logos = "3bdd2793-4134-81e7-a2a2-c61c53c9b821";
const identity = "3ccd2793-4134-8101-9a85-de7079bb5c0d";
const short = (id: string, subjectId: string, title: string, prompt: string, answers: string[], explanation: string) => build({
  projectId: "philosophy", exerciseId: "philosophy.unit." + id, subjectId, subjectUrl: notion(subjectId),
  title, prompt, answers, explanation, lectureUrl: phiLecture,
});
const explain = (id: string, subjectId: string, title: string, prompt: string, rubric: ExplanationRubric) => build({
  projectId: "philosophy", exerciseId: "philosophy.unit." + id, subjectId, subjectUrl: notion(subjectId),
  title, prompt, rubric, explanation: "説明の言葉は自由です。必要な要点と重大な誤解を確認して、自分で評価します。", lectureUrl: phiLecture,
});
export const philosophyChangeQuestions: readonly UnitExercise[] = [
  short("heraclitus-name", heraclitus, "変化と秩序", "世界を秩序ある変化として捉え、思想が後世「万物流転」と要約される哲学者を答えてください。", ["ヘラクレイトス", "ヘラクリトス", "Heraclitus"], "ヘラクレイトスです。「万物流転」は後世の要約で、パンタ・レイという定型句を現存断片の直接引用とみなさない点に注意します。"),
  short("parmenides-name", parmenides, "不変の存在", "「あるものはある、ないものはない」から、真の存在は生成・消滅しないと論じた哲学者を答えてください。", ["パルメニデス", "Parmenides"], "パルメニデスです。感覚に現れる変化と、理性によって論じられる真の存在を区別して考えます。"),
  short("heraclitus-logos", logos, "変化を貫く秩序", "ヘラクレイトスにおいて、変化する世界を貫く共通の秩序・道理を表す概念を答えてください。", ["ロゴス", "Logos"], "ロゴスです。第1回の理由・説明という意味に加え、第2回では世界の変化を貫く共通の秩序という意味を考えます。"),
  explain("river-identity", identity, "水が変わっても同じ川か", "川の水は入れ替わります。それでも「同じ川」と呼べると考えるなら、何が同一性を支えるのか、1〜3文で説明してください。", {
    modelAnswer: "水そのものは入れ替わっても、流路や流れの構造、時間を通じた連続性が保たれるなら、同じ川と捉えられる。同一性を、固定された水分子ではなく、一定の仕方で変化し続ける過程に見いだせる。",
    requiredPoints: ["水など構成するものは入れ替わると述べる。", "流路・構造・運動・時間的連続性などを根拠として挙げ、固定した材料の一致とは区別する。"],
    allowedParaphrases: ["「中身は変わるが流れる道と流れが続く」「水ではなく連続した流れを川と呼ぶ」でもよい。", "同一性の基準を一つに断定する必要はない。別の基準を加えても、構成物と持続する関係を区別できればよい。"],
    majorMisconceptions: ["水分子がまったく同じままだから、同じ川だと説明する。", "同一性の根拠を挙げず、名前が同じだからとだけ答える。"],
  }),
  explain("change-order", heraclitus, "変化と無秩序を分ける", "「ヘラクレイトスでは、すべてが変わるので世界には秩序がない」という説明を、ロゴスに触れて1〜3文で修正してください。", {
    modelAnswer: "ヘラクレイトスは、変化を無秩序な混乱と同じものとは考えない。対立や変化の過程にも共通の秩序・道理であるロゴスがあると捉える。",
    requiredPoints: ["変化することから秩序の不在は導けないと指摘する。", "ロゴスを、変化を貫く秩序・道理として説明する。"],
    allowedParaphrases: ["「変わり方にも共通の仕組みがある」「ばらばらに変わるだけではない」でもよい。", "ロゴスという語を繰り返さなくても、提示された概念の役割を自分の言葉で述べればよい。"],
    majorMisconceptions: ["変化するなら、どんな規則や共通の道理もないとする。", "ロゴスを変化を完全に止める力や、人が勝手に決める規則だけとする。"],
  }),
  explain("change-being-comparison", parmenides, "変化と不変を比べる", "ヘラクレイトスとパルメニデスは、変化と存在をどう捉えますか。共通する問いと違いを1〜3文で比べてください。", {
    modelAnswer: "どちらも世界の根本的なあり方を問うが、ヘラクレイトスは秩序ある変化を根本に置く。一方、パルメニデスは「あるものはある、ないものはない」という論理から、真の存在は生成・消滅しないと論じる。",
    requiredPoints: ["両者が世界・存在の根本的なあり方を問うという共通点を示す。", "ヘラクレイトスの秩序ある変化と、パルメニデスの真の存在の不変を区別する。"],
    allowedParaphrases: ["「変わり続ける過程に秩序を見る」と「本当にあるものは生まれたりなくなったりしない」でよい。", "名称・定型句の一致より、二人の立場を取り違えず比較できているかを確認する。"],
    majorMisconceptions: ["二人の立場を逆にする。", "パルメニデスを、日常の見かけ上の変化すら目に入らなかった人だと説明する。"],
  }),
  explain("parmenides-reason", parmenides, "不変という結論の理由", "パルメニデスが真の存在の生成・消滅を否定する理由を、「有」と「無」の関係から1〜3文で説明してください。", {
    modelAnswer: "「ないもの」は存在しないため、無から有が生じたり、有が無になったりするとは考えられない。この原則を徹底すると、真に存在するものは生成・消滅しないという結論になる。",
    requiredPoints: ["無から有が生じること、または有が無になることを認めない論理に触れる。", "その論理を真の存在の生成・消滅の否定という結論につなげる。"],
    allowedParaphrases: ["「何もないところから突然あるものは出てこない」「あるものが完全な無にはならない」でもよい。", "古代の議論の筋道を説明すればよい。自分がその結論に賛成する必要はない。"],
    majorMisconceptions: ["現代の質量保存の実験だけを、その人が実際に行った論証として示す。", "変化を見たことがないから否定した、と感覚経験の不足だけで説明する。"],
  }),
];
