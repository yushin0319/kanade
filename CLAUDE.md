# Kanade - CLAUDE.md

## プロジェクト概要
Gemini Live API を使ったリアルタイム音声チャット Tauri v2 デスクトップアプリ。
Claude Code（いずみ）と連携し、ブリーフィング注入 → 音声会話 → サマリーをCCに送信する。

## ビルド・実行

### 前提条件
- Node.js 20+, Rust 1.77+
- VS2022 "Desktop development with C++" ワークロード（Windows SDK 含む）
- vcvars64.bat で MSVC 環境を設定してから Rust ビルドを実行

### 開発コマンド
```bash
# フロントエンドビルド
npm run build

# Tauri dev（vcvars64.bat で MSVC 環境を設定後に実行）
npx tauri dev

# テスト
npm test

# Rust のみチェック（vcvars64 環境下で実行）
cd src-tauri && cargo check
```

## 技術スタック
- **Frontend**: React 19 + TypeScript (strict) + Vite 7
- **Backend**: Rust + Tauri v2
- **AI**: Gemini Live API (`@google/genai`)
- **状態管理**: Zustand
- **テスト**: Vitest + @testing-library/react

## 設計ルール
- API キーは Rust 側で管理（`tauri-plugin-store`）、フロントに露出させない
- 接続状態: `idle → connecting → connected → muted → error` の5段階
- マイク権限: WebView2 COM API で localhost のみ自動許可
- CC連携: ファイルベース（`~/.claude/voice-chat/`）が一次手段
