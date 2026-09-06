import Link from "next/link";
import PrimaryNav from "@/src/components/PrimaryNav";
import { getKuzushijiDashboard } from "@/src/lib/notion/kuzushiji";
import { getReviewStates, isReviewPersistenceConfigured } from "@/src/lib/supabase/review";

export const dynamic = "force-dynamic";

type ConnectionState = "online" | "fallback" | "offline";

function StatusBadge({ state, children }: { state: ConnectionState; children: React.ReactNode }) {
  return <span className={`connection-badge ${state}`}>{children}</span>;
}

export default async function SettingsPage() {
  const data = await getKuzushijiDashboard();
  const supabaseConfigured = isReviewPersistenceConfigured();
  let reviewStateCount: number | null = null;

  if (supabaseConfigured) {
    try {
      reviewStateCount = (await getReviewStates()).length;
    } catch {
      reviewStateCount = null;
    }
  }

  const supabaseOnline = reviewStateCount !== null;

  return (
    <main className="learn-shell">
      <header className="learn-header">
        <Link className="learn-brand" href="/">
          <span className="learn-brand-mark" aria-hidden="true">SG</span>
          <span>
            <strong>Study Graph</strong>
            <small>設定・接続状態</small>
          </span>
        </Link>
        <div className={`sync-pill ${data.mode === "notion" && supabaseOnline ? "online" : "demo"}`}>
          <span className="dot" />
          {data.mode === "notion" && supabaseOnline ? "All systems ready" : "接続状態を確認"}
        </div>
      </header>

      <nav className="breadcrumbs" aria-label="パンくずリスト">
        <Link href="/">Home</Link>
        <span>Settings</span>
      </nav>

      <section className="learn-hero settings-hero">
        <p className="eyebrow">SETTINGS</p>
        <h1>学習データの接続状態を確認する。</h1>
        <p className="learn-hero-copy">
          秘密情報そのものは表示せず、Study GraphがNotionとSupabaseを利用できているかだけを確認できます。
        </p>
      </section>

      <section className="settings-grid" aria-label="接続状態">
        <article className="settings-card">
          <div className="settings-card-heading">
            <div>
              <p className="eyebrow">KNOWLEDGE SOURCE</p>
              <h2>Notion</h2>
            </div>
            <StatusBadge state={data.mode === "notion" ? "online" : "fallback"}>
              {data.mode === "notion" ? "接続中" : "Demo fallback"}
            </StatusBadge>
          </div>
          <p>講義・文字・誤読・資料・表現の正本。Study GraphはRelationも含めてread-onlyで利用します。</p>
          <dl className="settings-facts">
            <div><dt>講義</dt><dd>{data.lectures.length}</dd></div>
            <div><dt>文字</dt><dd>{data.characters.length}</dd></div>
            <div><dt>誤読記録</dt><dd>{data.mistakes.length}</dd></div>
          </dl>
        </article>

        <article className="settings-card">
          <div className="settings-card-heading">
            <div>
              <p className="eyebrow">REVIEW STORAGE</p>
              <h2>Supabase</h2>
            </div>
            <StatusBadge state={supabaseOnline ? "online" : supabaseConfigured ? "fallback" : "offline"}>
              {supabaseOnline ? "接続中" : supabaseConfigured ? "要確認" : "未設定"}
            </StatusBadge>
          </div>
          <p>高頻度の復習履歴と次回復習日時を保存します。ブラウザへアプリ用トークンは渡しません。</p>
          <dl className="settings-facts">
            <div><dt>管理中の項目</dt><dd>{reviewStateCount ?? "—"}</dd></div>
            <div><dt>保存方式</dt><dd>Server RPC</dd></div>
            <div><dt>テーブル公開</dt><dd>RLS</dd></div>
          </dl>
        </article>

        <article className="settings-card">
          <div className="settings-card-heading">
            <div>
              <p className="eyebrow">APP POLICY</p>
              <h2>現在の構成</h2>
            </div>
            <StatusBadge state="online">Phase 2</StatusBadge>
          </div>
          <ul className="settings-list">
            <li><span>表示タイムゾーン</span><strong>Asia/Tokyo</strong></li>
            <li><span>AI API</span><strong>未使用</strong></li>
            <li><span>Knowledge Graph</span><strong>有効・read-only</strong></li>
            <li><span>Notion書き戻し</span><strong>無効</strong></li>
          </ul>
        </article>
      </section>

      {data.mode !== "notion" && (
        <section className="settings-warning" role="status">
          <strong>Notionの実データを取得できていません。</strong>
          <p>現在はDemo fallbackです。Vercelの環境変数とNotion Integrationの接続状態を確認してください。</p>
        </section>
      )}

      {supabaseConfigured && !supabaseOnline && (
        <section className="settings-warning" role="status">
          <strong>Supabaseへの接続確認に失敗しました。</strong>
          <p>復習画面はNotion由来のキューへフォールバックします。保存系の接続状態を確認してください。</p>
        </section>
      )}

      <PrimaryNav active="settings" />
    </main>
  );
}
