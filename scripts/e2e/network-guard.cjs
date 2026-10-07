// Loaded only in the disposable Next.js process. Never load production env files.
const originalFetch = globalThis.fetch;
const fixture = new URL(process.env.STUDY_GRAPH_E2E_FIXTURE_URL);
const app = new URL(process.env.STUDY_GRAPH_E2E_APP_URL);
globalThis.fetch = function guardedFetch(input, init) {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (url.origin === 'https://api.notion.com') {
    const target = new URL('/notion' + url.pathname + url.search, fixture);
    return originalFetch(input instanceof Request ? new Request(target, input) : target, init);
  }
  if (url.origin !== fixture.origin && url.origin !== app.origin) {
    throw new Error('E2E blocked external fetch to ' + url.hostname);
  }
  return originalFetch(input, init);
};
