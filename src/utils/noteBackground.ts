/**
 * 从页面截图推断背景网格 / 横线参数。
 *
 * 背景三项（底色 / 网格 / 横线）原本都存在 header.bin 里，但新版云笔记的 App 端
 * 不再上传 header.bin，只剩 screenshot.png 可依据，于是只能反向推断：
 *   - 底色：全图颜色的众数（网格线与笔迹都是少数派）；
 *   - 线  ：利用「网格线在全页严格等距、且明显比笔迹细」这一特征，
 *           在多条扫描线上找等距窄线并投票，以此把网格和笔迹区分开；
 *   - 交错：竖线也满足同一组参数时视为网格，否则只画横线。
 * 结果写入合成 header.bin 的 field 13，由 board.js 渲染成背景线。
 */

export interface BgLines {
  /** 0xAARRGGBB（int32） */
  color: number
  /** 线间距（画布像素） */
  spacing: number
  /** 线宽（画布像素） */
  width: number
  /** true = 横竖交错网格；false = 仅横线 */
  cross: boolean
}

/** 检测用的最长边（缩图后检测，够分辨几十像素的周期） */
const MAX_EDGE = 800
/** 与底色的色差阈值，超过视为"墨" */
const INK_TOL = 12

/** 出现次数最多的值 */
function mode(arr: number[]): number {
  const m = new Map<number, number>()
  for (const v of arr) m.set(v, (m.get(v) || 0) + 1)
  let best = arr[0], n = -1
  for (const [v, c] of m) if (c > n) { n = c; best = v }
  return best
}

/** 全图颜色众数（抽样统计，避开逐像素开销） */
function dominantColor(px: Uint8ClampedArray): [number, number, number] {
  const m = new Map<number, number>()
  for (let i = 0; i < px.length; i += 16) {
    const k = (px[i] << 16) | (px[i + 1] << 8) | px[i + 2]
    m.set(k, (m.get(k) || 0) + 1)
  }
  let bk = 0, bn = -1
  for (const [k, n] of m) if (n > bn) { bn = n; bk = k }
  return [(bk >> 16) & 255, (bk >> 8) & 255, bk & 255]
}

interface LineParams { gap: number; width: number; r: number; g: number; b: number; n: number }

/**
 * 在若干条等距扫描线上寻找"等距窄线"，返回票数最高的那组参数。
 * @param horizontal true = 扫水平线找横线；false = 扫竖直线找竖线
 */
function detectLines(
  w: number,
  h: number,
  inkAt: (x: number, y: number) => boolean,
  px: Uint8ClampedArray,
  horizontal: boolean
): LineParams | null {
  const len = horizontal ? w : h
  const lanes = horizontal ? h : w
  const votes = new Map<string, LineParams>()
  const LANES = 9

  for (let li = 1; li <= LANES; li++) {
    const lane = Math.round((lanes * li) / (LANES + 1))
    if (lane < 1 || lane >= lanes) continue
    // 连续墨迹段
    const segs: { s: number; e: number }[] = []
    let s = -1
    for (let i = 0; i <= len; i++) {
      const ink = i < len && (horizontal ? inkAt(i, lane) : inkAt(lane, i))
      if (ink && s < 0) s = i
      if (!ink && s >= 0) { segs.push({ s, e: i }); s = -1 }
    }
    if (segs.length < 4) continue                     // 太少：多半是笔迹
    const gaps: number[] = []
    for (let i = 1; i < segs.length; i++) gaps.push(segs[i].s - segs[i - 1].s)
    const widths = segs.map((v) => v.e - v.s)
    const gap = mode(gaps)
    const width = mode(widths)
    if (!(gap >= 6 && width >= 1)) continue
    if (width > gap * 0.5) continue                    // 过粗：不是网格线
    // 等距校验：至少七成间隔贴近众数
    const tol = Math.max(1, gap * 0.15)
    if (gaps.filter((g) => Math.abs(g - gap) <= tol).length / gaps.length < 0.7) continue
    // 取中间那条线的中心像素作为线色（避开抗锯齿边缘）
    const mid = segs[segs.length >> 1]
    const c = (mid.s + mid.e) >> 1
    const o = ((horizontal ? lane : c) * w + (horizontal ? c : lane)) * 4
    const key = gap + 'x' + width
    const hit = votes.get(key)
    if (hit) hit.n++
    else votes.set(key, { gap, width, r: px[o], g: px[o + 1], b: px[o + 2], n: 1 })
  }

  let best: LineParams | null = null
  for (const v of votes.values()) if (!best || v.n > best.n) best = v
  return best
}

/**
 * 推断背景线参数；没有网格/横线时返回 null（调用方按纯色背景处理）。
 * @param img 已加载完成的页面截图
 */
export function detectBgLines(img: HTMLImageElement): BgLines | null {
  const sw = img.naturalWidth
  const sh = img.naturalHeight
  if (!(sw > 16 && sh > 16)) return null

  const scale = Math.min(1, MAX_EDGE / Math.max(sw, sh))
  const w = Math.max(16, Math.round(sw * scale))
  const h = Math.max(16, Math.round(sh * scale))

  let px: Uint8ClampedArray
  try {
    const cv = document.createElement('canvas')
    cv.width = w
    cv.height = h
    const cx = cv.getContext('2d', { willReadFrequently: true })
    if (!cx) return null
    cx.drawImage(img, 0, 0, w, h)
    px = cx.getImageData(0, 0, w, h).data
  } catch {
    return null                                      // 跨域等，放弃推断
  }

  const bg = dominantColor(px)
  const inkAt = (x: number, y: number) => {
    const o = (y * w + x) * 4
    return Math.abs(px[o] - bg[0]) + Math.abs(px[o + 1] - bg[1]) + Math.abs(px[o + 2] - bg[2]) > INK_TOL
  }

  const row = detectLines(w, h, inkAt, px, true)
  if (!row) return null                              // 连横线都没有 → 纯色背景
  const col = detectLines(w, h, inkAt, px, false)
  const tol = Math.max(1, row.gap * 0.15)
  const cross = !!col && Math.abs(col.gap - row.gap) <= tol

  return {
    color: ((255 << 24) | (row.r << 16) | (row.g << 8) | row.b) | 0,
    spacing: Math.round(row.gap / scale),
    width: Math.round((row.width / scale) * 10) / 10,
    cross
  }
}
