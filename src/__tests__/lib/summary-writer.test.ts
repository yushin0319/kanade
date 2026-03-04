import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  formatConversationLog,
  writeConversation,
  writeSummary,
} from '../../lib/summary-writer'
import type { TranscriptEntry } from '../../types'

// Tauri invoke をモック
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

function entry(role: 'user' | 'assistant', text: string): TranscriptEntry {
  return { role, text, timestamp: 1700000000000 }
}

describe('summary-writer', () => {
  let mockInvoke: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    mockInvoke = vi.mocked(invoke)
    mockInvoke.mockReset()
    mockInvoke.mockResolvedValue(undefined)
  })

  describe('formatConversationLog', () => {
    it('会話ログを Markdown 形式にフォーマットする', () => {
      const transcript: TranscriptEntry[] = [
        entry('user', 'こんにちは'),
        entry('assistant', 'こんにちは！お元気ですか？'),
      ]
      const result = formatConversationLog(transcript)
      expect(result).toContain('**ユーザー**: こんにちは')
      expect(result).toContain('**アシスタント**: こんにちは！お元気ですか？')
    })

    it('空の会話ログは空文字列を返す', () => {
      const result = formatConversationLog([])
      expect(result).toBe('')
    })

    it('タイムスタンプを含む', () => {
      const transcript: TranscriptEntry[] = [entry('user', 'テスト')]
      const result = formatConversationLog(transcript)
      // タイムスタンプがフォーマットされて含まれる
      expect(result).toMatch(/\d{2}:\d{2}:\d{2}/)
    })
  })

  describe('writeSummary', () => {
    it('Tauri command でサマリーを書き込む', async () => {
      await writeSummary('テストサマリー')
      expect(mockInvoke).toHaveBeenCalledWith('write_summary', {
        content: 'テストサマリー',
      })
    })

    it('Tauri command エラー時は例外をスローする', async () => {
      mockInvoke.mockRejectedValue(new Error('Write failed'))
      await expect(writeSummary('テスト')).rejects.toThrow('Write failed')
    })
  })

  describe('writeConversation', () => {
    it('Tauri command で会話ログを書き込む', async () => {
      const transcript: TranscriptEntry[] = [
        entry('user', 'テスト'),
        entry('assistant', '応答'),
      ]
      await writeConversation(transcript)
      expect(mockInvoke).toHaveBeenCalledWith('write_conversation', {
        content: expect.stringContaining('テスト'),
      })
      expect(mockInvoke).toHaveBeenCalledWith('write_conversation', {
        content: expect.stringContaining('応答'),
      })
    })

    it('空の会話ログでも書き込みを実行する', async () => {
      await writeConversation([])
      expect(mockInvoke).toHaveBeenCalledWith('write_conversation', {
        content: '',
      })
    })
  })
})
