/**
 * 会話サマリー生成
 * Gemini テキスト API を使って会話ログを要約する
 */

import { GoogleGenAI } from "@google/genai";
import type { TranscriptEntry } from "../types";

/** サマリーの最大文字数 */
export const MAX_SUMMARY_LENGTH = 2000;

/** 要約に使用するモデル */
const SUMMARY_MODEL = "gemini-2.5-flash";

/** 会話ログをテキスト形式にフォーマット */
export function formatTranscriptForSummary(
  transcript: TranscriptEntry[],
): string {
  if (transcript.length === 0) return "";

  return transcript
    .map((entry) => {
      const role = entry.role === "user" ? "ユーザー" : "アシスタント";
      return `${role}: ${entry.text}`;
    })
    .join("\n");
}

/** 会話ログを Gemini テキスト API で要約 */
export async function summarize(
  transcript: TranscriptEntry[],
  apiKey: string,
): Promise<string> {
  if (transcript.length === 0) return "";

  const formatted = formatTranscriptForSummary(transcript);

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: SUMMARY_MODEL,
    contents: `以下の会話を簡潔に要約してください。要点を箇条書きで整理し、日本語で回答してください。\n\n${formatted}`,
  });

  const text = response.text ?? "";

  if (text.length > MAX_SUMMARY_LENGTH) {
    return text.slice(0, MAX_SUMMARY_LENGTH);
  }

  return text;
}
