import { beforeEach, describe, expect, it, vi } from 'vitest'
import { injectToCC, notifyCompletion } from '../../lib/cc-notifier'

// Tauri invoke をモック
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

describe('cc-notifier', () => {
  let mockInvoke: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    mockInvoke = vi.mocked(invoke)
    mockInvoke.mockReset()
    mockInvoke.mockResolvedValue(undefined)
  })

  describe('notifyCompletion', () => {
    it('Tauri command で通知を送信する', async () => {
      await notifyCompletion()
      expect(mockInvoke).toHaveBeenCalledWith('notify_summary_saved')
    })

    it('通知エラーは例外をスローする', async () => {
      mockInvoke.mockRejectedValue(new Error('Notification failed'))
      await expect(notifyCompletion()).rejects.toThrow('Notification failed')
    })
  })

  describe('injectToCC', () => {
    it('Tauri command で pyautogui スクリプトを実行する', async () => {
      await injectToCC()
      expect(mockInvoke).toHaveBeenCalledWith('inject_to_cc')
    })

    it('実行エラーは例外をスローする', async () => {
      mockInvoke.mockRejectedValue(new Error('Script failed'))
      await expect(injectToCC()).rejects.toThrow('Script failed')
    })
  })
})
