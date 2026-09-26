/**
 * 将任意错误转成可读文字。
 * 兼容 5+ 错误对象（带 code / message）、DOMError、FileError、
 * 普通 Error、字符串、以及普通对象，避免界面出现 "error" / "[object Object]" 这类无意义提示。
 */
export function formatError(e: unknown): string {
  if (e == null) return '未知错误（无错误信息）'
  if (typeof e === 'string') return e
  if (e instanceof Error) {
    return e.message || e.name || 'Error'
  }
  const obj = e as Record<string, any>
  const code = obj.code !== undefined && obj.code !== null ? `code=${obj.code} ` : ''
  const message = obj.message || obj.msg || obj.reason || ''
  const name = obj.name ? `[${obj.name}] ` : ''
  if (code || message || name) {
    return (name + code + message).trim()
  }
  try {
    return JSON.stringify(e)
  } catch {
    return String(e)
  }
}

/** 同时打印到控制台，便于真机 / 开发者工具里查看原始错误 */
export function logError(tag: string, e: unknown): void {
  // eslint-disable-next-line no-console
  console.error(`[${tag}]`, formatError(e), e)
}
