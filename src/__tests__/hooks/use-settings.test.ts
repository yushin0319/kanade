import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSettings } from '../../hooks/use-settings'
import { DEFAULT_SETTINGS } from '../../types/settings'

// vi.hoisted で先頭宣言（vi.mock ファクトリ内から参照可能）
const { mockGet, mockSet, mockSave } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockSet: vi.fn(),
  mockSave: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-store', () => ({
  load: vi.fn().mockResolvedValue({
    get: mockGet,
    set: mockSet,
    save: mockSave,
  }),
}))

describe('useSettings', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockSet.mockReset()
    mockSave.mockReset().mockResolvedValue(undefined)
  })

  it('初期状態は DEFAULT_SETTINGS', () => {
    const { result } = renderHook(() => useSettings())
    expect(result.current.settings).toEqual(DEFAULT_SETTINGS)
    expect(result.current.loaded).toBe(false)
  })

  it('loadSettings でストアから設定を読み込む', async () => {
    mockGet.mockImplementation((key: string) => {
      if (key === 'model') return 'gemini-2.5-flash-native-audio-latest'
      if (key === 'voice') return 'Charon'
      if (key === 'pyautoguiEnabled') return true
      if (key === 'apiKey') return 'test-key'
      return undefined
    })

    const { result } = renderHook(() => useSettings())

    await act(async () => {
      await result.current.loadSettings()
    })

    expect(result.current.settings.voice).toBe('Charon')
    expect(result.current.settings.pyautoguiEnabled).toBe(true)
    expect(result.current.loaded).toBe(true)
  })

  it('ストアに値がない場合はデフォルト値を使用', async () => {
    mockGet.mockResolvedValue(undefined)

    const { result } = renderHook(() => useSettings())

    await act(async () => {
      await result.current.loadSettings()
    })

    expect(result.current.settings).toEqual(DEFAULT_SETTINGS)
  })

  it('updateSetting で個別の設定を更新・保存する', async () => {
    mockGet.mockResolvedValue(undefined)

    const { result } = renderHook(() => useSettings())

    await act(async () => {
      await result.current.loadSettings()
    })

    await act(async () => {
      await result.current.updateSetting('voice', 'Kore')
    })

    expect(result.current.settings.voice).toBe('Kore')
    expect(mockSet).toHaveBeenCalledWith('voice', 'Kore')
    expect(mockSave).toHaveBeenCalled()
  })
})
