import Link from "next/link";
import PrimaryNav from "@/src/components/PrimaryNav";
import { getGraphProject, listGraphProjects, loadProjectGraph } from "@/src/lib/graph/registry";
import GraphExplorer from "./GraphExplorer";

export const dynamic = "force-dynamic";

export default async function KnowledgeGraphPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; node?: string; relation?: string; view?: string }>;
}) {
  const query = await searchParams;
  const project = getGraphProject(query.project);
  const [graph, graphProjects] = await Promise.all([
    loadProjectGraph(project.id),
    Promise.resolve(listGraphProjects()),
  ]);
  const counts = Object.fromEntries(project.graphNodeKinds.map((kind) => [kind.id, graph.nodes.filter((node) => node.kind === kind.id).length]));
  const initialNodeId = query.node && graph.nodes.some((node) => node.id === query.node) ? query.node : undefined;
  const initialRelation = query.relation && graph.edges.some((edge) => edge.label === query.relation) ? query.relation : undefined;
  const initialView = query.view === "focus" ? "focus" as const : "overview" as const;
  const populatedKinds = project.graphNodeKinds.filter((kind) => (counts[kind.id] ?? 0) > 0).length;

  return (
    <main className="learn-shell graph-page-shell">
      <header className="learn-header">
        <Link className="learn-brand" href="/"><span className="learn-brand-mark" aria-hidden="true">SG</span><span><strong>Study Graph</strong><small>Knowledge Graph · {project.shortLabel}</small></span></Link>
        <div className={`sync-pill ${graph.mode === "notion" ? "online" : "demo"}`}><span className="dot" />{graph.mode === "notion" ? "Notion Relations 接続中" : "Demo graph"}</div>
      </header>

      <nav className="breadcrumbs" aria-label="パンくずリスト"><Link href="/">Home</Link><span>Graph</span><span>{project.shortLabel}</span></nav>

      <section className="learn-hero graph-hero">
        <p className="eyebrow">KNOWLEDGE GRAPH · PHASE 2.2</p>
        <h1>プロジェクトごとの知識を、同じ地図で辿る。</h1>
        <p className="learn-hero-copy">Notion schemaはプロジェクトごとに保ったまま、Adapterが共通Node / Edgeへ変換します。Graph UIは同じまま、学習分野ごとにノード種類だけを差し替えられます。</p>
      </section>

      <nav className="graph-project-selector" aria-label="Graphプロジェクト選択">
        {graphProjects.map((item) => item.graphAvailable ? (
          <Link className={item.id === project.id ? "active" : undefined} href={`/graph?project=${encodeURIComponent(item.id)}`} key={item.id} aria-current={item.id === project.id ? "page" : undefined}>
            <span>{item.shortLabel}</span><small>{item.phase}</small>
          </Link>
        ) : (
          <span className="planned" key={item.id} aria-disabled="true"><span>{item.shortLabel}</span><small>{item.phase}予定</small></span>
        ))}
      </nav>

      {graph.mode === "demo" && <section className="notice" role="status"><strong>Notion Relationを取得できていません。</strong><span> 現在はDemo graphです。Settingsから接続状態を確認できます。</span></section>}

      <section className="graph-summary-grid" aria-label="Graphサマリー">
        <article><span>NODES</span><strong>{graph.nodes.length}</strong><small>可視化している知識</small></article>
        <article><span>RELATIONS</span><strong>{graph.edges.length}</strong><small>Notion由来の接続</small></article>
        <article><span>PROJECT</span><strong className="graph-summary-project">{project.shortLabel}</strong><small>{project.eyebrow}</small></article>
        <article><span>NODE TYPES</span><strong>{populatedKinds}/{project.graphNodeKinds.length}</strong><small>現在データあり / 定義済み</small></article>
      </section>

      <GraphExplorer projectId={project.id} kindDefinitions={project.graphNodeKinds} nodes={graph.nodes} edges={graph.edges} initialNodeId={initialNodeId} initialRelation={initialRelation} initialView={initialView} />

      <section className="graph-policy-note">
        <div><p className="eyebrow">ADAPTER ARCHITECTURE</p><h2>DBを揃えず、Graph型だけを揃える。</h2></div>
        <p>くずし字・西洋美術史・哲学史でNotionのDB構造が異なっていても問題ありません。各AdapterがNode / Edgeへ変換し、Project Registryがノード種類と表示名をGraph UIへ渡します。</p>
      </section>

      <PrimaryNav active="graph" />
    </main>
  );
}
