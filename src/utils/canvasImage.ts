let encoder: Worker | undefined, idle: ReturnType<typeof setTimeout> | undefined, sequence = 0
const pending = new Map<number, { resolve: (bytes: ArrayBuffer) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>()

function stopEncoder(error?: Error) {
  encoder?.terminate(); encoder = undefined; clearTimeout(idle)
  for (const job of pending.values()) { clearTimeout(job.timer); job.reject(error || new Error('图片编码已停止')) }
  pending.clear()
}
function getEncoder() {
  if (!encoder) {
    encoder = new Worker(new URL('./webpEncoder.worker.ts', import.meta.url), { type: 'module' })
    encoder.onmessage = ({ data }) => {
      const job = pending.get(data.id)
      if (!job) return
      pending.delete(data.id); clearTimeout(job.timer)
      if (data.error) job.reject(new Error('本地 WebP 编码失败：' + data.error))
      else job.resolve(data.bytes)
      if (!pending.size) idle = setTimeout(() => stopEncoder(), 30_000)
    }
    encoder.onerror = () => stopEncoder(new Error('本地 WebP 编码器无法启动'))
  }
  clearTimeout(idle)
  return encoder
}
export async function encodeCanvasImage(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  const native = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, quality))
  if (native?.type === type) return native
  if (type !== 'image/webp') throw new Error('当前环境无法导出所需图片格式：' + type)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法读取待编码的图片')
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height), worker = getEncoder(), id = ++sequence
  const bytes = await new Promise<ArrayBuffer>((resolve, reject) => {
    const timer = setTimeout(() => stopEncoder(new Error('本地 WebP 编码超时，请重试')), 120_000)
    pending.set(id, { resolve, reject, timer })
    try { worker.postMessage({ id, pixels: image.data.buffer, width: image.width, height: image.height, quality: Math.max(0, Math.min(100, quality * 100)) }, [image.data.buffer]) }
    catch (error) { stopEncoder(error instanceof Error ? error : new Error(String(error))) }
  })
  const header = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 12))
  if (String.fromCharCode(...header.slice(0, 4)) !== 'RIFF' || String.fromCharCode(...header.slice(8, 12)) !== 'WEBP') throw new Error('本地编码器返回的 WebP 文件无效')
  return new Blob([bytes], { type: 'image/webp' })
}
