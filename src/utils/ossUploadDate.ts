/** Official upload policies use Beijing calendar days, regardless of device timezone. */
export function ossDateStamp(timestamp = Date.now()): string {
  const date = new Date(timestamp + 8 * 60 * 60 * 1000)
  if (!Number.isFinite(date.getTime())) throw new Error('OSS 上传日期无效')
  return String(date.getUTCFullYear()) + String(date.getUTCMonth() + 1).padStart(2, '0') + String(date.getUTCDate()).padStart(2, '0')
}
