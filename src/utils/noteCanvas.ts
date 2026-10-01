// The bundled note image is 2880×1800; command/snapshot bounds are 1675×1047.
// Keep the same image canvas so the native notebook does not clip arbitrary PDF sizes.
export const NOTE_CANVAS = Object.freeze({ width: 2880, height: 1800 })

export function fitPageToCanvas(width: number, height: number, box: { width: number; height: number }) {
  if (![width, height, box.width, box.height].every(n => Number.isFinite(n) && n > 0)) {
    throw new Error('PDF 页面或笔记画布尺寸无效')
  }
  const scale = Math.min(box.width / width, box.height / height)
  return { scale, x: (box.width - width * scale) / 2, y: (box.height - height * scale) / 2 }
}
