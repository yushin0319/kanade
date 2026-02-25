/**
 * 音声データ変換の純関数群
 * AudioWorklet や WebSocket 通信で使用する PCM16 ↔ Float32 変換など
 */

/** Float32Array（-1.0〜1.0）→ Int16Array（-32768〜32767）に変換 */
export function float32ToInt16(float32: Float32Array): Int16Array {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    // クランプしてから変換
    const clamped = Math.max(-1.0, Math.min(1.0, float32[i]));
    int16[i] = clamped < 0 ? clamped * 32768 : clamped * 32767;
  }
  return int16;
}

/** Int16Array（-32768〜32767）→ Float32Array（-1.0〜1.0）に変換 */
export function int16ToFloat32(int16: Int16Array): Float32Array {
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768;
  }
  return float32;
}

/** Uint8Array の PCM16 リトルエンディアンバイト列 → Float32Array に変換 */
export function pcm16ToFloat32(chunk: Uint8Array): Float32Array {
  const sampleCount = Math.floor(chunk.length / 2);
  const float32 = new Float32Array(sampleCount);
  const dataView = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);

  for (let i = 0; i < sampleCount; i++) {
    const int16 = dataView.getInt16(i * 2, true); // little-endian
    float32[i] = int16 / 32768;
  }
  return float32;
}

/** ArrayBuffer → Base64 文字列に変換 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return globalThis.btoa(binary);
}

/** Base64 文字列 → ArrayBuffer に変換 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  if (base64 === "") return new ArrayBuffer(0);
  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
