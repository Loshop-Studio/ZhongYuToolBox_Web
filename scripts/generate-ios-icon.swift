import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers
let args = CommandLine.arguments
guard args.count == 3, let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: args[1]) as CFURL, nil), let image = CGImageSourceCreateImageAtIndex(source, 0, nil), let context = CGContext(data: nil, width: 1024, height: 1024, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { fatalError("Cannot create app icon") }
context.setFillColor(CGColor(red: 0.94, green: 0.93, blue: 0.91, alpha: 1)); context.fill(CGRect(x: 0, y: 0, width: 1024, height: 1024))
context.interpolationQuality = .high; context.draw(image, in: CGRect(x: 0, y: 0, width: 1024, height: 1024))
guard let output = context.makeImage(), let destination = CGImageDestinationCreateWithURL(URL(fileURLWithPath: args[2]) as CFURL, UTType.png.identifier as CFString, 1, nil) else { fatalError("Cannot write app icon") }
CGImageDestinationAddImage(destination, output, nil); guard CGImageDestinationFinalize(destination) else { fatalError("Invalid app icon") }
