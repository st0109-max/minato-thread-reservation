import { chromium } from "playwright";
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";

// 入稿データ(HTML/PDF)の置き場。ope リポジトリの隣の「入稿データ」フォルダ。SRC 環境変数で上書き可。
const SRC = process.env.SRC ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "入稿データ");
// Chromium はレイアウト幅を整数pxに丸めるため、指定寸法ちょうどだと
// 右・下に最大0.2mm程度の未塗装(白)が出ることがある。
// → 描画キャンバスを PAD 分大きくし(HTMLファイルは無変更、@page を実行時上書き)、
//   後段の trim.mjs で MediaBox を指定寸法ぴったりに切り出す。
const PAD = 2; // mm
const JOBS = [
  { html: "print_omote.html", pdf: "minato_card_omote.pdf", w: 97, h: 61, qr: false },
  { html: "print_ura.html", pdf: "minato_card_ura.pdf", w: 97, h: 61, qr: true },
  { html: "print_stand_a6.html", pdf: "minato_stand_a6.pdf", w: 105, h: 148, qr: true },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const j of JOBS) {
  const url = pathToFileURL(path.join(SRC, j.html)).href;
  await page.goto(url, { waitUntil: "networkidle" });
  if (j.qr) await page.waitForSelector("#qr svg", { state: "attached", timeout: 15000 });
  await page.addStyleTag({ content: `@page { size: ${j.w + PAD}mm ${j.h + PAD}mm; margin: 0; }` });
  await page.pdf({
    path: path.join(SRC, j.pdf),
    width: `${j.w + PAD}mm`,
    height: `${j.h + PAD}mm`,
    margin: { top: "0", right: "0", bottom: "0", left: "0" },
    printBackground: true,
    pageRanges: "1",
  });
  console.log(`generated: ${j.pdf} (canvas ${j.w + PAD}×${j.h + PAD}mm → trimで${j.w}×${j.h}mmへ)`);
}
await browser.close();
