import type { ConnectionState, ErrorKind } from '../types'
import { VoiceIndicator } from './VoiceIndicator'

interface ControlTrayProps {
  state: ConnectionState
  error: ErrorKind | null
  volume: number
  onConnect: () => void
  onDisconnect: () => void
  onToggleMute: () => void
}

const STATE_CONFIG: Record<ConnectionState, { label: string; color: string }> =
  {
    idle: { label: '待機中', color: '#888' },
    connecting: { label: '接続中...', color: '#ff0' },
    connected: { label: '通話中', color: '#0f0' },
    muted: { label: 'ミュート中', color: '#f90' },
    error: { label: 'エラー', color: '#f00' },
  }

const ERROR_MESSAGES: Record<ErrorKind, string> = {
  connection_failed: '接続に失敗しました。API Key を確認してください。',
  api_limit: 'API の利用制限に達しました。',
  mic_error: 'マイクへのアクセスに失敗しました。',
  unknown: '不明なエラーが発生しました。',
}

export function ControlTray({
  state,
  error,
  volume,
  onConnect,
  onDisconnect,
  onToggleMute,
}: ControlTrayProps) {
  const isConnected = state === 'connected' || state === 'muted'

  return (
    <div
      style={{ padding: '1rem', borderTop: '1px solid var(--color-border)' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        {/* 状態インジケータ */}
        <span
          style={{
            display: 'inline-block',
            width: 12,
            height: 12,
            borderRadius: '50%',
            backgroundColor: STATE_CONFIG[state].color,
          }}
        />
        <span style={{ fontWeight: 'bold' }}>{STATE_CONFIG[state].label}</span>

        {/* 音量インジケータ（接続中のみ） */}
        {isConnected && (
          <VoiceIndicator volume={volume} muted={state === 'muted'} />
        )}

        {/* ミュートボタン */}
        {isConnected && (
          <button
            type="button"
            onClick={onToggleMute}
            style={buttonStyle(
              state === 'muted' ? '#f90' : 'var(--color-muted)',
            )}
          >
            {state === 'muted' ? 'ミュート解除' : 'ミュート'}
          </button>
        )}

        {/* 接続/切断ボタン */}
        {isConnected ? (
          <button
            type="button"
            onClick={onDisconnect}
            style={buttonStyle('#f44')}
          >
            切断
          </button>
        ) : (
          <button
            type="button"
            onClick={onConnect}
            disabled={state === 'connecting'}
            style={buttonStyle(
              state === 'connecting'
                ? 'var(--color-muted)'
                : 'var(--color-accent)',
            )}
          >
            接続
          </button>
        )}
      </div>

      {state === 'error' && error && (
        <p style={{ color: '#f88', marginTop: '0.5rem', fontSize: '0.9rem' }}>
          {ERROR_MESSAGES[error]}
        </p>
      )}
    </div>
  )
}

function buttonStyle(bg: string): React.CSSProperties {
  return {
    padding: '0.5rem 1.5rem',
    fontSize: '0.9rem',
    backgroundColor: bg,
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
  }
}
