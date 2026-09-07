"use client";

import { FormEvent, useState } from "react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(false);
    setSaving(true);
    try {
      const response = await fetch("/api/auth/session", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) {
        setError(true);
        return;
      }
      window.location.assign("/review");
    } catch {
      setError(true);
    } finally {
      setPassword("");
      setSaving(false);
    }
  }

  return (
    <main className="page-shell">
      <form onSubmit={submit} style={{ maxWidth: 420, margin: "15vh auto", display: "grid", gap: 16 }}>
        <h1>Study Graphへログイン</h1>
        <label>
          パスワード
          <input
            autoFocus
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error && <p role="alert">ログインできませんでした。</p>}
        <button type="submit" disabled={saving}>{saving ? "確認中…" : "ログイン"}</button>
      </form>
    </main>
  );
}
