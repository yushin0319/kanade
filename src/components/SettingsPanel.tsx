/**
 * 設定パネルコンポーネント
 * API Key / モデル / 音声 / pyautogui の設定を管理
 */

import { useState } from 'react'
import type { GeminiModel, GeminiVoice, Settings } from '../types/settings'

interface SettingsPanelProps {
  settings: Settings
  onUpdate: <K extends keyof Settings>(
    key: K,
    value: Settings[K],
  ) => Promise<void>
  onClose: () => void
}

const MODEL_OPTIONS: { value: GeminiModel; label: string }[] = [
  {
    value: 'gemini-2.5-flash-native-audio-latest',
    label: 'Gemini 2.5 Flash (latest)',
  },
  {
    value: 'gemini-2.5-flash-native-audio-preview-12-2025',
    label: 'Gemini 2.5 Flash (preview)',
  },
]

const VOICE_OPTIONS: { value: GeminiVoice; label: string }[] = [
  { value: 'Puck', label: 'Puck' },
  { value: 'Charon', label: 'Charon' },
  { value: 'Kore', label: 'Kore' },
  { value: 'Fenrir', label: 'Fenrir' },
  { value: 'Aoede', label: 'Aoede' },
]

export function SettingsPanel({
  settings,
  onUpdate,
  onClose,
}: SettingsPanelProps) {
  const [apiKeyInput, setApiKeyInput] = useState(settings.apiKey)
  const [saving, setSaving] = useState(false)

  const handleSaveApiKey = async () => {
    if (!apiKeyInput.trim()) return
    setSaving(true)
    try {
      await onUpdate('apiKey', apiKeyInput.trim())
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={overlayStyle}>
      <div style={panelStyle}>
        <div style={headerStyle}>
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>設定</h2>
          <button type="button" onClick={onClose} style={closeButtonStyle}>
            ✕
          </button>
        </div>

        <div style={bodyStyle}>
          {/* API Key */}
          <div style={sectionStyle}>
            <label style={labelStyle}>Gemini API Key</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="AIza..."
                style={inputStyle}
              />
              <button
                type="button"
                onClick={handleSaveApiKey}
                disabled={saving}
                style={saveButtonStyle}
              >
                {saving ? '...' : '保存'}
              </button>
            </div>
          </div>

          {/* モデル */}
          <div style={sectionStyle}>
            <label style={labelStyle}>モデル</label>
            <select
              value={settings.model}
              onChange={(e) => onUpdate('model', e.target.value as GeminiModel)}
              style={selectStyle}
            >
              {MODEL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p style={hintStyle}>変更は次回接続時に適用されます</p>
          </div>

          {/* 音声 */}
          <div style={sectionStyle}>
            <label style={labelStyle}>音声</label>
            <select
              value={settings.voice}
              onChange={(e) => onUpdate('voice', e.target.value as GeminiVoice)}
              style={selectStyle}
            >
              {VOICE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p style={hintStyle}>変更は次回接続時に適用されます</p>
          </div>

          {/* pyautogui */}
          <div style={sectionStyle}>
            <label
              style={{
                ...labelStyle,
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <input
                type="checkbox"
                checked={settings.pyautoguiEnabled}
                onChange={(e) => onUpdate('pyautoguiEnabled', e.target.checked)}
              />
              pyautogui でCCに自動注入
            </label>
            <p style={hintStyle}>
              有効にすると「CCに送信」時に pyautogui
              でCC画面にサマリーを自動入力します
            </p>
          </div>
        </div>
      </div>
    </div>
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

const panelStyle: React.CSSProperties = {
  backgroundColor: '#2a2a2a',
  borderRadius: 8,
  width: '90%',
  maxWidth: '450px',
  maxHeight: '80vh',
  display: 'flex',
  flexDirection: 'column',
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '1rem 1.25rem',
  borderBottom: '1px solid #444',
}

const closeButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#aaa',
  fontSize: '1.1rem',
  cursor: 'pointer',
  padding: '0.25rem',
}

const bodyStyle: React.CSSProperties = {
  padding: '1.25rem',
  overflow: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: '1.25rem',
}

const sectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.4rem',
}

const labelStyle: React.CSSProperties = {
  fontSize: '0.85rem',
  color: '#ccc',
  fontWeight: 'bold',
}

const hintStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  color: '#777',
  margin: 0,
}

const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: '0.5rem 0.75rem',
  fontSize: '0.85rem',
  backgroundColor: '#1a1a1a',
  color: '#eee',
  border: '1px solid #444',
  borderRadius: 6,
  outline: 'none',
}

const selectStyle: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  fontSize: '0.85rem',
  backgroundColor: '#1a1a1a',
  color: '#eee',
  border: '1px solid #444',
  borderRadius: 6,
  outline: 'none',
}

const saveButtonStyle: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  fontSize: '0.85rem',
  backgroundColor: '#4caf50',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
}
