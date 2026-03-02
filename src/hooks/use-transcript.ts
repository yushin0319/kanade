import { useState, useCallback } from "react";
import type { TranscriptEntry } from "../types";

export interface UseTranscriptReturn {
  transcript: TranscriptEntry[];
  addEntry: (role: "user" | "assistant", text: string) => void;
  updateStreaming: (role: "user" | "assistant", text: string) => void;
  finalizeStreaming: (role: "user" | "assistant") => void;
  clearTranscript: () => void;
}

export function useTranscript(): UseTranscriptReturn {
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);

  const addEntry = useCallback((role: "user" | "assistant", text: string) => {
    setTranscript((prev) => [
      ...prev,
      { role, text, timestamp: Date.now() },
    ]);
  }, []);

  /** 指定ロールのストリーミングエントリをリアルタイム更新 */
  const updateStreaming = useCallback((role: "user" | "assistant", text: string) => {
    setTranscript((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === role && last.streaming) {
        return [...prev.slice(0, -1), { ...last, text: last.text + text }];
      }
      return [...prev, { role, text, timestamp: Date.now(), streaming: true }];
    });
  }, []);

  /** 指定ロールのストリーミングを確定 */
  const finalizeStreaming = useCallback((role: "user" | "assistant") => {
    setTranscript((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === role && last.streaming) {
        return [...prev.slice(0, -1), { ...last, streaming: false }];
      }
      return prev;
    });
  }, []);

  const clearTranscript = useCallback(() => setTranscript([]), []);

  return { transcript, addEntry, updateStreaming, finalizeStreaming, clearTranscript };
}
