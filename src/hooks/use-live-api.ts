import { useState, useCallback, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ConnectionState, ErrorKind, TranscriptEntry } from "../types";
import type { GeminiModel, GeminiVoice } from "../types/settings";
import { AudioRecorder } from "../lib/audio-recorder";
import { AudioStreamer } from "../lib/audio-streamer";
import { base64ToArrayBuffer } from "../lib/audio-utils";
import { getAudioContext } from "../lib/audio-context";
import { parseBriefing, buildSystemInstruction } from "../lib/briefing-loader";
import VolMeterWorklet from "../lib/worklets/vol-meter";

/** Gemini Live API 音声チャットフック */
export interface UseLiveApiReturn {
  state: ConnectionState;
  error: ErrorKind | null;
  transcript: TranscriptEntry[];
  volume: number;
  connect: () => Promise<void>;
  disconnect: () => void;
  sendText: (text: string) => void;
  toggleMute: () => void;
}

const GEMINI_WS_BASE = "wss://generativelanguage.googleapis.com/ws";

export interface UseLiveApiOptions {
  model?: GeminiModel;
  voice?: GeminiVoice;
}

export function useLiveApi(options: UseLiveApiOptions = {}): UseLiveApiReturn {
  const [state, setState] = useState<ConnectionState>("idle");
  const [error, setError] = useState<ErrorKind | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [volume, setVolume] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const connectingRef = useRef(false); // レースコンディション防止
  const errorRef = useRef(false);
  const recorderRef = useRef<AudioRecorder | null>(null);
  const streamerRef = useRef<AudioStreamer | null>(null);

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
        return [
          ...prev.slice(0, -1),
          { ...last, text: last.text + text },
        ];
      }
      return [
        ...prev,
        { role, text, timestamp: Date.now(), streaming: true },
      ];
    });
  }, []);

  /** 指定ロールのストリーミングを確定 */
  const finalizeStreaming = useCallback((role: "user" | "assistant") => {
    setTranscript((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === role && last.streaming) {
        return [
          ...prev.slice(0, -1),
          { ...last, streaming: false },
        ];
      }
      return prev;
    });
  }, []);

  /** マイク音声データを WebSocket 経由で送信 */
  const sendAudio = useCallback((base64: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({
      realtimeInput: {
        mediaChunks: [{
          mimeType: "audio/pcm;rate=16000",
          data: base64,
        }],
      },
    }));
  }, []);

  const connect = useCallback(async () => {
    // 既存接続 or 接続処理中ならブロック（レースコンディション防止）
    if (wsRef.current || connectingRef.current) return;
    connectingRef.current = true;

    setState("connecting");
    setError(null);
    errorRef.current = false;

    let apiKey: string;
    try {
      apiKey = await invoke<string>("get_api_key");
    } catch (e) {
      console.error("get_api_key failed:", e);
      connectingRef.current = false;
      setState("error");
      setError("connection_failed");
      return;
    }

    if (!apiKey) {
      console.error("API key is empty");
      connectingRef.current = false;
      setState("error");
      setError("connection_failed");
      return;
    }

    // 音声再生用 AudioContext + AudioStreamer を準備
    let audioStreamer: AudioStreamer;
    try {
      const playbackCtx = await getAudioContext({ id: "playback", sampleRate: 24000 });
      audioStreamer = new AudioStreamer(playbackCtx, 24000);
      // 再生側の VU メーター
      await audioStreamer.addWorklet(
        "output-vu-meter",
        VolMeterWorklet,
        () => {},
      );
      streamerRef.current = audioStreamer;
    } catch (e) {
      console.error("AudioStreamer init failed:", e);
      connectingRef.current = false;
      setState("error");
      setError("unknown");
      return;
    }

    // ブリーフィング・システムプロンプトの読み込み（失敗しても続行）
    let systemInstruction = "";
    try {
      const [briefingJson, systemPrompt] = await Promise.allSettled([
        invoke<string>("read_briefing"),
        invoke<string>("read_system_prompt"),
      ]);
      const briefingText = briefingJson.status === "fulfilled" ? briefingJson.value : null;
      const promptText = systemPrompt.status === "fulfilled" ? systemPrompt.value : undefined;

      if (briefingText) {
        const briefing = parseBriefing(JSON.parse(briefingText));
        if (briefing) {
          systemInstruction = buildSystemInstruction(briefing, promptText);
          console.log("System instruction loaded:", systemInstruction.length, "chars");
        }
      } else if (promptText) {
        systemInstruction = promptText;
        console.log("System prompt loaded (no briefing):", systemInstruction.length, "chars");
      }
    } catch (e) {
      console.warn("Briefing/prompt load failed (continuing without):", e);
    }

    const model = options.model ?? "gemini-2.5-flash-native-audio-latest";
    const voice = options.voice ?? "Puck";
    const wsUrl = `${GEMINI_WS_BASE}/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;

    console.log("WebSocket connecting to:", wsUrl.replace(apiKey, "***"));

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("WebSocket opened");
      const setup: Record<string, unknown> = {
        model: `models/${model}`,
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: voice,
              },
            },
          },
        },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
      };

      // System Instructions がある場合は注入
      if (systemInstruction) {
        setup.systemInstruction = {
          parts: [{ text: systemInstruction }],
        };
      }

      ws.send(JSON.stringify({ setup }));
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

        // セットアップ完了 → マイク録音開始
        if (data.setupComplete) {
          console.log("Setup complete, starting recorder");
          setState("connected");

          // マイク録音を開始
          try {
            const recorder = new AudioRecorder(
              {
                onData: sendAudio,
                onVolume: setVolume,
              },
              16000,
            );
            await recorder.start();
            recorderRef.current = recorder;
            await audioStreamer.resume();
          } catch (e) {
            console.error("Recorder start failed:", e);
            setState("error");
            setError("mic_error");
          }
          return;
        }

        // ユーザー音声のトランスクリプション
        if (data.serverContent?.inputTranscription?.text) {
          updateStreaming("user", data.serverContent.inputTranscription.text);
        }

        // 音声データ受信 → 再生（アシスタント応答開始 = ユーザー発話終了）
        if (data.serverContent?.modelTurn?.parts) {
          finalizeStreaming("user");
          for (const part of data.serverContent.modelTurn.parts) {
            if (part.inlineData?.data) {
              const pcm16 = new Uint8Array(base64ToArrayBuffer(part.inlineData.data));
              audioStreamer.addPCM16(pcm16);
            }
          }
        }

        // 音声出力のトランスクリプション
        if (data.serverContent?.outputTranscription?.text) {
          finalizeStreaming("user");
          updateStreaming("assistant", data.serverContent.outputTranscription.text);
        }

        // ターン完了
        if (data.serverContent?.turnComplete) {
          console.log("Turn complete");
          finalizeStreaming("user");
          finalizeStreaming("assistant");
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
      // ソケットを確実に閉じる（onclose が呼ばれてクリーンアップされる）
      ws.close();
    };

    ws.onclose = (ev) => {
      console.log("WebSocket closed:", ev.code, ev.reason);
      // 録音・再生を停止
      recorderRef.current?.stop();
      recorderRef.current = null;
      streamerRef.current?.stop();
      streamerRef.current = null;
      setVolume(0);

      if (ev.code !== 1000 && ev.code !== 1005 && !errorRef.current) {
        errorRef.current = true;
        setState("error");
        setError("connection_failed");
      } else if (!errorRef.current) {
        setState("idle");
      }
      wsRef.current = null;
      connectingRef.current = false;
    };
  }, [sendAudio, updateStreaming, finalizeStreaming, options.model, options.voice]);

  const disconnect = useCallback(() => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    streamerRef.current?.stop();
    streamerRef.current = null;
    setVolume(0);

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    connectingRef.current = false;
    setState("idle");
    setError(null);
    // Gemini はセッション間で記憶を持たないため、切断時にトランスクリプトをクリア
    setTranscript([]);
  }, []);

  const toggleMute = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder) return;

    if (state === "muted") {
      // ミュート解除: 録音再開
      recorder.start().then(() => setState("connected"));
    } else if (state === "connected") {
      // ミュート: 録音停止
      recorder.stop();
      setVolume(0);
      setState("muted");
    }
  }, [state]);

  const sendText = useCallback(
    (text: string) => {
      if (!wsRef.current || (state !== "connected" && state !== "muted")) return;

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

  // アンマウント時に接続を自動切断（リーク防止）
  useEffect(() => {
    return () => {
      recorderRef.current?.stop();
      recorderRef.current = null;
      streamerRef.current?.stop();
      streamerRef.current = null;
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      connectingRef.current = false;
    };
  }, []);

  return { state, error, transcript, volume, connect, disconnect, sendText, toggleMute };
}
