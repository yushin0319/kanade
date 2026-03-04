import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useLiveApi } from '../../hooks/use-live-api'

// Tauri invoke をモック
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

// vi.hoisted でモック先頭宣言（vi.mock ファクトリ内から参照可能）
const { mockRecorderInstance, mockStreamerInstance } = vi.hoisted(() => {
  const mockRecorderInstance = {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
    recording: false,
  }
  const mockStreamerInstance = {
    addWorklet: vi.fn().mockResolvedValue(undefined),
    addPCM16: vi.fn(),
    resume: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
    onComplete: vi.fn(),
  }
  return { mockRecorderInstance, mockStreamerInstance }
})

vi.mock('../../lib/audio-context', () => ({
  getAudioContext: vi.fn().mockResolvedValue({
    state: 'running',
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
}))

vi.mock('../../lib/audio-recorder', () => {
  return {
    AudioRecorder: class {
      constructor() {
        return mockRecorderInstance
      }
    },
  }
})

vi.mock('../../lib/audio-streamer', () => {
  return {
    AudioStreamer: class {
      constructor() {
        return mockStreamerInstance
      }
    },
  }
})

// WebSocket モック
class MockWebSocket {
  static instances: MockWebSocket[] = []
  static readonly OPEN = 1
  readonly OPEN = 1
  readyState = 1
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onerror: ((event?: unknown) => void) | null = null
  onclose: ((event: { code: number; reason: string }) => void) | null = null
  sent: string[] = []

  constructor(public url: string) {
    MockWebSocket.instances.push(this)
  }

  send(data: string) {
    this.sent.push(data)
  }

  close() {
    this.onclose?.({ code: 1000, reason: '' })
  }
}

beforeEach(() => {
  MockWebSocket.instances = []
  vi.stubGlobal('WebSocket', MockWebSocket)
  mockRecorderInstance.start.mockClear()
  mockRecorderInstance.stop.mockClear()
  mockStreamerInstance.addWorklet.mockClear()
  mockStreamerInstance.addPCM16.mockClear()
  mockStreamerInstance.resume.mockClear()
  mockStreamerInstance.stop.mockClear()
})

describe('useLiveApi', () => {
  it('初期状態は idle', () => {
    const { result } = renderHook(() => useLiveApi())
    expect(result.current.state).toBe('idle')
    expect(result.current.error).toBeNull()
    expect(result.current.transcript).toEqual([])
    expect(result.current.volume).toBe(0)
  })

  it('connect() で connecting → connected に遷移する', async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    vi.mocked(invoke).mockResolvedValue('test-api-key')

    const { result } = renderHook(() => useLiveApi())

    await act(async () => {
      await result.current.connect()
    })

    expect(result.current.state).toBe('connecting')

    const ws = MockWebSocket.instances[0]!
    act(() => {
      ws.onopen?.()
    })

    expect(ws.sent.length).toBe(1)
    const setupMsg = JSON.parse(ws.sent[0]!)
    expect(setupMsg.setup.model).toContain('gemini')
    expect(setupMsg.setup.generationConfig.responseModalities).toContain(
      'AUDIO',
    )
    expect(setupMsg.setup.inputAudioTranscription).toEqual({})
    expect(setupMsg.setup.outputAudioTranscription).toEqual({})

    // setupComplete → connected + マイク録音開始
    await act(async () => {
      ws.onmessage?.({ data: JSON.stringify({ setupComplete: true }) })
    })

    expect(result.current.state).toBe('connected')
    expect(mockRecorderInstance.start).toHaveBeenCalled()
    expect(mockStreamerInstance.resume).toHaveBeenCalled()
  })

  it('disconnect() で idle に戻り、録音・再生が停止する', async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    vi.mocked(invoke).mockResolvedValue('test-api-key')

    const { result } = renderHook(() => useLiveApi())

    await act(async () => {
      await result.current.connect()
    })

    const ws = MockWebSocket.instances[0]!
    act(() => {
      ws.onopen?.()
    })
    await act(async () => {
      ws.onmessage?.({ data: JSON.stringify({ setupComplete: true }) })
    })

    act(() => {
      result.current.disconnect()
    })

    expect(result.current.state).toBe('idle')
    expect(mockRecorderInstance.stop).toHaveBeenCalled()
    expect(mockStreamerInstance.stop).toHaveBeenCalled()
  })

  it('sendText() でユーザーメッセージが transcript に追加される', async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    vi.mocked(invoke).mockResolvedValue('test-api-key')

    const { result } = renderHook(() => useLiveApi())

    await act(async () => {
      await result.current.connect()
    })

    const ws = MockWebSocket.instances[0]!
    act(() => {
      ws.onopen?.()
    })
    await act(async () => {
      ws.onmessage?.({ data: JSON.stringify({ setupComplete: true }) })
    })

    act(() => {
      result.current.sendText('こんにちは')
    })

    expect(result.current.transcript).toHaveLength(1)
    expect(result.current.transcript[0]!.role).toBe('user')
    expect(result.current.transcript[0]!.text).toBe('こんにちは')

    const lastSent = JSON.parse(ws.sent[ws.sent.length - 1]!)
    expect(lastSent.clientContent.turns[0].parts[0].text).toBe('こんにちは')
  })

  it('outputTranscription でアシスタント応答がストリーミング表示される', async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    vi.mocked(invoke).mockResolvedValue('test-api-key')

    const { result } = renderHook(() => useLiveApi())

    await act(async () => {
      await result.current.connect()
    })

    const ws = MockWebSocket.instances[0]!
    act(() => {
      ws.onopen?.()
    })
    await act(async () => {
      ws.onmessage?.({ data: JSON.stringify({ setupComplete: true }) })
    })

    // チャンク1
    act(() => {
      ws.onmessage?.({
        data: JSON.stringify({
          serverContent: { outputTranscription: { text: 'こんに' } },
        }),
      })
    })

    expect(result.current.transcript).toHaveLength(1)
    expect(result.current.transcript[0]!.text).toBe('こんに')
    expect(result.current.transcript[0]!.streaming).toBe(true)

    // チャンク2（蓄積）
    act(() => {
      ws.onmessage?.({
        data: JSON.stringify({
          serverContent: { outputTranscription: { text: 'ちは！' } },
        }),
      })
    })

    expect(result.current.transcript).toHaveLength(1)
    expect(result.current.transcript[0]!.text).toBe('こんにちは！')

    // ターン完了
    act(() => {
      ws.onmessage?.({
        data: JSON.stringify({ serverContent: { turnComplete: true } }),
      })
    })

    expect(result.current.transcript[0]!.streaming).toBe(false)
  })

  it('inputTranscription でユーザー音声がストリーミング表示される', async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    vi.mocked(invoke).mockResolvedValue('test-api-key')

    const { result } = renderHook(() => useLiveApi())

    await act(async () => {
      await result.current.connect()
    })

    const ws = MockWebSocket.instances[0]!
    act(() => {
      ws.onopen?.()
    })
    await act(async () => {
      ws.onmessage?.({ data: JSON.stringify({ setupComplete: true }) })
    })

    // ユーザー音声チャンク
    act(() => {
      ws.onmessage?.({
        data: JSON.stringify({
          serverContent: { inputTranscription: { text: 'おはよう' } },
        }),
      })
    })

    expect(result.current.transcript).toHaveLength(1)
    expect(result.current.transcript[0]!.role).toBe('user')
    expect(result.current.transcript[0]!.text).toBe('おはよう')
    expect(result.current.transcript[0]!.streaming).toBe(true)

    // アシスタント応答開始でユーザー発話が確定される
    act(() => {
      ws.onmessage?.({
        data: JSON.stringify({
          serverContent: { outputTranscription: { text: 'おはよう！' } },
        }),
      })
    })

    // ユーザー発話が確定（streaming: false）、アシスタント応答が開始
    expect(result.current.transcript).toHaveLength(2)
    expect(result.current.transcript[0]!.role).toBe('user')
    expect(result.current.transcript[0]!.streaming).toBe(false)
    expect(result.current.transcript[1]!.role).toBe('assistant')
    expect(result.current.transcript[1]!.streaming).toBe(true)
  })

  it('WebSocket エラーで error 状態になる', async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    vi.mocked(invoke).mockResolvedValue('test-api-key')

    const { result } = renderHook(() => useLiveApi())

    await act(async () => {
      await result.current.connect()
    })

    const ws = MockWebSocket.instances[0]!
    act(() => {
      ws.onerror?.()
    })

    expect(result.current.state).toBe('error')
    expect(result.current.error).toBe('connection_failed')
  })

  describe('WSパースエラー閾値', () => {
    async function setupConnected() {
      const { invoke } = await import('@tauri-apps/api/core')
      vi.mocked(invoke).mockResolvedValue('test-api-key')

      const { result } = renderHook(() => useLiveApi())
      await act(async () => {
        await result.current.connect()
      })
      const ws = MockWebSocket.instances[0]!
      act(() => {
        ws.onopen?.()
      })
      await act(async () => {
        ws.onmessage?.({ data: JSON.stringify({ setupComplete: true }) })
      })
      return { result, ws }
    }

    it('連続WSパースエラーが5回に達するとerror状態になる', async () => {
      const { result, ws } = await setupConnected()

      for (let i = 0; i < 5; i++) {
        act(() => {
          ws.onmessage?.({ data: 'invalid-json-{{{{' })
        })
      }

      expect(result.current.state).toBe('error')
      expect(result.current.error).toBe('unknown')
    })

    it('連続WSパースエラーが4回ではerror状態にならない', async () => {
      const { result, ws } = await setupConnected()

      for (let i = 0; i < 4; i++) {
        act(() => {
          ws.onmessage?.({ data: 'invalid-json-{{{{' })
        })
      }

      expect(result.current.state).toBe('connected')
      expect(result.current.error).toBeNull()
    })
  })

  it('API Key 未設定で connect() すると error になる', async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    vi.mocked(invoke).mockRejectedValue(new Error('apiKey not set'))

    const { result } = renderHook(() => useLiveApi())

    await act(async () => {
      await result.current.connect()
    })

    expect(result.current.state).toBe('error')
    expect(result.current.error).toBe('connection_failed')
  })

  describe('接続安全性', () => {
    it('connect() を連続呼び出ししても WebSocket は1本だけ', async () => {
      const { invoke } = await import('@tauri-apps/api/core')
      vi.mocked(invoke).mockResolvedValue('test-api-key')

      const { result } = renderHook(() => useLiveApi())

      // 2回同時に呼び出し
      await act(async () => {
        const p1 = result.current.connect()
        const p2 = result.current.connect()
        await Promise.all([p1, p2])
      })

      // WebSocket は1本だけ作られるべき
      expect(MockWebSocket.instances.length).toBe(1)
    })

    it('connect() 中に再度 connect() してもブロックされる', async () => {
      const { invoke } = await import('@tauri-apps/api/core')
      // get_api_key を遅延させてレースコンディションの窓を広げる
      vi.mocked(invoke).mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve('test-api-key'), 50),
          ),
      )

      const { result } = renderHook(() => useLiveApi())

      await act(async () => {
        const p1 = result.current.connect()
        // 少し遅らせて2回目を呼ぶ（1回目はまだ await 中）
        await new Promise((r) => setTimeout(r, 10))
        const p2 = result.current.connect()
        await Promise.all([p1, p2])
      })

      expect(MockWebSocket.instances.length).toBe(1)
    })

    it('アンマウント時に WebSocket が自動切断される', async () => {
      const { invoke } = await import('@tauri-apps/api/core')
      vi.mocked(invoke).mockResolvedValue('test-api-key')

      const { result, unmount } = renderHook(() => useLiveApi())

      await act(async () => {
        await result.current.connect()
      })

      const ws = MockWebSocket.instances[0]!
      act(() => {
        ws.onopen?.()
      })
      await act(async () => {
        ws.onmessage?.({ data: JSON.stringify({ setupComplete: true }) })
      })

      expect(MockWebSocket.instances.length).toBe(1)

      // アンマウント → WebSocket が閉じられるべき
      const closeSpy = vi.spyOn(ws, 'close')
      act(() => {
        unmount()
      })

      expect(closeSpy).toHaveBeenCalled()
      expect(mockRecorderInstance.stop).toHaveBeenCalled()
      expect(mockStreamerInstance.stop).toHaveBeenCalled()
    })

    it('onerror 発生時にソケットが確実に close される', async () => {
      const { invoke } = await import('@tauri-apps/api/core')
      vi.mocked(invoke).mockResolvedValue('test-api-key')

      const { result } = renderHook(() => useLiveApi())

      await act(async () => {
        await result.current.connect()
      })

      const ws = MockWebSocket.instances[0]!
      const closeSpy = vi.spyOn(ws, 'close')

      act(() => {
        ws.onerror?.()
      })

      expect(closeSpy).toHaveBeenCalled()
      expect(result.current.state).toBe('error')
    })
  })
})
