// CoreGraphics で PDF 1ページ目をラスタ化。
// 背景を緑(未塗装検出用マーカー)で塗ってから PDF を描画する。
// usage: render <in.pdf> <out.png> <scale>
import Foundation
import CoreGraphics
import ImageIO

let args = CommandLine.arguments
guard args.count == 4,
      let doc = CGPDFDocument(URL(fileURLWithPath: args[1]) as CFURL),
      let page = doc.page(at: 1),
      let scale = Double(args[3]) else {
    FileHandle.standardError.write("usage/open error\n".data(using: .utf8)!)
    exit(1)
}
let box = page.getBoxRect(.cropBox)
let w = Int((box.width * scale).rounded())
let h = Int((box.height * scale).rounded())
let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                    space: CGColorSpaceCreateDeviceRGB(),
                    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
ctx.setFillColor(CGColor(red: 0, green: 1, blue: 0, alpha: 1))
ctx.fill(CGRect(x: 0, y: 0, width: CGFloat(w), height: CGFloat(h)))
ctx.saveGState()
ctx.scaleBy(x: scale, y: scale)
ctx.translateBy(x: -box.minX, y: -box.minY)
ctx.drawPDFPage(page)
ctx.restoreGState()
let img = ctx.makeImage()!
let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: args[2]) as CFURL,
                                           "public.png" as CFString, 1, nil)!
CGImageDestinationAddImage(dest, img, nil)
CGImageDestinationFinalize(dest)
print("\(args[2]) \(w)x\(h) pages:\(doc.numberOfPages)")
