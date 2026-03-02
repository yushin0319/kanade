import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useLiveApi } from "./hooks/use-live-api";
import { useSettings } from "./hooks/use-settings";
import { ControlTray } from "./components/ControlTray";
import { SendToCCButton } from "./components/SendToCCButton";
import { SettingsPanel } from "./components/SettingsPanel";

function App() {
  const { settings, loaded, loadSettings, updateSetting } = useSettings();
  const { state, error, transcript, volume, connect, disconnect, sendText, toggleMute } =
    useLiveApi({ model: settings.model, voice: settings.voice });
  const [input, setInput] = useState("");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // 設定 + API Key 存在チェック
  useEffect(() => {
    loadSettings();
    invoke<boolean>("has_api_key").then(setHasKey).catch(() => setHasKey(false));
  }, [loadSettings]);

  // 自動スクロール
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    sendText(trimmed);
    setInput("");
  };

  const handleSaveKey = async () => {
    if (!apiKeyInput.trim()) return;
    try {
      await invoke("set_api_key", { key: apiKeyInput.trim() });
      setHasKey(true);
    } catch (e) {
      console.error("Failed to save API key:", e);
    }
  };

  // 読み込み中
  if (hasKey === null || !loaded) {
    return <div style={containerStyle}>読み込み中...</div>;
  }

  // API Key 未設定時のオンボーディング
  if (!hasKey) {
    return (
      <div style={containerStyle}>
        <h1 style={{ marginBottom: "1rem" }}>Kanade</h1>
        <p style={{ marginBottom: "1rem", color: "var(--color-text-subtle)" }}>
          Gemini API Key を入力してください
        </p>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <input
            type="password"
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSaveKey()}
            placeholder="AIza..."
            style={inputStyle}
          />
          <button onClick={handleSaveKey} style={actionButtonStyle}>
            保存
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        backgroundColor: "var(--color-bg)",
        color: "var(--color-text)",
        fontFamily: "sans-serif",
      }}
    >
      {/* ヘッダー */}
      <div
        style={{
          padding: "0.75rem 1rem",
          borderBottom: "1px solid var(--color-border)",
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
        }}
      >
        <h1 style={{ fontSize: "1.2rem", margin: 0 }}>Kanade</h1>
        <span style={{ color: "var(--color-text-muted)", fontSize: "0.8rem" }}>
          音声モード
        </span>
        <div style={{ marginLeft: "auto", display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <SendToCCButton
            transcript={transcript}
            pyautoguiEnabled={settings.pyautoguiEnabled}
          />
          <button
            onClick={() => setShowSettings(true)}
            style={settingsButtonStyle}
            title="設定"
          >
            ⚙
          </button>
        </div>
      </div>

      {/* 会話ログ */}
      <div style={{ flex: 1, overflow: "auto", padding: "1rem" }}>
        {transcript.length === 0 && state !== "connected" && (
          <p style={{ color: "var(--color-muted)", textAlign: "center", marginTop: "2rem" }}>
            接続して会話を始めましょう
          </p>
        )}
        {transcript.map((entry, i) => (
          <div
            key={i}
            style={{
              marginBottom: "0.75rem",
              display: "flex",
              justifyContent:
                entry.role === "user" ? "flex-start" : "flex-end",
            }}
          >
            <div
              style={{
                maxWidth: "70%",
                padding: "0.5rem 0.75rem",
                borderRadius: 8,
                backgroundColor:
                  entry.role === "user" ? "var(--color-border)" : "#1e3a5f",
                fontSize: "0.9rem",
                lineHeight: 1.5,
              }}
            >
              {entry.text}
            </div>
          </div>
        ))}
        <div ref={transcriptEndRef} />
      </div>

      {/* テキスト入力（接続中・ミュート中とも使用可） */}
      {(state === "connected" || state === "muted") && (
        <div
          style={{
            padding: "0.75rem 1rem",
            borderTop: "1px solid var(--color-border)",
            display: "flex",
            gap: "0.5rem",
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="メッセージを入力..."
            style={inputStyle}
          />
          <button onClick={handleSend} style={actionButtonStyle}>
            送信
          </button>
        </div>
      )}

      {/* コントロールトレイ */}
      <ControlTray
        state={state}
        error={error}
        volume={volume}
        onConnect={connect}
        onDisconnect={disconnect}
        onToggleMute={toggleMute}
      />

      {/* 設定パネル */}
      {showSettings && (
        <SettingsPanel
          settings={settings}
          onUpdate={updateSetting}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  height: "100vh",
  backgroundColor: "var(--color-bg)",
  color: "var(--color-text)",
  fontFamily: "sans-serif",
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: "0.5rem 0.75rem",
  fontSize: "0.9rem",
  backgroundColor: "var(--color-bg-secondary)",
  color: "var(--color-text)",
  border: "1px solid var(--color-border-light)",
  borderRadius: 6,
  outline: "none",
};

const actionButtonStyle: React.CSSProperties = {
  padding: "0.5rem 1rem",
  fontSize: "0.9rem",
  backgroundColor: "var(--color-accent)",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
};

const settingsButtonStyle: React.CSSProperties = {
  padding: "0.3rem 0.5rem",
  fontSize: "1rem",
  backgroundColor: "transparent",
  color: "var(--color-text-subtle)",
  border: "1px solid var(--color-muted)",
  borderRadius: 6,
  cursor: "pointer",
};

export default App;
