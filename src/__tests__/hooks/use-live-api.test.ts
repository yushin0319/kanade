import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLiveApi } from "../../hooks/use-live-api";

// Tauri invoke をモック
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

// vi.hoisted でモック先頭宣言（vi.mock ファクトリ内から参照可能）
const { mockRecorderInstance, mockStreamerInstance } = vi.hoisted(() => {
  const mockRecorderInstance = {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
    recording: false,
  };
  const mockStreamerInstance = {
    addWorklet: vi.fn().mockResolvedValue(undefined),
    addPCM16: vi.fn(),
    resume: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
    onComplete: vi.fn(),
  };
  return { mockRecorderInstance, mockStreamerInstance };
});

vi.mock("../../lib/audio-context", () => ({
  getAudioContext: vi.fn().mockResolvedValue({
    state: "running",
    resume: vi.fn().mockResolvedValue(undefined),
    destination: {},
    createGain: vi.fn(() => ({
      connect: vi.fn(),
      gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
      disconnect: vi.fn(),
    })),
    audioWorklet: { addModule: vi.fn().mockResolvedValue(undefined) },
    currentTime: 0,
  }),
}));

vi.mock("../../lib/audio-recorder", () => {
  return {
    AudioRecorder: class {
      constructor() {
        return mockRecorderInstance;
      }
    },
  };
});

vi.mock("../../lib/audio-streamer", () => {
  return {
    AudioStreamer: class {
      constructor() {
        return mockStreamerInstance;
      }
    },
  };
});

// WebSocket モック
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static readonly OPEN = 1;
  readonly OPEN = 1;
  readyState = 1;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((event?: unknown) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  sent: string[] = [];

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.onclose?.({ code: 1000, reason: "" });
  }
}

beforeEach(() => {
  MockWebSocket.instances = [];
  vi.stubGlobal("WebSocket", MockWebSocket);
  mockRecorderInstance.start.mockClear();
  mockRecorderInstance.stop.mockClear();
  mockStreamerInstance.addWorklet.mockClear();
  mockStreamerInstance.addPCM16.mockClear();
  mockStreamerInstance.resume.mockClear();
  mockStreamerInstance.stop.mockClear();
});

describe("useLiveApi", () => {
  it("初期状態は idle", () => {
    const { result } = renderHook(() => useLiveApi());
    expect(result.current.state).toBe("idle");
    expect(result.current.error).toBeNull();
    expect(result.current.transcript).toEqual([]);
    expect(result.current.volume).toBe(0);
  });

  it("connect() で connecting → connected に遷移する", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    vi.mocked(invoke).mockResolvedValue("test-api-key");

    const { result } = renderHook(() => useLiveApi());

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.state).toBe("connecting");

    const ws = MockWebSocket.instances[0]!;
    act(() => {
      ws.onopen?.();
    });

    expect(ws.sent.length).toBe(1);
    const setupMsg = JSON.parse(ws.sent[0]!);
    expect(setupMsg.setup.model).toContain("gemini");
    expect(setupMsg.setup.generationConfig.responseModalities).toContain("AUDIO");
    expect(setupMsg.setup.inputAudioTranscription).toEqual({});
    expect(setupMsg.setup.outputAudioTranscription).toEqual({});

    // setupComplete → connected + マイク録音開始
    await act(async () => {
      ws.onmessage?.({ data: JSON.stringify({ setupComplete: true }) });
    });

    expect(result.current.state).toBe("connected");
    expect(mockRecorderInstance.start).toHaveBeenCalled();
    expect(mockStreamerInstance.resume).toHaveBeenCalled();
  });

  it("disconnect() で idle に戻り、録音・再生が停止する", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    vi.mocked(invoke).mockResolvedValue("test-api-key");

    const { result } = renderHook(() => useLiveApi());

    await act(async () => {
      await result.current.connect();
    });

    const ws = MockWebSocket.instances[0]!;
    act(() => {
      ws.onopen?.();
    });
    await act(async () => {
      ws.onmessage?.({ data: JSON.stringify({ setupComplete: true }) });
    });

    act(() => {
      result.current.disconnect();
    });

    expect(result.current.state).toBe("idle");
    expect(mockRecorderInstance.stop).toHaveBeenCalled();
    expect(mockStreamerInstance.stop).toHaveBeenCalled();
  });

  it("sendText() でユーザーメッセージが transcript に追加される", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    vi.mocked(invoke).mockResolvedValue("test-api-key");

    const { result } = renderHook(() => useLiveApi());

    await act(async () => {
      await result.current.connect();
    });

    const ws = MockWebSocket.instances[0]!;
    act(() => {
      ws.onopen?.();
    });
    await act(async () => {
      ws.onmessage?.({ data: JSON.stringify({ setupComplete: true }) });
    });

    act(() => {
      result.current.sendText("こんにちは");
    });

    expect(result.current.transcript).toHaveLength(1);
    expect(result.current.transcript[0]!.role).toBe("user");
    expect(result.current.transcript[0]!.text).toBe("こんにちは");

    const lastSent = JSON.parse(ws.sent[ws.sent.length - 1]!);
    expect(lastSent.clientContent.turns[0].parts[0].text).toBe("こんにちは");
  });

  it("outputTranscription でアシスタント応答がストリーミング表示される", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    vi.mocked(invoke).mockResolvedValue("test-api-key");

    const { result } = renderHook(() => useLiveApi());

    await act(async () => {
      await result.current.connect();
    });

    const ws = MockWebSocket.instances[0]!;
    act(() => {
      ws.onopen?.();
    });
    await act(async () => {
      ws.onmessage?.({ data: JSON.stringify({ setupComplete: true }) });
    });

    // チャンク1
    act(() => {
      ws.onmessage?.({
        data: JSON.stringify({
          serverContent: { outputTranscription: { text: "こんに" } },
        }),
      });
    });

    expect(result.current.transcript).toHaveLength(1);
    expect(result.current.transcript[0]!.text).toBe("こんに");
    expect(result.current.transcript[0]!.streaming).toBe(true);

    // チャンク2（蓄積）
    act(() => {
      ws.onmessage?.({
        data: JSON.stringify({
          serverContent: { outputTranscription: { text: "ちは！" } },
        }),
      });
    });

    expect(result.current.transcript).toHaveLength(1);
    expect(result.current.transcript[0]!.text).toBe("こんにちは！");

    // ターン完了
    act(() => {
      ws.onmessage?.({
        data: JSON.stringify({ serverContent: { turnComplete: true } }),
      });
    });

    expect(result.current.transcript[0]!.streaming).toBe(false);
  });

  it("inputTranscription でユーザー音声がストリーミング表示される", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    vi.mocked(invoke).mockResolvedValue("test-api-key");

    const { result } = renderHook(() => useLiveApi());

    await act(async () => {
      await result.current.connect();
    });

    const ws = MockWebSocket.instances[0]!;
    act(() => {
      ws.onopen?.();
    });
    await act(async () => {
      ws.onmessage?.({ data: JSON.stringify({ setupComplete: true }) });
    });

    // ユーザー音声チャンク
    act(() => {
      ws.onmessage?.({
        data: JSON.stringify({
          serverContent: { inputTranscription: { text: "おはよう" } },
        }),
      });
    });

    expect(result.current.transcript).toHaveLength(1);
    expect(result.current.transcript[0]!.role).toBe("user");
    expect(result.current.transcript[0]!.text).toBe("おはよう");
    expect(result.current.transcript[0]!.streaming).toBe(true);

    // アシスタント応答開始でユーザー発話が確定される
    act(() => {
      ws.onmessage?.({
        data: JSON.stringify({
          serverContent: { outputTranscription: { text: "おはよう！" } },
        }),
      });
    });

    // ユーザー発話が確定（streaming: false）、アシスタント応答が開始
    expect(result.current.transcript).toHaveLength(2);
    expect(result.current.transcript[0]!.role).toBe("user");
    expect(result.current.transcript[0]!.streaming).toBe(false);
    expect(result.current.transcript[1]!.role).toBe("assistant");
    expect(result.current.transcript[1]!.streaming).toBe(true);
  });

  it("WebSocket エラーで error 状態になる", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    vi.mocked(invoke).mockResolvedValue("test-api-key");

    const { result } = renderHook(() => useLiveApi());

    await act(async () => {
      await result.current.connect();
    });

    const ws = MockWebSocket.instances[0]!;
    act(() => {
      ws.onerror?.();
    });

    expect(result.current.state).toBe("error");
    expect(result.current.error).toBe("connection_failed");
  });

  it("API Key 未設定で connect() すると error になる", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    vi.mocked(invoke).mockRejectedValue(new Error("apiKey not set"));

    const { result } = renderHook(() => useLiveApi());

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.state).toBe("error");
    expect(result.current.error).toBe("connection_failed");
  });
});
