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

/** connected 状態にするヘルパー */
async function setupConnected() {
  const { invoke } = await import('@tauri-apps/api/core')
  vi.mocked(invoke).mockResolvedValue('test-api-key')

  const hook = renderHook(() => useLiveApi())

  await act(async () => {
    await hook.result.current.connect()
  })

  const ws = MockWebSocket.instances[0]!
  act(() => {
    ws.onopen?.()
  })
  await act(async () => {
    ws.onmessage?.({ data: JSON.stringify({ setupComplete: true }) })
  })

  return { hook, ws }
}

describe('useLiveApi - transcript', () => {
  it('sendText() でユーザーメッセージが transcript に追加される', async () => {
    const { hook, ws } = await setupConnected()

    act(() => {
      hook.result.current.sendText('こんにちは')
    })

    expect(hook.result.current.transcript).toHaveLength(1)
    expect(hook.result.current.transcript[0]!.role).toBe('user')
    expect(hook.result.current.transcript[0]!.text).toBe('こんにちは')

    const lastSent = JSON.parse(ws.sent[ws.sent.length - 1]!)
    expect(lastSent.clientContent.turns[0].parts[0].text).toBe('こんにちは')
  })

  it('outputTranscription でアシスタント応答がストリーミング表示される', async () => {
    const { hook, ws } = await setupConnected()

    // チャンク1
    act(() => {
      ws.onmessage?.({
        data: JSON.stringify({
          serverContent: { outputTranscription: { text: 'こんに' } },
        }),
      })
    })

    expect(hook.result.current.transcript).toHaveLength(1)
    expect(hook.result.current.transcript[0]!.text).toBe('こんに')
    expect(hook.result.current.transcript[0]!.streaming).toBe(true)

    // チャンク2（蓄積）
    act(() => {
      ws.onmessage?.({
        data: JSON.stringify({
          serverContent: { outputTranscription: { text: 'ちは！' } },
        }),
      })
    })

    expect(hook.result.current.transcript).toHaveLength(1)
    expect(hook.result.current.transcript[0]!.text).toBe('こんにちは！')

    // ターン完了
    act(() => {
      ws.onmessage?.({
        data: JSON.stringify({ serverContent: { turnComplete: true } }),
      })
    })

    expect(hook.result.current.transcript[0]!.streaming).toBe(false)
  })

  it('inputTranscription でユーザー音声がストリーミング表示される', async () => {
    const { hook, ws } = await setupConnected()

    // ユーザー音声チャンク
    act(() => {
      ws.onmessage?.({
        data: JSON.stringify({
          serverContent: { inputTranscription: { text: 'おはよう' } },
        }),
      })
    })

    expect(hook.result.current.transcript).toHaveLength(1)
    expect(hook.result.current.transcript[0]!.role).toBe('user')
    expect(hook.result.current.transcript[0]!.text).toBe('おはよう')
    expect(hook.result.current.transcript[0]!.streaming).toBe(true)

    // アシスタント応答開始でユーザー発話が確定される
    act(() => {
      ws.onmessage?.({
        data: JSON.stringify({
          serverContent: { outputTranscription: { text: 'おはよう！' } },
        }),
      })
    })

    // ユーザー発話が確定（streaming: false）、アシスタント応答が開始
    expect(hook.result.current.transcript).toHaveLength(2)
    expect(hook.result.current.transcript[0]!.role).toBe('user')
    expect(hook.result.current.transcript[0]!.streaming).toBe(false)
    expect(hook.result.current.transcript[1]!.role).toBe('assistant')
    expect(hook.result.current.transcript[1]!.streaming).toBe(true)
  })
})
