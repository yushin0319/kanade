import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLiveApi } from "../../hooks/use-live-api";

// Tauri invoke をモック
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

// WebSocket モック
class MockWebSocket {
  static instances: MockWebSocket[] = [];
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
});

describe("useLiveApi", () => {
  it("初期状態は idle", () => {
    const { result } = renderHook(() => useLiveApi());
    expect(result.current.state).toBe("idle");
    expect(result.current.error).toBeNull();
    expect(result.current.transcript).toEqual([]);
  });

  it("connect() で connecting → connected に遷移する", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    vi.mocked(invoke).mockResolvedValue("test-api-key");

    const { result } = renderHook(() => useLiveApi());

    // connect 呼び出し
    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.state).toBe("connecting");

    // WebSocket onopen → setup メッセージ送信
    const ws = MockWebSocket.instances[0]!;
    act(() => {
      ws.onopen?.();
    });

    // setup メッセージが送信されたことを確認
    expect(ws.sent.length).toBe(1);
    const setupMsg = JSON.parse(ws.sent[0]!);
    expect(setupMsg.setup.model).toContain("gemini");

    // setupComplete レスポンスで connected に遷移
    act(() => {
      ws.onmessage?.({ data: JSON.stringify({ setupComplete: true }) });
    });

    expect(result.current.state).toBe("connected");
  });

  it("disconnect() で idle に戻る", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    vi.mocked(invoke).mockResolvedValue("test-api-key");

    const { result } = renderHook(() => useLiveApi());

    await act(async () => {
      await result.current.connect();
    });

    const ws = MockWebSocket.instances[0]!;
    act(() => {
      ws.onopen?.();
      ws.onmessage?.({ data: JSON.stringify({ setupComplete: true }) });
    });

    expect(result.current.state).toBe("connected");

    act(() => {
      result.current.disconnect();
    });

    expect(result.current.state).toBe("idle");
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
      ws.onmessage?.({ data: JSON.stringify({ setupComplete: true }) });
    });

    act(() => {
      result.current.sendText("こんにちは");
    });

    expect(result.current.transcript).toHaveLength(1);
    expect(result.current.transcript[0]!.role).toBe("user");
    expect(result.current.transcript[0]!.text).toBe("こんにちは");

    // WebSocket にメッセージが送信されたことを確認
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
      ws.onmessage?.({ data: JSON.stringify({ setupComplete: true }) });
    });

    // トランスクリプションチャンク1
    act(() => {
      ws.onmessage?.({
        data: JSON.stringify({
          serverContent: {
            outputTranscription: { text: "こんに" },
          },
        }),
      });
    });

    expect(result.current.transcript).toHaveLength(1);
    expect(result.current.transcript[0]!.role).toBe("assistant");
    expect(result.current.transcript[0]!.text).toBe("こんに");
    expect(result.current.transcript[0]!.streaming).toBe(true);

    // トランスクリプションチャンク2
    act(() => {
      ws.onmessage?.({
        data: JSON.stringify({
          serverContent: {
            outputTranscription: { text: "ちは！" },
          },
        }),
      });
    });

    // 同じエントリに蓄積される
    expect(result.current.transcript).toHaveLength(1);
    expect(result.current.transcript[0]!.text).toBe("こんにちは！");
    expect(result.current.transcript[0]!.streaming).toBe(true);

    // ターン完了でストリーミング終了
    act(() => {
      ws.onmessage?.({
        data: JSON.stringify({
          serverContent: { turnComplete: true },
        }),
      });
    });

    expect(result.current.transcript[0]!.streaming).toBe(false);
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
