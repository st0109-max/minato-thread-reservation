// PDF検証: ページ数 / 四辺の白フチ / QR描画の有無
// 手順: pdf-lib でページ数・寸法確認 → sips でPNG化 → pngjs でピクセル検査
import { PDFDocument } from "pdf-lib";
import { PNG } from "pngjs";
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 入稿データ(HTML/PDF)の置き場。ope リポジトリの隣の「入稿データ」フォルダ。SRC 環境変数で上書き可。
const SRC = process.env.SRC ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "入稿データ");
const TMP = process.cwd();
const NAVY = { r: 0x0c, g: 0x2a, b: 0x40 };
const TOL = 40; // 各チャンネル許容差(アンチエイリアス考慮)

// QR領域はHTML記載の座標(mm)から算出
const JOBS = [
  { pdf: "minato_card_omote.pdf", mm: [97, 61], qr: null },
  { pdf: "minato_card_ura.pdf", mm: [97, 61], qr: { x: 33.5, y: 15.5, size: 30 } },
  { pdf: "minato_stand_a6.pdf", mm: [105, 148], qr: { x: 32.5, y: 64, size: 40 } },
];

const isNavy = (p) =>
  Math.abs(p.r - NAVY.r) <= TOL && Math.abs(p.g - NAVY.g) <= TOL && Math.abs(p.b - NAVY.b) <= TOL;

let allOk = true;
for (const j of JOBS) {
  const file = path.join(SRC, j.pdf);
  const doc = await PDFDocument.load(readFileSync(file));
  const pages = doc.getPageCount();
  const { width, height } = doc.getPage(0).getSize(); // pt
  const wMm = (width / 72) * 25.4, hMm = (height / 72) * 25.4;

  const png = path.join(TMP, j.pdf + ".cg.png"); // render-cg (CoreGraphics, 緑バッキング) の出力を使用
  if (!existsSync(png)) { console.log(`${j.pdf}: PNG化失敗`); allOk = false; continue; }
  const img = PNG.sync.read(readFileSync(png));
  const px = (x, y) => {
    const i = (y * img.width + x) * 4;
    return { r: img.data[i], g: img.data[i + 1], b: img.data[i + 2] };
  };

  // 四辺検査:
  //  - 最外周1px: ラスタライザのAAブレンド(紺寄り)は許容、白っぽい(lum>180)ピクセルのみNG
  //  - 2〜4px目のリング: 厳密に紺であること(サブmmの白スジも検出)
  const badSides = [];
  const lum = (p) => 0.299 * p.r + 0.587 * p.g + 0.114 * p.b;
  // 緑 = PDFが何も塗っていない領域(レンダラーのバッキング色)。白 = 白く塗られたフチ。
  const isUnpainted = (p) => p.g > 180 && p.r < 100 && p.b < 100;
  const checkLine = (name, coords, strict) => {
    let bad = 0;
    for (const [x, y] of coords) {
      const p = px(x, y);
      if (isUnpainted(p) || (strict ? !isNavy(p) : lum(p) > 180)) bad++;
    }
    if (bad > coords.length * 0.02) badSides.push(`${name}(${bad}/${coords.length}px)`);
  };
  const W = img.width, H = img.height;
  checkLine("上辺", Array.from({ length: W }, (_, x) => [x, 0]), false);
  checkLine("下辺", Array.from({ length: W }, (_, x) => [x, H - 1]), false);
  checkLine("左辺", Array.from({ length: H }, (_, y) => [0, y]), false);
  checkLine("右辺", Array.from({ length: H }, (_, y) => [W - 1, y]), false);
  for (let ring = 1; ring <= 3; ring++) {
    checkLine(`上辺+${ring}px`, Array.from({ length: W - 2 * ring }, (_, x) => [x + ring, ring]), true);
    checkLine(`下辺+${ring}px`, Array.from({ length: W - 2 * ring }, (_, x) => [x + ring, H - 1 - ring]), true);
    checkLine(`左辺+${ring}px`, Array.from({ length: H - 2 * ring }, (_, y) => [ring, y + ring]), true);
    checkLine(`右辺+${ring}px`, Array.from({ length: H - 2 * ring }, (_, y) => [W - 1 - ring, y + ring]), true);
  }

  // QR領域: 白パネル(明)と紺モジュール(暗)が両方十分あること(描画の証拠)
  // ※このQRは白い角丸パネル上に紺〜青グラデのモジュールを描くデザイン
  let qrResult = "対象外";
  if (j.qr) {
    const sx = img.width / j.mm[0], sy = img.height / j.mm[1];
    let dark = 0, light = 0, total = 0;
    for (let y = Math.floor(j.qr.y * sy); y < Math.floor((j.qr.y + j.qr.size) * sy); y++)
      for (let x = Math.floor(j.qr.x * sx); x < Math.floor((j.qr.x + j.qr.size) * sx); x++) {
        const p = px(x, y);
        const lum = 0.299 * p.r + 0.587 * p.g + 0.114 * p.b;
        if (lum < 130) dark++; else if (lum > 200) light++;
        total++;
      }
    const ok = dark > total * 0.1 && light > total * 0.3;
    qrResult = ok ? `OK (モジュール${Math.round((dark / total) * 100)}% / パネル${Math.round((light / total) * 100)}%)` : `NG (暗${dark} 明${light} / ${total})`;
    if (!ok) allOk = false;
  }

  if (badSides.length) allOk = false;
  if (pages !== 1) allOk = false;
  console.log(`${j.pdf}: ${pages}ページ, ${wMm.toFixed(1)}×${hMm.toFixed(1)}mm, ` +
    `白フチ${badSides.length ? "あり→" + badSides.join(",") : "なし"}, QR:${qrResult}, ラスタ${img.width}×${img.height}px`);
}
console.log(allOk ? "ALL OK" : "NG あり");
process.exit(allOk ? 0 : 1);
