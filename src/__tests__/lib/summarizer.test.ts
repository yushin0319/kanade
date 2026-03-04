import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  formatTranscriptForSummary,
  MAX_SUMMARY_LENGTH,
  summarize,
} from '../../lib/summarizer'
import type { TranscriptEntry } from '../../types'

// @google/genai をモック
vi.mock('@google/genai', () => {
  const generateContent = vi.fn()
  return {
    GoogleGenAI: class {
      models = { generateContent }
    },
    __mockGenerateContent: generateContent,
  }
})

function entry(role: 'user' | 'assistant', text: string): TranscriptEntry {
  return { role, text, timestamp: Date.now() }
}

describe('summarizer', () => {
  describe('formatTranscriptForSummary', () => {
    it('会話ログをテキスト形式にフォーマットする', () => {
      const transcript: TranscriptEntry[] = [
        entry('user', '今日の予定を教えて'),
        entry('assistant', '今日は会議が2つあります'),
      ]
      const result = formatTranscriptForSummary(transcript)
      expect(result).toContain('ユーザー: 今日の予定を教えて')
      expect(result).toContain('アシスタント: 今日は会議が2つあります')
    })

    it('空の会話ログは空文字列を返す', () => {
      const result = formatTranscriptForSummary([])
      expect(result).toBe('')
    })

    it('streaming エントリも含める', () => {
      const transcript: TranscriptEntry[] = [
        {
          role: 'user',
          text: 'テスト',
          timestamp: Date.now(),
          streaming: true,
        },
      ]
      const result = formatTranscriptForSummary(transcript)
      expect(result).toContain('ユーザー: テスト')
    })

    it('複数エントリを改行で区切る', () => {
      const transcript: TranscriptEntry[] = [
        entry('user', 'A'),
        entry('assistant', 'B'),
        entry('user', 'C'),
      ]
      const result = formatTranscriptForSummary(transcript)
      const lines = result.split('\n')
      expect(lines).toHaveLength(3)
    })
  })

  describe('summarize', () => {
    let mockGenerateContent: ReturnType<typeof vi.fn>

    beforeEach(async () => {
      const mod = await import('@google/genai')
      mockGenerateContent = (
        mod as unknown as { __mockGenerateContent: ReturnType<typeof vi.fn> }
      ).__mockGenerateContent
      mockGenerateContent.mockReset()
    })

    it('Gemini API を呼び出してサマリーを返す', async () => {
      mockGenerateContent.mockResolvedValue({
        text: '会議の予定について確認した会話です。',
      })

      const transcript: TranscriptEntry[] = [
        entry('user', '今日の会議は？'),
        entry('assistant', '14時から定例会議があります'),
      ]

      const result = await summarize(transcript, 'test-api-key')
      expect(result).toBe('会議の予定について確認した会話です。')
      expect(mockGenerateContent).toHaveBeenCalledOnce()
    })

    it('空の会話ログは要約せず空文字を返す', async () => {
      const result = await summarize([], 'test-api-key')
      expect(result).toBe('')
      expect(mockGenerateContent).not.toHaveBeenCalled()
    })

    it('要約が最大長を超える場合は切り詰める', async () => {
      const longSummary = 'あ'.repeat(MAX_SUMMARY_LENGTH + 500)
      mockGenerateContent.mockResolvedValue({ text: longSummary })

      const transcript: TranscriptEntry[] = [
        entry('user', 'テスト'),
        entry('assistant', 'テスト応答'),
      ]

      const result = await summarize(transcript, 'test-api-key')
      expect(result.length).toBeLessThanOrEqual(MAX_SUMMARY_LENGTH)
    })

    it('API エラー時は例外をスローする', async () => {
      mockGenerateContent.mockRejectedValue(new Error('API error'))

      const transcript: TranscriptEntry[] = [entry('user', 'テスト')]

      await expect(summarize(transcript, 'test-api-key')).rejects.toThrow(
        'API error',
      )
    })

    it('API レスポンスの text が空の場合は空文字を返す', async () => {
      mockGenerateContent.mockResolvedValue({ text: '' })

      const transcript: TranscriptEntry[] = [entry('user', 'テスト')]

      const result = await summarize(transcript, 'test-api-key')
      expect(result).toBe('')
    })
  })
})
