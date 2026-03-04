import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SendToCCButton } from '../../components/SendToCCButton'
import type { TranscriptEntry } from '../../types'

// モック
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

vi.mock('../../lib/summarizer', () => ({
  summarize: vi.fn(),
}))

vi.mock('../../lib/summary-writer', () => ({
  writeSummary: vi.fn(),
  writeConversation: vi.fn(),
}))

vi.mock('../../lib/cc-notifier', () => ({
  notifyCompletion: vi.fn(),
  injectToCC: vi.fn(),
}))

function entry(role: 'user' | 'assistant', text: string): TranscriptEntry {
  return { role, text, timestamp: Date.now() }
}

describe('SendToCCButton', () => {
  let mockInvoke: ReturnType<typeof vi.fn>
  let mockSummarize: ReturnType<typeof vi.fn>
  let mockWriteSummary: ReturnType<typeof vi.fn>
  let mockWriteConversation: ReturnType<typeof vi.fn>
  let mockNotifyCompletion: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    const { summarize } = await import('../../lib/summarizer')
    const { writeSummary, writeConversation } = await import(
      '../../lib/summary-writer'
    )
    const { notifyCompletion } = await import('../../lib/cc-notifier')

    mockInvoke = vi.mocked(invoke)
    mockSummarize = vi.mocked(summarize)
    mockWriteSummary = vi.mocked(writeSummary)
    mockWriteConversation = vi.mocked(writeConversation)
    mockNotifyCompletion = vi.mocked(notifyCompletion)

    mockInvoke.mockReset()
    mockSummarize.mockReset()
    mockWriteSummary.mockReset()
    mockWriteConversation.mockReset()
    mockNotifyCompletion.mockReset()

    mockInvoke.mockResolvedValue('test-api-key')
    mockWriteSummary.mockResolvedValue(undefined)
    mockWriteConversation.mockResolvedValue(undefined)
    mockNotifyCompletion.mockResolvedValue(undefined)
  })

  it('会話がない場合はボタンが無効化される', () => {
    render(<SendToCCButton transcript={[]} />)
    const button = screen.getByText('CCに送信')
    expect(button).toBeDisabled()
  })

  it('会話がある場合はボタンが有効になる', () => {
    render(<SendToCCButton transcript={[entry('user', 'テスト')]} />)
    const button = screen.getByText('CCに送信')
    expect(button).not.toBeDisabled()
  })

  it('ボタン押下で要約が実行されプレビューが表示される', async () => {
    mockSummarize.mockResolvedValue('テストサマリー')

    render(<SendToCCButton transcript={[entry('user', 'テスト')]} />)
    fireEvent.click(screen.getByText('CCに送信'))

    // 要約中表示
    expect(screen.getByText('要約中...')).toBeInTheDocument()

    // プレビュー表示
    await waitFor(() => {
      expect(screen.getByText('サマリープレビュー')).toBeInTheDocument()
    })
    expect(screen.getByText('テストサマリー')).toBeInTheDocument()
  })

  it('プレビューで確認するとファイル保存と通知が実行される', async () => {
    mockSummarize.mockResolvedValue('テストサマリー')

    const transcript = [entry('user', 'テスト'), entry('assistant', '応答')]
    render(<SendToCCButton transcript={transcript} />)

    // ボタン押下 → プレビュー
    fireEvent.click(screen.getByText('CCに送信'))
    await waitFor(() => {
      expect(screen.getByText('サマリープレビュー')).toBeInTheDocument()
    })

    // 確認ボタン押下
    fireEvent.click(screen.getByText('CCに送信'))

    // 保存完了まで待機
    await waitFor(() => {
      expect(screen.getByText('完了！')).toBeInTheDocument()
    })

    expect(mockWriteSummary).toHaveBeenCalledWith('テストサマリー')
    expect(mockWriteConversation).toHaveBeenCalledWith(transcript)
    expect(mockNotifyCompletion).toHaveBeenCalled()
  })

  it('キャンセルでプレビューが閉じる', async () => {
    mockSummarize.mockResolvedValue('テストサマリー')

    render(<SendToCCButton transcript={[entry('user', 'テスト')]} />)
    fireEvent.click(screen.getByText('CCに送信'))

    await waitFor(() => {
      expect(screen.getByText('サマリープレビュー')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('キャンセル'))

    // ボタンに戻る
    await waitFor(() => {
      expect(screen.getByText('CCに送信')).toBeInTheDocument()
    })
  })

  it('要約エラー時にエラー表示される', async () => {
    mockSummarize.mockRejectedValue(new Error('API error'))

    render(<SendToCCButton transcript={[entry('user', 'テスト')]} />)
    fireEvent.click(screen.getByText('CCに送信'))

    await waitFor(() => {
      expect(screen.getByText(/エラー.*API error/)).toBeInTheDocument()
    })
  })
})
