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

export default async function KnowledgeGraphPage({
  searchParams,
}: {
  searchParams: Promise<{ node?: string; relation?: string; view?: string }>;
}) {
  const [graph, query] = await Promise.all([getKuzushijiGraph(), searchParams]);
  const kinds = Object.keys(kindLabels) as GraphNodeKind[];
  const counts = kinds.reduce<Record<GraphNodeKind, number>>((acc, kind) => {
    acc[kind] = graph.nodes.filter((node) => node.kind === kind).length;
    return acc;
  }, { lecture: 0, character: 0, mistake: 0, source: 0, expression: 0 });
  const initialNodeId = query.node && graph.nodes.some((node) => node.id === query.node) ? query.node : undefined;
  const initialRelation = query.relation && graph.edges.some((edge) => edge.label === query.relation) ? query.relation : undefined;
  const initialView = query.view === "focus" ? "focus" as const : "overview" as const;

  return (
    <main className="learn-shell graph-page-shell">
      <header className="learn-header">
        <Link className="learn-brand" href="/"><span className="learn-brand-mark" aria-hidden="true">SG</span><span><strong>Study Graph</strong><small>Knowledge Graph</small></span></Link>
        <div className={`sync-pill ${graph.mode === "notion" ? "online" : "demo"}`}><span className="dot" />{graph.mode === "notion" ? "Notion Relations 接続中" : "Demo graph"}</div>
      </header>

      <nav className="breadcrumbs" aria-label="パンくずリスト"><Link href="/">Home</Link><span>Graph</span></nav>

      <section className="learn-hero graph-hero">
        <p className="eyebrow">KNOWLEDGE GRAPH · PHASE 2.1</p>
        <h1>知識の関係を、学習の地図として見る。</h1>
        <p className="learn-hero-copy">NotionのRelationをそのまま読み取り、講義・文字・誤読・資料・表現がどこでつながっているかを可視化します。ノードを中心表示した状態やRelation絞り込みはURLにも保持できます。</p>
      </section>

      {graph.mode === "demo" && <section className="notice" role="status"><strong>Notion Relationを取得できていません。</strong><span> 現在はDemo graphです。Settingsから接続状態を確認できます。</span></section>}

      <section className="graph-summary-grid" aria-label="Graphサマリー">
        <article><span>NODES</span><strong>{graph.nodes.length}</strong><small>可視化している知識</small></article>
        <article><span>RELATIONS</span><strong>{graph.edges.length}</strong><small>Notion由来の接続</small></article>
        <article><span>LECTURES</span><strong>{counts.lecture}</strong><small>中心となる講義</small></article>
        <article><span>KNOWLEDGE TYPES</span><strong>{kinds.filter((kind) => counts[kind] > 0).length}</strong><small>現在のノード種類</small></article>
      </section>

      <GraphExplorer nodes={graph.nodes} edges={graph.edges} initialNodeId={initialNodeId} initialRelation={initialRelation} initialView={initialView} />

      <section className="graph-policy-note">
        <div><p className="eyebrow">GRAPH POLICY</p><h2>Notionを正本のまま使う。</h2></div>
        <p>Graph専用DBへRelationを複製せず、既存RelationをStudy Graph側の共通ノード・エッジへ変換します。Sources / ExpressionsもStudy Graph内で詳細確認でき、Graphから全ノード種類へ移動できます。</p>
      </section>

      <PrimaryNav active="graph" />
    </main>
  );
}
