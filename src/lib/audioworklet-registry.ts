/**
 * AudioWorklet レジストリ
 * AudioContext ごとにワークレットノードを管理
 * Original: google-gemini/live-api-web-console (Apache 2.0)
 */

export type WorkletGraph = {
  node?: AudioWorkletNode;
  handlers: Array<(this: MessagePort, ev: MessageEvent) => void>;
};

export const registeredWorklets: Map<
  AudioContext,
  Record<string, WorkletGraph>
> = new Map();

/** ワークレットソース文字列から Blob URL を生成 */
export function createWorkletFromSrc(
  workletName: string,
  workletSrc: string,
): string {
  const script = new Blob(
    [`registerProcessor("${workletName}", ${workletSrc})`],
    { type: "application/javascript" },
  );
  return URL.createObjectURL(script);
}
