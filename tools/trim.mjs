// パッド付きで生成したPDFの「実際に塗られた領域」をラスタから実測し、
// その左上を基準に MediaBox を指定寸法ぴったりに切り出す。
// (Chromiumのレイアウト丸めによる未塗装スリバーを確実に排除する)
import { PDFDocument } from "pdf-lib";
import { PNG } from "pngjs";
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 入稿データ(HTML/PDF)の置き場。ope リポジトリの隣の「入稿データ」フォルダ。SRC 環境変数で上書き可。
const SRC = process.env.SRC ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "入稿データ");
const MM2PT = 72 / 25.4;
const SCALE = 6; // render-cg と合わせる (72dpi×6)
const JOBS = [
  { pdf: "minato_card_omote.pdf", mm: [97, 61] },
  { pdf: "minato_card_ura.pdf", mm: [97, 61] },
  { pdf: "minato_stand_a6.pdf", mm: [105, 148] },
];

const isGreen = (d, i) => d[i + 1] > 180 && d[i] < 100 && d[i + 2] < 100;

for (const j of JOBS) {
  const file = path.join(SRC, j.pdf);

  // パッド付きPDFを緑バッキングでラスタ化し、塗装領域の左上を実測
  const tmpPng = path.join(process.cwd(), j.pdf + ".pad.png");
  execSync(`./render-cg "${file}" "${tmpPng}" ${SCALE}`, { cwd: process.cwd() });
  const img = PNG.sync.read(readFileSync(tmpPng));
  const rowPainted = (y) => {
    let n = 0;
    for (let x = 0; x < img.width; x++) if (!isGreen(img.data, (y * img.width + x) * 4)) n++;
    return n > img.width * 0.5;
  };
  const colPainted = (x) => {
    let n = 0;
    for (let y = 0; y < img.height; y++) if (!isGreen(img.data, (y * img.width + x) * 4)) n++;
    return n > img.height * 0.5;
  };
  let topRow = 0;
  while (topRow < img.height && !rowPainted(topRow)) topRow++;
  let leftCol = 0;
  while (leftCol < img.width && !colPainted(leftCol)) leftCol++;
  if (topRow >= img.height || leftCol >= img.width) throw new Error(`${j.pdf}: 塗装領域が見つからない`);

  const doc = await PDFDocument.load(readFileSync(file));
  const page = doc.getPage(0);
  const { width: paperW, height: paperH } = page.getSize();
  const w = j.mm[0] * MM2PT, h = j.mm[1] * MM2PT;
  // ラスタ行0 = 用紙上端(y=paperH)。塗装左上(pt)へ変換し、そこから w×h を切り出す
  const xLeft = leftCol / SCALE;
  const yTop = paperH - topRow / SCALE;
  if (xLeft + w > paperW + 0.01 || yTop - h < -0.01) throw new Error(`${j.pdf}: 塗装領域が指定寸法より小さい`);
  for (const box of ["setMediaBox", "setCropBox", "setBleedBox", "setTrimBox"]) {
    page[box](xLeft, yTop - h, w, h);
  }
  writeFileSync(file, await doc.save());
  console.log(`${j.pdf}: 塗装左上を実測 (left=${xLeft.toFixed(2)}pt, top=${yTop.toFixed(2)}pt / 用紙${paperW.toFixed(2)}×${paperH.toFixed(2)}pt) → ${j.mm[0]}×${j.mm[1]}mm で切り出し`);
}
