import { useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ConnectionState, ErrorKind, TranscriptEntry } from "../types";

/** Gemini Live API テキスト接続フック */
export interface UseLiveApiReturn {
  state: ConnectionState;
  error: ErrorKind | null;
  transcript: TranscriptEntry[];
  connect: () => Promise<void>;
  disconnect: () => void;
  sendText: (text: string) => void;
}

// Gemini Live API の WebSocket エンドポイント
const GEMINI_WS_BASE = "wss://generativelanguage.googleapis.com/ws";

export function useLiveApi(): UseLiveApiReturn {
  const [state, setState] = useState<ConnectionState>("idle");
  const [error, setError] = useState<ErrorKind | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  const addEntry = useCallback((role: "user" | "assistant", text: string) => {
    setTranscript((prev) => [
      ...prev,
      { role, text, timestamp: Date.now() },
    ]);
  }, []);

  const connect = useCallback(async () => {
    if (wsRef.current) return;

    setState("connecting");
    setError(null);

    try {
      // Rust 側から API Key を取得
      const apiKey = await invoke<string>("get_api_key");
      if (!apiKey) {
        setState("error");
        setError("connection_failed");
        return;
      }

      const model = "gemini-2.0-flash-exp";
      const wsUrl = `${GEMINI_WS_BASE}/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        // セットアップメッセージを送信
        const setupMessage = {
          setup: {
            model: `models/${model}`,
            generationConfig: {
              responseModalities: ["TEXT"],
            },
          },
        };
        ws.send(JSON.stringify(setupMessage));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string);

          // セットアップ完了レスポンス
          if (data.setupComplete) {
            setState("connected");
            return;
          }

          // テキストレスポンス
          if (data.serverContent?.modelTurn?.parts) {
            for (const part of data.serverContent.modelTurn.parts) {
              if (part.text) {
                addEntry("assistant", part.text);
              }
            }
          }
        } catch {
          // JSON パースエラーは無視
        }
      };

      ws.onerror = () => {
        setState("error");
        setError("connection_failed");
        wsRef.current = null;
      };

      ws.onclose = () => {
        if (state !== "error") {
          setState("idle");
        }
        wsRef.current = null;
      };
    } catch {
      setState("error");
      setError("connection_failed");
    }
  }, [addEntry, state]);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setState("idle");
    setError(null);
  }, []);

  const sendText = useCallback(
    (text: string) => {
      if (!wsRef.current || state !== "connected") return;

      const message = {
        clientContent: {
          turns: [
            {
              role: "user",
              parts: [{ text }],
            },
          ],
          turnComplete: true,
        },
      };
      wsRef.current.send(JSON.stringify(message));
      addEntry("user", text);
    },
    [state, addEntry],
  );

  return { state, error, transcript, connect, disconnect, sendText };
}
