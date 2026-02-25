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
  const errorRef = useRef(false);
  // ストリーミング中のアシスタント応答を蓄積
  const pendingTextRef = useRef("");

  const addEntry = useCallback((role: "user" | "assistant", text: string) => {
    setTranscript((prev) => [
      ...prev,
      { role, text, timestamp: Date.now() },
    ]);
  }, []);

  // ストリーミング中のアシスタントメッセージをリアルタイム更新
  const updateStreaming = useCallback((text: string) => {
    setTranscript((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === "assistant" && last.streaming) {
        // 既存のストリーミングエントリを更新
        return [
          ...prev.slice(0, -1),
          { ...last, text: last.text + text },
        ];
      }
      // 新しいストリーミングエントリを作成
      return [
        ...prev,
        { role: "assistant" as const, text, timestamp: Date.now(), streaming: true },
      ];
    });
  }, []);

  const finalizeStreaming = useCallback(() => {
    setTranscript((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === "assistant" && last.streaming) {
        return [
          ...prev.slice(0, -1),
          { ...last, streaming: false },
        ];
      }
      return prev;
    });
  }, []);

  const connect = useCallback(async () => {
    if (wsRef.current) return;

    setState("connecting");
    setError(null);
    errorRef.current = false;
    pendingTextRef.current = "";

    let apiKey: string;
    try {
      // Rust 側から API Key を取得
      apiKey = await invoke<string>("get_api_key");
    } catch (e) {
      console.error("get_api_key failed:", e);
      setState("error");
      setError("connection_failed");
      return;
    }

    if (!apiKey) {
      console.error("API key is empty");
      setState("error");
      setError("connection_failed");
      return;
    }

    const model = "gemini-2.5-flash-native-audio-latest";
    const wsUrl = `${GEMINI_WS_BASE}/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;

    console.log("WebSocket connecting to:", wsUrl.replace(apiKey, "***"));

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("WebSocket opened");
      const setupMessage = {
        setup: {
          model: `models/${model}`,
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: "Puck",
                },
              },
            },
          },
          outputAudioTranscription: {},
        },
      };
      ws.send(JSON.stringify(setupMessage));
    };

    ws.onmessage = async (event) => {
      try {
        let raw: string;
        if (event.data instanceof Blob) {
          raw = await event.data.text();
        } else {
          raw = event.data as string;
        }

        const data = JSON.parse(raw);

        // デバッグ: メッセージのキーを表示
        const keys = Object.keys(data);
        const scKeys = data.serverContent ? Object.keys(data.serverContent) : [];
        console.log("WS keys:", keys, "serverContent keys:", scKeys);

        // セットアップ完了レスポンス
        if (data.setupComplete) {
          console.log("Setup complete");
          setState("connected");
          return;
        }

        // 音声出力のトランスクリプション（チャンクをストリーミング表示）
        if (data.serverContent?.outputTranscription?.text) {
          updateStreaming(data.serverContent.outputTranscription.text);
        }

        // ターン完了でストリーミングを確定
        if (data.serverContent?.turnComplete) {
          console.log("Turn complete");
          finalizeStreaming();
        }
      } catch (e) {
        console.warn("WS message parse error:", e);
      }
    };

    ws.onerror = (ev) => {
      console.error("WebSocket error:", ev);
      errorRef.current = true;
      setState("error");
      setError("connection_failed");
      wsRef.current = null;
    };

    ws.onclose = (ev) => {
      console.log("WebSocket closed:", ev.code, ev.reason);
      if (ev.code !== 1000 && ev.code !== 1005 && !errorRef.current) {
        errorRef.current = true;
        setState("error");
        setError("connection_failed");
      } else if (!errorRef.current) {
        setState("idle");
      }
      wsRef.current = null;
    };
  }, [updateStreaming, finalizeStreaming]);

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
