export function validateImageFiles(files: File[]) {
  if (!files.length) throw new Error('请先选择图片')
  for (const file of files) {
    if (!/\.(png|jpe?g|webp)$/i.test(file.name) || !file.size) {
      throw new Error(`不支持的图片：${file.name}，请选择 PNG、JPG 或 WebP`)
    }
  }
}

/** Conversion runs entirely in a local worker, one image at a time. */
export function imagesToPdf(files: File[], name: string, onProgress?: (current: number, total: number) => void,
  signal?: AbortSignal, rotations?: Array<number | null>): Promise<File> {
  validateImageFiles(files)
  if (rotations && (rotations.length !== files.length || rotations.some(v => v !== null && (!Number.isInteger(v) || v < 0 || v > 3)))) throw new Error('图片旋转参数无效')
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/imagesToPdf.worker.ts', import.meta.url), { type: 'module' })
    const dispose = () => { worker.terminate(); signal?.removeEventListener('abort', abort) }
    const abort = () => { dispose(); reject(new Error('图片转换已取消')) }
    if (signal?.aborted) { abort(); return }
    signal?.addEventListener('abort', abort, { once: true })
    worker.onmessage = ({ data }) => {
      if (data.error) { dispose(); reject(new Error(data.error)) }
      else if (data.bytes) {
        dispose()
        resolve(new File([data.bytes], name.replace(/\.pdf$/i, '') + '.pdf', { type: 'application/pdf' }))
      } else onProgress?.(data.progress, data.total)
    }
    worker.onerror = event => { dispose(); reject(new Error(event.message || '图片转换失败')) }
    worker.postMessage({ files, rotations })
  })
}
