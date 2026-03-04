/**
 * サマリー・会話ログの書き出し
 * Rust Tauri command 経由で ~/.claude/voice-chat/ に書き込む
 */

import { invoke } from '@tauri-apps/api/core'
import type { TranscriptEntry } from '../types'

/** 会話ログを Markdown 形式にフォーマット */
export function formatConversationLog(transcript: TranscriptEntry[]): string {
  if (transcript.length === 0) return ''

  return transcript
    .map((entry) => {
      const role = entry.role === 'user' ? 'ユーザー' : 'アシスタント'
      const time = new Date(entry.timestamp).toLocaleTimeString('ja-JP', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
      return `[${time}] **${role}**: ${entry.text}`
    })
    .join('\n\n')
}

/** サマリーを ~/.claude/voice-chat/summary.md に書き出し */
export async function writeSummary(content: string): Promise<void> {
  await invoke('write_summary', { content })
}

/** 会話ログを ~/.claude/voice-chat/conversation.md に書き出し */
export async function writeConversation(
  transcript: TranscriptEntry[],
): Promise<void> {
  const content = formatConversationLog(transcript)
  await invoke('write_conversation', { content })
}
