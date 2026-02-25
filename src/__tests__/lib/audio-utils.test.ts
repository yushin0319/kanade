import { describe, it, expect } from "vitest";
import {
  float32ToInt16,
  int16ToFloat32,
  pcm16ToFloat32,
  arrayBufferToBase64,
  base64ToArrayBuffer,
} from "../../lib/audio-utils";

describe("audio-utils", () => {
  describe("float32ToInt16", () => {
    it("無音（0.0）を 0 に変換する", () => {
      const input = new Float32Array([0.0, 0.0, 0.0]);
      const result = float32ToInt16(input);
      expect(result).toBeInstanceOf(Int16Array);
      expect(result.length).toBe(3);
      expect(result[0]).toBe(0);
      expect(result[1]).toBe(0);
      expect(result[2]).toBe(0);
    });

    it("最大値 1.0 を 32767 に変換する", () => {
      const input = new Float32Array([1.0]);
      const result = float32ToInt16(input);
      expect(result[0]).toBe(32767);
    });

    it("最小値 -1.0 を -32768 に変換する", () => {
      const input = new Float32Array([-1.0]);
      const result = float32ToInt16(input);
      expect(result[0]).toBe(-32768);
    });

    it("中間値を正しく変換する", () => {
      const input = new Float32Array([0.5]);
      const result = float32ToInt16(input);
      // 0.5 * 32767 = 16383.5 → 16383（正の値は * 32767）
      expect(result[0]).toBe(16383);
    });

    it("1.0 を超える値をクランプする", () => {
      const input = new Float32Array([1.5]);
      const result = float32ToInt16(input);
      expect(result[0]).toBe(32767);
    });

    it("-1.0 を下回る値をクランプする", () => {
      const input = new Float32Array([-1.5]);
      const result = float32ToInt16(input);
      expect(result[0]).toBe(-32768);
    });

    it("空配列を処理できる", () => {
      const input = new Float32Array([]);
      const result = float32ToInt16(input);
      expect(result.length).toBe(0);
    });
  });

  describe("int16ToFloat32", () => {
    it("0 を 0.0 に変換する", () => {
      const input = new Int16Array([0]);
      const result = int16ToFloat32(input);
      expect(result).toBeInstanceOf(Float32Array);
      expect(result[0]).toBeCloseTo(0.0);
    });

    it("32767 を約 1.0 に変換する", () => {
      const input = new Int16Array([32767]);
      const result = int16ToFloat32(input);
      expect(result[0]).toBeCloseTo(1.0, 3);
    });

    it("-32768 を -1.0 に変換する", () => {
      const input = new Int16Array([-32768]);
      const result = int16ToFloat32(input);
      expect(result[0]).toBe(-1.0);
    });

    it("空配列を処理できる", () => {
      const input = new Int16Array([]);
      const result = int16ToFloat32(input);
      expect(result.length).toBe(0);
    });
  });

  describe("float32 ↔ int16 ラウンドトリップ", () => {
    it("変換後に元の値に近い値に戻る", () => {
      const original = new Float32Array([0.0, 0.25, -0.5, 0.75, -1.0]);
      const int16 = float32ToInt16(original);
      const restored = int16ToFloat32(int16);
      for (let i = 0; i < original.length; i++) {
        // Int16 量子化誤差は 1/32768 ≈ 0.00003 程度
        expect(restored[i]).toBeCloseTo(original[i], 3);
      }
    });
  });

  describe("pcm16ToFloat32", () => {
    it("Uint8Array の PCM16 バイト列を Float32 に変換する", () => {
      // Int16 値 256 = 0x0100 (little-endian: [0x00, 0x01])
      const bytes = new Uint8Array([0x00, 0x01]);
      const result = pcm16ToFloat32(bytes);
      expect(result.length).toBe(1);
      // 256 / 32768 ≈ 0.0078125
      expect(result[0]).toBeCloseTo(256 / 32768, 5);
    });

    it("リトルエンディアンで解釈する", () => {
      // Int16 値 1 = 0x0001 (little-endian: [0x01, 0x00])
      const bytes = new Uint8Array([0x01, 0x00]);
      const result = pcm16ToFloat32(bytes);
      expect(result[0]).toBeCloseTo(1 / 32768, 5);
    });

    it("奇数バイト長の場合、末尾の余りを無視する", () => {
      const bytes = new Uint8Array([0x00, 0x01, 0xFF]);
      const result = pcm16ToFloat32(bytes);
      expect(result.length).toBe(1);
    });

    it("空バイト列を処理できる", () => {
      const bytes = new Uint8Array([]);
      const result = pcm16ToFloat32(bytes);
      expect(result.length).toBe(0);
    });
  });

  describe("arrayBufferToBase64", () => {
    it("空バッファを空文字列に変換する", () => {
      const buffer = new ArrayBuffer(0);
      expect(arrayBufferToBase64(buffer)).toBe("");
    });

    it("既知のバイト列を正しく base64 エンコードする", () => {
      // "Hello" = [72, 101, 108, 108, 111]
      const bytes = new Uint8Array([72, 101, 108, 108, 111]);
      const result = arrayBufferToBase64(bytes.buffer);
      expect(result).toBe(btoa("Hello"));
    });

    it("バイナリデータを正しくエンコードする", () => {
      const bytes = new Uint8Array([0, 128, 255]);
      const result = arrayBufferToBase64(bytes.buffer);
      // デコードして戻せることを確認
      const decoded = base64ToArrayBuffer(result);
      const restored = new Uint8Array(decoded);
      expect(restored[0]).toBe(0);
      expect(restored[1]).toBe(128);
      expect(restored[2]).toBe(255);
    });
  });

  describe("base64ToArrayBuffer", () => {
    it("空文字列を空バッファに変換する", () => {
      const result = base64ToArrayBuffer("");
      expect(result.byteLength).toBe(0);
    });

    it("base64 文字列をデコードする", () => {
      const base64 = btoa("Hello");
      const result = base64ToArrayBuffer(base64);
      const bytes = new Uint8Array(result);
      expect(bytes[0]).toBe(72); // 'H'
      expect(bytes[1]).toBe(101); // 'e'
      expect(bytes.length).toBe(5);
    });
  });

  describe("base64 ラウンドトリップ", () => {
    it("エンコード→デコードで元データに戻る", () => {
      const original = new Uint8Array([10, 20, 30, 40, 50, 0, 128, 255]);
      const base64 = arrayBufferToBase64(original.buffer);
      const restored = new Uint8Array(base64ToArrayBuffer(base64));
      expect(restored).toEqual(original);
    });
  });
});
