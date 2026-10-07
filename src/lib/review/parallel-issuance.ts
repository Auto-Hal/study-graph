/** Independent exercises overlap; each exercise keeps its archive/issue/resolve order.
 * Stop queuing after a failure and wait for in-flight work before returning it.
 */
export async function prepareReviewExercises<Input, Output>(
  entries: readonly Input[], prepare: (entry: Input) => Promise<Output>,
): Promise<Output[]> {
  const results = new Array<Output>(entries.length);
  let next = 0;
  let failed = false;
  let failure: unknown;
  async function worker() {
    while (!failed && next < entries.length) {
      const index = next++;
      try { results[index] = await prepare(entries[index]); }
      catch (error) { if (!failed) { failed = true; failure = error; } }
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, entries.length) }, worker));
  if (failed) throw failure;
  return results;
}
