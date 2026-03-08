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

// 接続済み状態を作るヘルパー
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

describe('WSパースエラー閾値', () => {
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
        new Promise((resolve) => setTimeout(() => resolve('test-api-key'), 50)),
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
