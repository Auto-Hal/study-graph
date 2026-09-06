import Link from "next/link";
import PrimaryNav from "@/src/components/PrimaryNav";
import { getKuzushijiGraph, type GraphNodeKind } from "@/src/lib/notion/kuzushiji-graph";
import GraphExplorer from "./GraphExplorer";

export const dynamic = "force-dynamic";

const kindLabels: Record<GraphNodeKind, string> = {
  lecture: "講義",
  character: "文字",
  mistake: "誤読",
  source: "資料",
  expression: "表現",
};

export default async function KnowledgeGraphPage() {
  const graph = await getKuzushijiGraph();
  const kinds = Object.keys(kindLabels) as GraphNodeKind[];
  const counts = kinds.reduce<Record<GraphNodeKind, number>>(
    (acc, kind) => {
      acc[kind] = graph.nodes.filter((node) => node.kind === kind).length;
      return acc;
    },
    { lecture: 0, character: 0, mistake: 0, source: 0, expression: 0 },
  );

  return (
    <main className="learn-shell graph-page-shell">
      <header className="learn-header">
        <Link className="learn-brand" href="/">
          <span className="learn-brand-mark" aria-hidden="true">SG</span>
          <span>
            <strong>Study Graph</strong>
            <small>Knowledge Graph</small>
          </span>
        </Link>
        <div className={`sync-pill ${graph.mode === "notion" ? "online" : "demo"}`}>
          <span className="dot" />
          {graph.mode === "notion" ? "Notion Relations 接続中" : "Demo graph"}
        </div>
      </header>

      <nav className="breadcrumbs" aria-label="パンくずリスト">
        <Link href="/">Home</Link>
        <span>Graph</span>
      </nav>

      <section className="learn-hero graph-hero">
        <p className="eyebrow">KNOWLEDGE GRAPH · PHASE 2</p>
        <h1>知識の関係を、学習の地図として見る。</h1>
        <p className="learn-hero-copy">
          NotionのRelationをそのまま読み取り、講義・文字・誤読・資料・表現がどこでつながっているかを可視化します。
          GraphからNotionへ書き込みは行いません。
        </p>
      </section>

      {graph.mode === "demo" && (
        <section className="notice" role="status">
          <strong>Notion Relationを取得できていません。</strong>
          <span> 現在はDemo graphです。Settingsから接続状態を確認できます。</span>
        </section>
      )}

      <section className="graph-summary-grid" aria-label="Graphサマリー">
        <article>
          <span>NODES</span>
          <strong>{graph.nodes.length}</strong>
          <small>可視化している知識</small>
        </article>
        <article>
          <span>RELATIONS</span>
          <strong>{graph.edges.length}</strong>
          <small>Notion由来の接続</small>
        </article>
        <article>
          <span>LECTURES</span>
          <strong>{counts.lecture}</strong>
          <small>中心となる講義</small>
        </article>
        <article>
          <span>KNOWLEDGE TYPES</span>
          <strong>{kinds.filter((kind) => counts[kind] > 0).length}</strong>
          <small>現在のノード種類</small>
        </article>
      </section>

      <GraphExplorer nodes={graph.nodes} edges={graph.edges} />

      <section className="graph-policy-note">
        <div>
          <p className="eyebrow">GRAPH POLICY</p>
          <h2>Notionを正本のまま使う。</h2>
        </div>
        <p>
          Phase 2.0では新しいGraph専用DBを作りません。既存Relationを読み取り、Study Graph側で共通ノード・エッジへ変換します。
          この方式なら、西洋美術史や哲学史でも既存Notion構造を保ったままAdapterを追加できます。
        </p>
      </section>

      <PrimaryNav active="graph" />
    </main>
  );
}
