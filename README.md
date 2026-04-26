# kanade

Gemini Live API を使ったリアルタイム音声チャット Tauri v2 デスクトップアプリ。「奏」と書いて kanade。Cargo.toml description: "Kanade - Real-time voice chat with Gemini"。

## スタック

- Frontend: React 19 + TypeScript + Vite 8 + Tailwind / Biome / vitest
- Desktop: Tauri 2.10.3（Rust、WebView2）+ tauri-plugin-store / tauri-plugin-log
- AI: Gemini Live API（`@google/genai` 1.50.1、WebSocket `wss://generativelanguage.googleapis.com`）
- 状態管理: Zustand
- パッケージマネージャ: Bun（`bun.lock` あり）

## 構成

```
src/
  App.tsx              メイン UI（接続/切断・音声・transcript・サマリー送出）
  hooks/use-live-api.ts Gemini Live API ラッパー
  hooks/use-settings.ts API キー / モデル設定の永続化
  components/
    ControlTray.tsx    接続トグル・マイクトグル・モデル選択
    SettingsPanel.tsx  API キー入力
    SendToCCButton.tsx Claude Code 連携（pyautogui 注入）
src-tauri/
  Cargo.toml           Rust dependencies（tauri 2.10.3 / webview2-com 0.38）
  src/lib.rs           Tauri commands（has_api_key / set_api_key / send_to_cc 等）
```

## 機能

- ストリーミング音声対話（WebSocket → Gemini Live API）
- リアルタイム字起こし（transcript 表示）
- 音量インジケータ・ミュート切替
- 会話サマリーの自動生成 → Claude Code への注入（オプション）
- 設定: モデル・音声プロファイル・pyautogui 注入の有効化

## 開発

```bash
bun install
bun run dev          # Vite 開発サーバー
bun run build        # tsc -b && vite build
bun run lint         # Biome
bun test             # vitest
bun run tauri dev    # Tauri デスクトップ起動
```

## ビルド・配布

```bash
bun run tauri build  # 各 OS のインストーラを生成
```

API キーは Tauri plugin-store にローカル保存され、コマンドラインや設定ファイルには露出しない。

## 運用ルール

- `GEMINI_API_KEY` はアプリ初回起動時に Tauri ストア (`~/.local/share/kanade/`) に保存
- pyautogui 注入は Windows 環境での Claude Code 連携用（オプション機能）
- main 直 commit 禁止、PR 経由でマージ

詳細・Claude Code 連携詳細は [CLAUDE.md](CLAUDE.md) を参照。
