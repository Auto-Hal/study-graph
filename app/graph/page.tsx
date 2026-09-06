import Link from "next/link";
import PrimaryNav from "@/src/components/PrimaryNav";
import { getGraphLearningOverlay } from "@/src/lib/graph/learning";
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
  const learning = await getGraphLearningOverlay(graph.nodes, graph.edges);
  const counts = Object.fromEntries(project.graphNodeKinds.map((kind) => [kind.id, graph.nodes.filter((node) => node.kind === kind.id).length]));
  const initialNodeId = query.node && graph.nodes.some((node) => node.id === query.node) ? query.node : undefined;
  const initialRelation = query.relation && graph.edges.some((edge) => edge.label === query.relation) ? query.relation : undefined;
  const initialView = query.view === "focus" ? "focus" as const : "overview" as const;
  const populatedKinds = project.graphNodeKinds.filter((kind) => (counts[kind.id] ?? 0) > 0).length;
  const isWesternArt = project.id === "western-art-history";
  const isPhilosophy = project.id === "philosophy";

  const heroTitle = isWesternArt
    ? "作品・作家・時代を、関係の地図で読む。"
    : isPhilosophy
      ? "思想・問い・原典を、論争の地図として辿る。"
      : "プロジェクトごとの知識を、同じ地図で辿る。";

  const heroCopy = isWesternArt
    ? "講義・作家・作品・様式・用語・時代・文化・美術館／建築を、既存Notion Relationからread-onlyで可視化します。作品単体では見えにくい歴史的な位置づけを横断して確認できます。"
    : isPhilosophy
      ? "講義・哲学者・用語・哲学的問題・原典／著作・文化・時代・思考ノートを、既存Notion Relationからread-onlyで可視化します。思想を人物名の暗記ではなく、問い・著作・影響関係の中で確認できます。"
      : "Notion schemaはプロジェクトごとに保ったまま、Adapterが共通Node / Edgeへ変換します。Graph UIは同じまま、学習分野ごとにノード種類だけを差し替えられます。";

  const policyCopy = isWesternArt
    ? "美術史Notionの8つの既存DBを変更せず、それぞれのRelationをcanonical edgeへ変換しています。双方向Relationの逆側を再読込しないことで、同じ関係を二重線として表示しません。"
    : isPhilosophy
      ? "哲学史Notionの8つの既存DBを変更せず、講義を入口に、哲学者・用語・問題・原典・文化・時代・思考ノートのRelationをcanonical edgeへ変換します。師弟関係と影響関係も、逆Relationを重複表示しない向きだけを採用します。"
      : "くずし字・西洋美術史・哲学史でNotionのDB構造が異なっていても問題ありません。各AdapterがNode / Edgeへ変換し、Project Registryがノード種類と表示名をGraph UIへ渡します。";

  return (
    <main className="learn-shell graph-page-shell">
      <header className="learn-header">
        <Link className="learn-brand" href="/"><span className="learn-brand-mark" aria-hidden="true">SG</span><span><strong>Study Graph</strong><small>Knowledge Graph · {project.shortLabel}</small></span></Link>
        <div className={`sync-pill ${graph.mode === "notion" ? "online" : "demo"}`}><span className="dot" />{graph.mode === "notion" ? "Notion Relations 接続中" : "Demo graph"}</div>
      </header>

      <nav className="breadcrumbs" aria-label="パンくずリスト"><Link href="/">Home</Link><span>Graph</span><span>{project.shortLabel}</span></nav>

      <section className="learn-hero graph-hero">
        <p className="eyebrow">KNOWLEDGE GRAPH · PHASE 2.5</p>
        <h1>{heroTitle}</h1>
        <p className="learn-hero-copy">{heroCopy}</p>
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

      <section className={`graph-learning-summary ${learning.mode === "supabase" ? "online" : "offline"}`} aria-label="学習状態サマリー">
        <div className="graph-learning-copy">
          <p className="eyebrow">LEARNING OVERLAY</p>
          <h2>知識の地図に、復習状態を重ねる。</h2>
          <p>{learning.mode === "supabase" ? (learning.summary.tracked > 0 ? "Supabaseの復習履歴と同じNotionノードを照合しています。期限到来・苦手・最近復習した知識をRelationの中で確認できます。" : "Supabaseには接続できていますが、このプロジェクトにはまだ復習履歴と一致するノードがありません。Review対象が追加されると自動でここへ反映されます。") : "Supabaseの学習状態を取得できなかったため、Knowledge Graphのみを表示しています。"}</p>
        </div>
        <dl className="graph-learning-metrics">
          <div><dt>TRACKED</dt><dd>{learning.summary.tracked}</dd><span>履歴あり</span></div>
          <div><dt>DUE</dt><dd>{learning.summary.due}</dd><span>期限到来</span></div>
          <div><dt>WEAK</dt><dd>{learning.summary.weak}</dd><span>苦手</span></div>
          <div><dt>RECENT</dt><dd>{learning.summary.recent}</dd><span>7日以内</span></div>
        </dl>
      </section>

      <GraphExplorer projectId={project.id} kindDefinitions={project.graphNodeKinds} nodes={graph.nodes} edges={graph.edges} learning={learning} initialNodeId={initialNodeId} initialRelation={initialRelation} initialView={initialView} />

      <section className="graph-policy-note">
        <div><p className="eyebrow">ADAPTER ARCHITECTURE</p><h2>DBを揃えず、Graph型だけを揃える。</h2></div>
        <p>{policyCopy} Graph取得結果は5分間キャッシュし、同じプロジェクトを開くたびにNotionへ全Data Sourceを再問い合わせしない構成にしています。</p>
      </section>

      <PrimaryNav active="graph" />
    </main>
  );
}
