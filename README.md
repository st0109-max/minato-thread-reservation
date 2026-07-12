# ope — みなとクリニック 処置WEB予約

処置予約システム(みなとクリニック WEB予約)。フロントは `index.html`、バックエンドは Supabase(構成は [docs/supabase.md](docs/supabase.md)、スキーマは [docs/schema.sql](docs/schema.sql))。

## 入稿データ生成ツール(`tools/`)

診察券カード・スタンドPOPの印刷入稿PDFを、隣の `../入稿データ/` にある `print_*.html` から生成・検証するスクリプト群。

- `generate.mjs` — Playwright(Chromium)でHTMLをパッド付きPDF化
- `trim.mjs` — 塗装領域を実測して MediaBox を指定寸法ぴったりに切り出し
- `verify.mjs` — ページ数・寸法・白フチ・QR描画のピクセル検査
- `render.swift` — CoreGraphicsでのラスタライズ補助

入稿データの置き場は既定でリポジトリの隣の `入稿データ/`(環境変数 `SRC` で上書き可)。
