/**
 * AudioContext ヘルパー
 * ユーザーインタラクション後に AudioContext を生成・キャッシュ
 */

const contextCache = new Map<string, AudioContext>();

export async function getAudioContext(
  options?: AudioContextOptions & { id?: string },
): Promise<AudioContext> {
  const id = options?.id;

  if (id && contextCache.has(id)) {
    return contextCache.get(id)!;
  }

  const ctx = new AudioContext(options);

  // suspended 状態の場合は resume を試みる
  if (ctx.state === "suspended") {
    await ctx.resume();
  }

  if (id) {
    contextCache.set(id, ctx);
  }
  return ctx;
}
