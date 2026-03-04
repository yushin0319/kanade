/**
 * CC にサマリーを送信するボタンコンポーネント
 * ボタン → 要約生成 → プレビュー → 確認 → 保存 + 通知
 */

import { invoke } from '@tauri-apps/api/core'
import { useCallback, useState } from 'react'
import { injectToCC, notifyCompletion } from '../lib/cc-notifier'
import { summarize } from '../lib/summarizer'
import { writeConversation, writeSummary } from '../lib/summary-writer'
import type { TranscriptEntry } from '../types'

export type SendState =
  | 'idle'
  | 'summarizing'
  | 'preview'
  | 'saving'
  | 'done'
  | 'error'

interface SendToCCButtonProps {
  transcript: TranscriptEntry[]
  pyautoguiEnabled?: boolean
}

export function SendToCCButton({
  transcript,
  pyautoguiEnabled = false,
}: SendToCCButtonProps) {
  const [sendState, setSendState] = useState<SendState>('idle')
  const [summary, setSummary] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const handleStart = useCallback(async () => {
    if (transcript.length === 0) return

    setSendState('summarizing')
    setErrorMessage('')

    try {
      const apiKey = await invoke<string>('get_api_key')
      const result = await summarize(transcript, apiKey)
      setSummary(result)
      setSendState('preview')
    } catch (e) {
      console.error('Summarize failed:', e)
      setErrorMessage(e instanceof Error ? e.message : String(e))
      setSendState('error')
    }
  }, [transcript])

  const handleConfirm = useCallback(async () => {
    setSendState('saving')

    try {
      // サマリー + 会話ログを書き出し
      await writeSummary(summary)
      await writeConversation(transcript)

      // BurntToast 通知
      try {
        await notifyCompletion()
      } catch (e) {
        console.warn('Notification failed (continuing):', e)
      }

      // pyautogui 注入（オプション）
      if (pyautoguiEnabled) {
        try {
          await injectToCC(summary)
        } catch (e) {
          console.warn('CC injection failed (continuing):', e)
        }
      }

      setSendState('done')
      // 3秒後にリセット
      setTimeout(() => {
        setSendState('idle')
        setSummary('')
      }, 3000)
    } catch (e) {
      console.error('Save failed:', e)
      setErrorMessage(e instanceof Error ? e.message : String(e))
      setSendState('error')
    }
  }, [summary, transcript, pyautoguiEnabled])

  const handleCancel = useCallback(() => {
    setSendState('idle')
    setSummary('')
    setErrorMessage('')
  }, [])

  // プレビューモーダル
  if (sendState === 'preview') {
    return (
      <div style={overlayStyle}>
        <div style={modalStyle}>
          <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem' }}>
            サマリープレビュー
          </h3>
          <div style={previewStyle}>{summary || '(サマリーが空です)'}</div>
          <div
            style={{
              display: 'flex',
              gap: '0.5rem',
              justifyContent: 'flex-end',
            }}
          >
            <button
              type="button"
              onClick={handleCancel}
              style={cancelButtonStyle}
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              style={confirmButtonStyle}
            >
              CCに送信
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ステータス表示
  const statusText: Record<string, string> = {
    summarizing: '要約中...',
    saving: '保存中...',
    done: '完了！',
    error: `エラー: ${errorMessage}`,
  }

  if (sendState !== 'idle') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span
          style={{
            fontSize: '0.8rem',
            color:
              sendState === 'error'
                ? '#f44'
                : sendState === 'done'
                  ? '#4caf50'
                  : '#aaa',
          }}
        >
          {statusText[sendState]}
        </span>
        {sendState === 'error' && (
          <button type="button" onClick={handleCancel} style={smallButtonStyle}>
            閉じる
          </button>
        )}
      </div>
    )
  }

  // 通常のボタン
  return (
    <button
      type="button"
      onClick={handleStart}
      disabled={transcript.length === 0}
      style={{
        ...sendButtonStyle,
        opacity: transcript.length === 0 ? 0.5 : 1,
        cursor: transcript.length === 0 ? 'not-allowed' : 'pointer',
      }}
    >
      CCに送信
    </button>
  )
}

// スタイル
const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0,0,0,0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 100,
}

const modalStyle: React.CSSProperties = {
  backgroundColor: '#2a2a2a',
  borderRadius: 8,
  padding: '1.25rem',
  maxWidth: '500px',
  width: '90%',
  maxHeight: '80vh',
  display: 'flex',
  flexDirection: 'column',
}

const previewStyle: React.CSSProperties = {
  flex: 1,
  overflow: 'auto',
  padding: '0.75rem',
  marginBottom: '1rem',
  backgroundColor: '#1a1a1a',
  borderRadius: 6,
  fontSize: '0.85rem',
  lineHeight: 1.6,
  whiteSpace: 'pre-wrap',
  maxHeight: '300px',
}

const sendButtonStyle: React.CSSProperties = {
  padding: '0.4rem 0.75rem',
  fontSize: '0.8rem',
  backgroundColor: '#2196f3',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
}

const confirmButtonStyle: React.CSSProperties = {
  padding: '0.5rem 1rem',
  fontSize: '0.85rem',
  backgroundColor: '#4caf50',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
}

const cancelButtonStyle: React.CSSProperties = {
  padding: '0.5rem 1rem',
  fontSize: '0.85rem',
  backgroundColor: 'transparent',
  color: '#aaa',
  border: '1px solid #555',
  borderRadius: 6,
  cursor: 'pointer',
}

const smallButtonStyle: React.CSSProperties = {
  padding: '0.2rem 0.5rem',
  fontSize: '0.75rem',
  backgroundColor: 'transparent',
  color: '#aaa',
  border: '1px solid #555',
  borderRadius: 4,
  cursor: 'pointer',
}
