# Kanade - CLAUDE.md

## プロジェクト概要
Gemini Live API を使ったリアルタイム音声チャット Tauri v2 デスクトップアプリ。
Claude Code（いずみ）と連携し、ブリーフィング注入 → 音声会話 → サマリーをCCに送信する。

## ビルド・実行

### 前提条件
- Node.js 22+, Rust 1.77+
- VS2022 "Desktop development with C++" ワークロード（Windows SDK 含む）
- vcvars64.bat が必要（MSVC リンカー環境設定）

### 開発コマンド
```bash
# Tauri dev（バッチファイル経由で MSVC 環境を設定）
cat > /tmp/run.bat << 'BAT'
@echo off
call "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat" >nul 2>&1
set PATH=%USERPROFILE%\.cargo\bin;%PATH%
cd /d C:\Users\yushi\develop\kanade
npx @tauri-apps/cli@latest dev 2>&1
BAT
cmd.exe //c /tmp/run.bat

# テスト
npm test

# Rust のみチェック（同様に vcvars64 必要）
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
