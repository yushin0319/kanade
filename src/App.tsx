import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useLiveApi } from "./hooks/use-live-api";
import { ControlTray } from "./components/ControlTray";
import { SendToCCButton } from "./components/SendToCCButton";

function App() {
  const { state, error, transcript, volume, connect, disconnect, sendText, toggleMute } =
    useLiveApi();
  const [input, setInput] = useState("");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // API Key 存在チェック
  useEffect(() => {
    invoke<boolean>("has_api_key").then(setHasKey).catch(() => setHasKey(false));
  }, []);

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

  // API Key 未設定時のオンボーディング
  if (hasKey === null) {
    return <div style={containerStyle}>読み込み中...</div>;
  }

  if (!hasKey) {
    return (
      <div style={containerStyle}>
        <h1 style={{ marginBottom: "1rem" }}>Kanade</h1>
        <p style={{ marginBottom: "1rem", color: "#aaa" }}>
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
          <button onClick={handleSaveKey} style={sendButtonStyle}>
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
        backgroundColor: "#1a1a1a",
        color: "#eee",
        fontFamily: "sans-serif",
      }}
    >
      {/* ヘッダー */}
      <div
        style={{
          padding: "0.75rem 1rem",
          borderBottom: "1px solid #333",
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
        }}
      >
        <h1 style={{ fontSize: "1.2rem", margin: 0 }}>Kanade</h1>
        <span style={{ color: "#888", fontSize: "0.8rem" }}>
          音声モード
        </span>
        <div style={{ marginLeft: "auto" }}>
          <SendToCCButton transcript={transcript} />
        </div>
      </div>

      {/* 会話ログ */}
      <div style={{ flex: 1, overflow: "auto", padding: "1rem" }}>
        {transcript.length === 0 && state !== "connected" && (
          <p style={{ color: "#666", textAlign: "center", marginTop: "2rem" }}>
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
                  entry.role === "user" ? "#333" : "#1e3a5f",
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
            borderTop: "1px solid #333",
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
          <button onClick={handleSend} style={sendButtonStyle}>
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
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  height: "100vh",
  backgroundColor: "#1a1a1a",
  color: "#eee",
  fontFamily: "sans-serif",
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: "0.5rem 0.75rem",
  fontSize: "0.9rem",
  backgroundColor: "#2a2a2a",
  color: "#eee",
  border: "1px solid #444",
  borderRadius: 6,
  outline: "none",
};

const sendButtonStyle: React.CSSProperties = {
  padding: "0.5rem 1rem",
  fontSize: "0.9rem",
  backgroundColor: "#4caf50",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
};

export default App;
