/**
 * 把 board.js 产出的 SVG 以**矢量**方式绘入 jsPDF（高清 PDF 导出）。
 *
 * 只覆盖查看器实际会生成的元素，避免引入完整 SVG 渲染引擎：
 *   svg / g(transform) / rect / path / circle / ellipse / polygon / text(tspan) / image
 *
 * 坐标处理：在 JS 侧自行累积 CTM 并换算到 PDF 用户空间，
 * 因此不依赖 jsPDF 的图形状态栈，路径仍保持矢量（含二次/三次贝塞尔）。
 */
import type { jsPDF } from 'jspdf'

/** SVG 2D 变换矩阵 [a b c d e f]，对应 x' = a·x + c·y + e, y' = b·x + d·y + f */
type Mat = [number, number, number, number, number, number]
interface Rgba { r: number; g: number; b: number; a: number }

const IDENT: Mat = [1, 0, 0, 1, 0, 0]
const NAMED: Record<string, [number, number, number]> = {
  black: [0, 0, 0], white: [255, 255, 255], red: [255, 0, 0], green: [0, 128, 0],
  blue: [0, 0, 255], gray: [128, 128, 128], grey: [128, 128, 128], yellow: [255, 255, 0]
}

/* ---------------- 矩阵 ---------------- */

function mul(m: Mat, n: Mat): Mat {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5]
  ]
}
function apply(m: Mat, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]
}
/** 近似缩放系数：用于线宽与字号（均匀缩放时精确） */
function scaleOf(m: Mat): number {
  const d = Math.abs(m[0] * m[3] - m[1] * m[2])
  return d > 0 ? Math.sqrt(d) : 1
}

function parseTransform(s: string | null): Mat {
  if (!s) return IDENT
  let out: Mat = IDENT
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g
  let mm: RegExpExecArray | null
  while ((mm = re.exec(s))) {
    const n = (mm[2].match(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) || []).map(Number)
    let t: Mat = IDENT
    switch (mm[1]) {
      case 'matrix':
        if (n.length >= 6) t = [n[0], n[1], n[2], n[3], n[4], n[5]]
        break
      case 'translate':
        t = [1, 0, 0, 1, n[0] || 0, n[1] || 0]
        break
      case 'scale':
        t = [n[0] ?? 1, 0, 0, n[1] ?? n[0] ?? 1, 0, 0]
        break
      case 'rotate': {
        const a = ((n[0] || 0) * Math.PI) / 180
        const c = Math.cos(a), si = Math.sin(a)
        t = [c, si, -si, c, 0, 0]
        if (n.length >= 3) {
          t = mul([1, 0, 0, 1, n[1], n[2]], mul(t, [1, 0, 0, 1, -n[1], -n[2]]))
        }
        break
      }
      case 'skewX':
        t = [1, 0, Math.tan(((n[0] || 0) * Math.PI) / 180), 1, 0, 0]
        break
      case 'skewY':
        t = [1, Math.tan(((n[0] || 0) * Math.PI) / 180), 0, 1, 0, 0]
        break
    }
    out = mul(out, t)
  }
  return out
}

/* ---------------- 颜色 / 样式 ---------------- */

function parseColor(v: string | null | undefined): Rgba | null {
  if (!v) return null
  const s = v.trim().toLowerCase()
  if (!s || s === 'none' || s === 'transparent') return null
  if (s[0] === '#') {
    const h = s.slice(1)
    const p = h.length === 3
      ? [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)]
      : [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
    if (p.some(Number.isNaN)) return null
    return { r: p[0], g: p[1], b: p[2], a: 1 }
  }
  const m = /rgba?\(([^)]+)\)/.exec(s)
  if (m) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number)
    if (p.length < 3 || p.slice(0, 3).some(Number.isNaN)) return null
    return { r: p[0] | 0, g: p[1] | 0, b: p[2] | 0, a: p.length > 3 && !Number.isNaN(p[3]) ? p[3] : 1 }
  }
  const nm = NAMED[s]
  return nm ? { r: nm[0], g: nm[1], b: nm[2], a: 1 } : null
}

/** 取属性：优先同名 attribute，其次内联 style */
function attr(el: Element, name: string): string | null {
  const a = el.getAttribute(name)
  if (a != null && a !== '') return a
  const st = (el as HTMLElement).style
  if (st) {
    const v = st.getPropertyValue(name)
    if (v) return v
  }
  const inline = el.getAttribute('style')
  if (inline) {
    const m = new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`, 'i').exec(inline)
    if (m) return m[1].trim()
  }
  return null
}
function num(el: Element, name: string, def = 0): number {
  const v = attr(el, name)
  if (v == null) return def
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : def
}
function opacityOf(el: Element, name: string, def: number): number {
  const v = attr(el, name)
  if (v == null) return def
  const n = parseFloat(v) > 1 ? parseFloat(v) / 100 : parseFloat(v)
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : def
}

/** SVG stroke-linecap 取值顺序（对应 PDF：0 butt / 1 round / 2 square） */
const LINE_CAP = ['butt', 'round', 'square'] as const
/** SVG stroke-linejoin 取值顺序（对应 PDF：0 miter / 1 round / 2 bevel） */
const LINE_JOIN = ['miter', 'round', 'bevel'] as const

interface Style {
  stroke: Rgba | null
  fill: Rgba | null
  lineWidth: number
  opacity: number
  /** 0 butt / 1 round / 2 square（SVG 默认 butt） */
  lineCap: number
  /** 0 miter / 1 round / 2 bevel（SVG 默认 miter） */
  lineJoin: number
  /** 尖角上限（SVG 默认 4；PDF 默认 10，写死会炸出长尖刺） */
  miterLimit: number
  /** 虚线样式（已按缩放换算）；null 表示实线 */
  dash: number[] | null
}

function parseDash(v: string | null, scale: number): number[] | null {
  if (!v || v === 'none') return null
  const n = v
    .split(/[\s,]+/)
    .map(parseFloat)
    .filter((x) => Number.isFinite(x) && x >= 0)
    .map((x) => x * scale)
    .filter((x) => x > 0)
  return n.length ? n : null
}

function styleOf(el: Element, m: Mat): Style {
  const stroke = parseColor(attr(el, 'stroke'))
  if (stroke) stroke.a *= opacityOf(el, 'stroke-opacity', 1)
  const fill = parseColor(attr(el, 'fill'))
  if (fill) fill.a *= opacityOf(el, 'fill-opacity', 1)
  const s = scaleOf(m)
  const cap = (attr(el, 'stroke-linecap') || 'butt').toLowerCase()
  const join = (attr(el, 'stroke-linejoin') || 'miter').toLowerCase()
  return {
    stroke,
    fill,
    lineWidth: Math.max(0.01, num(el, 'stroke-width', 1) * s),
    opacity: opacityOf(el, 'opacity', 1),
    lineCap: Math.max(0, (LINE_CAP as readonly string[]).indexOf(cap)),
    lineJoin: Math.max(0, (LINE_JOIN as readonly string[]).indexOf(join)),
    miterLimit: Math.max(1, num(el, 'stroke-miterlimit', 4)),
    dash: parseDash(attr(el, 'stroke-dasharray'), s)
  }
}

/* ---------------- path d 解析 ---------------- */

interface Seg { c: string; v: number[] }
function parsePathData(d: string): Seg[] {
  const out: Seg[] = []
  const re = /([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(d))) {
    const v = (m[2].match(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) || []).map(Number)
    out.push({ c: m[1], v })
  }
  return out
}

/** 二次贝塞尔 → 三次 */
function quadToCubic(x0: number, y0: number, qx: number, qy: number, x1: number, y1: number): number[] {
  return [
    x0 + (2 / 3) * (qx - x0), y0 + (2 / 3) * (qy - y0),
    x1 + (2 / 3) * (qx - x1), y1 + (2 / 3) * (qy - y1),
    x1, y1
  ]
}

/** 绘制一条 SVG path（保持矢量） */
function drawPath(pdf: jsPDF, segs: Seg[], m: Mat, st: Style): boolean {
  let cx = 0, cy = 0, sx = 0, sy = 0
  let lastC: [number, number] | null = null   // 上一段三次曲线的第二控制点（S 用）
  let lastQ: [number, number] | null = null   // 上一段二次曲线的控制点（T 用）
  let any = false
  const P = (x: number, y: number) => apply(m, x, y)

  const moveTo = (x: number, y: number) => { const [a, b] = P(x, y); pdf.moveTo(a, b); any = true }
  const lineTo = (x: number, y: number) => { const [a, b] = P(x, y); pdf.lineTo(a, b) }
  const cubic = (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) => {
    const [a, b] = P(x1, y1), [c, d] = P(x2, y2), [e, f] = P(x3, y3)
    pdf.curveTo(a, b, c, d, e, f)
  }

  for (const { c, v } of segs) {
    const rel = c >= 'a' && c <= 'z'
    const C = c.toUpperCase()
    if (C === 'Z') { pdf.close(); cx = sx; cy = sy; lastC = lastQ = null; continue }
    let i = 0
    while (i < v.length || (C === 'Z' && i === 0)) {
      switch (C) {
        case 'M': {
          const x = rel ? cx + v[i] : v[i], y = rel ? cy + v[i + 1] : v[i + 1]
          cx = sx = x; cy = sy = y
          moveTo(x, y)
          i += 2
          lastC = lastQ = null
          // 后续坐标按 lineto 处理
          while (i + 1 < v.length) {
            const lx = rel ? cx + v[i] : v[i], ly = rel ? cy + v[i + 1] : v[i + 1]
            cx = lx; cy = ly
            lineTo(lx, ly)
            i += 2
          }
          break
        }
        case 'L': {
          const x = rel ? cx + v[i] : v[i], y = rel ? cy + v[i + 1] : v[i + 1]
          cx = x; cy = y
          lineTo(x, y)
          i += 2
          lastC = lastQ = null
          break
        }
        case 'H': {
          const x = rel ? cx + v[i] : v[i]
          cx = x
          lineTo(x, cy)
          i += 1
          lastC = lastQ = null
          break
        }
        case 'V': {
          const y = rel ? cy + v[i] : v[i]
          cy = y
          lineTo(cx, y)
          i += 1
          lastC = lastQ = null
          break
        }
        case 'C': {
          const x1 = rel ? cx + v[i] : v[i], y1 = rel ? cy + v[i + 1] : v[i + 1]
          const x2 = rel ? cx + v[i + 2] : v[i + 2], y2 = rel ? cy + v[i + 3] : v[i + 3]
          const x3 = rel ? cx + v[i + 4] : v[i + 4], y3 = rel ? cy + v[i + 5] : v[i + 5]
          cubic(x1, y1, x2, y2, x3, y3)
          lastC = [x2, y2]; lastQ = null
          cx = x3; cy = y3
          i += 6
          break
        }
        case 'S': {
          const x1 = lastC ? 2 * cx - lastC[0] : cx, y1 = lastC ? 2 * cy - lastC[1] : cy
          const x2 = rel ? cx + v[i] : v[i], y2 = rel ? cy + v[i + 1] : v[i + 1]
          const x3 = rel ? cx + v[i + 2] : v[i + 2], y3 = rel ? cy + v[i + 3] : v[i + 3]
          cubic(x1, y1, x2, y2, x3, y3)
          lastC = [x2, y2]; lastQ = null
          cx = x3; cy = y3
          i += 4
          break
        }
        case 'Q': {
          const qx = rel ? cx + v[i] : v[i], qy = rel ? cy + v[i + 1] : v[i + 1]
          const x1 = rel ? cx + v[i + 2] : v[i + 2], y1 = rel ? cy + v[i + 3] : v[i + 3]
          const cc = quadToCubic(cx, cy, qx, qy, x1, y1)
          cubic(cc[0], cc[1], cc[2], cc[3], cc[4], cc[5])
          lastQ = [qx, qy]; lastC = null
          cx = x1; cy = y1
          i += 4
          break
        }
        case 'T': {
          const qx = lastQ ? 2 * cx - lastQ[0] : cx, qy = lastQ ? 2 * cy - lastQ[1] : cy
          const x1 = rel ? cx + v[i] : v[i], y1 = rel ? cy + v[i + 1] : v[i + 1]
          const cc = quadToCubic(cx, cy, qx, qy, x1, y1)
          cubic(cc[0], cc[1], cc[2], cc[3], cc[4], cc[5])
          lastQ = [qx, qy]; lastC = null
          cx = x1; cy = y1
          i += 2
          break
        }
        case 'A': {
          // 圆弧：简化为直线连到终点（board.js 不使用 A 命令）
          const x1 = rel ? cx + v[i + 5] : v[i + 5], y1 = rel ? cy + v[i + 6] : v[i + 6]
          cx = x1; cy = y1
          lineTo(x1, y1)
          i += 7
          lastC = lastQ = null
          break
        }
        default:
          i = v.length
      }
      if (i >= v.length) break
    }
  }

  if (!any) return false
  if (st.fill && st.stroke) pdf.fillStroke()
  else if (st.fill) pdf.fill()
  else if (st.stroke) pdf.stroke()
  else pdf.discardPath()
  return true
}

/**
 * 图形状态缓存。
 * 交叉/接合/虚线这些设置对每条路径都发一次会显著增大体积，
 * 缓存后只在变化时下发；每次绘制入口重置，保证不会漏设。
 */
const gsSent = { cap: -1, join: -1, miter: -1, dash: '\u0000', font: '\u0000' }

/** 切换字体（带缓存：逐段文本重复 setFont 会明显增大体积） */
function useFont(pdf: jsPDF, name: string): void {
  if (gsSent.font === name) return
  pdf.setFont(name, 'normal')
  gsSent.font = name
}

function resetGraphicsStateCache(): void {
  gsSent.cap = -1
  gsSent.join = -1
  gsSent.miter = -1
  gsSent.font = '\u0000'
  gsSent.dash = '\u0000'
}

/** 描边样式（颜色 / 线宽 / 线端 / 接合 / 尖角上限 / 虚线 / 透明度）写入 PDF 图形状态 */
function applyStyle(pdf: jsPDF, st: Style): void {
  if (st.stroke) pdf.setDrawColor(st.stroke.r, st.stroke.g, st.stroke.b)
  if (st.fill) pdf.setFillColor(st.fill.r, st.fill.g, st.fill.b)
  pdf.setLineWidth(st.lineWidth)
  // SVG 的笔触常带 stroke-linecap/linejoin="round"；PDF 默认是 butt + miter，
  // 不显式下发会让圆头笔触变成尖角，急转弯处还会因 miterlimit=10 炸出长尖刺。
  if (st.lineCap !== gsSent.cap) { pdf.setLineCap(LINE_CAP[st.lineCap] || 'butt'); gsSent.cap = st.lineCap }
  if (st.lineJoin !== gsSent.join) { pdf.setLineJoin(LINE_JOIN[st.lineJoin] || 'miter'); gsSent.join = st.lineJoin }
  if (st.miterLimit !== gsSent.miter) { pdf.setLineMiterLimit(st.miterLimit); gsSent.miter = st.miterLimit }
  const dashKey = st.dash ? st.dash.join(',') : ''
  if (dashKey !== gsSent.dash) { pdf.setLineDashPattern(st.dash || [], 0); gsSent.dash = dashKey }
  const sa = st.stroke ? st.stroke.a : 1
  const fa = st.fill ? st.fill.a : 1
  if (sa < 0.999 && fa >= 0.999) applyOpacity(pdf, sa, true)
  else if (fa < 0.999) applyOpacity(pdf, Math.min(fa, sa), false)
}

/** 设置透明度（jsPDF 只暴露 opacity / stroke-opacity；不可用时忽略，不影响几何正确性） */
function applyOpacity(pdf: jsPDF, a: number, strokeOnly = false): void {
  if (a >= 0.999) return
  try {
    const G = (pdf as unknown as { GState?: new (g: Record<string, number>) => unknown }).GState
    if (!G) return
    pdf.setGState(new G(strokeOnly ? { 'stroke-opacity': a } : { opacity: a }) as never)
  } catch {
    /* ignore */
  }
}

/* ---------------- 文本：CJK 走画布栅格化，其余保持矢量字 ---------------- */

const CJK_RE = /[\u2e80-\u9fff\u3000-\u303f\uf900-\ufaff\uff00-\uffef]/

interface RasterText { data: string; w: number; h: number }
function rasterizeText(text: string, fontSize: number, color: Rgba): RasterText | null {
  if (typeof document === 'undefined') return null
  const dpr = 4
  const px = fontSize * dpr
  const font = `${px}px "PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif`
  const cv = document.createElement('canvas')
  const probe = cv.getContext('2d')
  if (!probe) return null
  probe.font = font
  const wpx = Math.max(1, Math.ceil(probe.measureText(text).width))
  const hpx = Math.ceil(px * 1.32)
  cv.width = wpx
  cv.height = hpx
  const ctx = cv.getContext('2d')
  if (!ctx) return null
  ctx.font = font
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = `rgba(${color.r},${color.g},${color.b},${color.a})`
  ctx.fillText(text, 0, px)   // 基线对齐：顶部留出 ascent
  return { data: cv.toDataURL('image/png'), w: wpx / dpr, h: hpx / dpr }
}

/* ---------------- 图片：WebP 等 jsPDF 不支持的格式先转 PNG ---------------- */

async function toPngDataUrl(dataUrl: string): Promise<string | null> {
  if (typeof document === 'undefined') return null
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      try {
        const cv = document.createElement('canvas')
        cv.width = img.naturalWidth
        cv.height = img.naturalHeight
        const ctx = cv.getContext('2d')
        if (!ctx) return resolve(null)
        ctx.drawImage(img, 0, 0)
        resolve(cv.toDataURL('image/png'))
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = dataUrl
  })
}

/** 矩阵是否含旋转 / 斜切（此时轴对齐包围盒会失真） */
function hasRotation(m: Mat): boolean {
  return Math.abs(m[1]) > 1e-6 || Math.abs(m[2]) > 1e-6
}

/** 从 dataURL 载入图片（带缓存，同一张图只解一次） */
const imgCache = new Map<string, Promise<HTMLImageElement | null>>()
function loadImage(src: string): Promise<HTMLImageElement | null> {
  let job = imgCache.get(src)
  if (!job) {
    job = new Promise((resolve) => {
      if (typeof Image === 'undefined') return resolve(null)
      const im = new Image()
      im.onload = () => resolve(im)
      im.onerror = () => resolve(null)
      im.src = src
    })
    imgCache.set(src, job)
  }
  return job
}

/**
 * 把「带旋转/斜切的图片」按给定矩阵烘焙成轴对齐位图。
 *
 * PDF 的图片只能以轴对齐矩形嵌入（addImage 没有变换参数），若直接把旋转后的四角
 * 取包围盒，宽高会被算成本地框在对角方向的投影——本笔记里就出现过 1760×880 的图片
 * 算成 617×(-70)、最终被拉成竖条的问题。这里先在画布上按原矩阵绘制一次，
 * 再把结果作为普通位图嵌入，等效于 SVG 的旋转渲染。
 *
 * @param m 元素 → PDF 用户空间的完整矩阵（含视图缩放）
 * @returns 轴对齐位图及其在 PDF 中的落位；失败返回 null
 */
async function bakeTransformedImage(
  href: string,
  m: Mat,
  w: number,
  h: number
): Promise<{ data: string; x: number; y: number; w: number; h: number } | null> {
  if (typeof document === 'undefined') return null
  const img = await loadImage(href)
  if (!img || !img.naturalWidth) return null

  // 四角在 PDF 空间里的包围盒
  const cs = [
    apply(m, 0, 0),
    apply(m, w, 0),
    apply(m, w, h),
    apply(m, 0, h)
  ]
  const minX = Math.min(...cs.map((c) => c[0]))
  const minY = Math.min(...cs.map((c) => c[1]))
  const bw = Math.max(...cs.map((c) => c[0])) - minX
  const bh = Math.max(...cs.map((c) => c[1])) - minY
  if (!(bw > 0.5 && bh > 0.5)) return null

  // 采样倍率：尽量贴近图片原始像素密度，最多 4 倍，避免过度放大
  const dpr = Math.min(4, Math.max(1, img.naturalWidth / bw))
  const cv = document.createElement('canvas')
  cv.width = Math.max(1, Math.round(bw * dpr))
  cv.height = Math.max(1, Math.round(bh * dpr))
  const ctx = cv.getContext('2d')
  if (!ctx) return null
  // 元素坐标 → 位图坐标：(平移 - min) × dpr
  ctx.setTransform(m[0] * dpr, m[1] * dpr, m[2] * dpr, m[3] * dpr, (m[4] - minX) * dpr, (m[5] - minY) * dpr)
  ctx.drawImage(img, 0, 0, w, h)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  return { data: cv.toDataURL('image/png'), x: minX, y: minY, w: bw, h: bh }
}

/* ---------------- 主入口 ---------------- */

export interface SvgDrawBox { x: number; y: number; w: number; h: number }

export interface SvgPdfOptions {
  /**
   * 已注册进 jsPDF 的中文字体名（见 utils/pdfFont）。
   * 提供后中文以矢量文字写入；缺失时中文回退为位图，保证可读。
   */
  cjkFont?: string
}

/**
 * 把 SVG 以矢量绘制到当前 PDF 页的指定矩形内（等比居中）。
 * @returns 实际绘制出的图元数量；0 表示没画出东西（调用方可据此降级到截图）
 */
export async function drawSvgToPdf(
  pdf: jsPDF,
  svgText: string,
  box: SvgDrawBox,
  options?: SvgPdfOptions
): Promise<number> {
  if (typeof DOMParser === 'undefined') return 0
  let doc: Document
  try {
    doc = new DOMParser().parseFromString(svgText, 'image/svg+xml')
  } catch {
    return 0
  }
  const root = doc.documentElement
  if (!root || root.nodeName.toLowerCase() !== 'svg') return 0
  if (root.getElementsByTagName('parsererror').length) return 0
  return drawSvgRoot(pdf, root, box, options)
}

/**
 * 直接绘制一棵 SVG 根节点（与 drawSvgToPdf 逻辑一致，便于脱离 DOMParser 复用/测试）。
 * @returns 绘制出的图元数量；0 表示没画出东西
 */
export async function drawSvgRoot(
  pdf: jsPDF,
  root: Element,
  box: SvgDrawBox,
  options?: SvgPdfOptions
): Promise<number> {
  resetGraphicsStateCache()
  const W = num(root, 'width', 0) || 0
  const H = num(root, 'height', 0) || 0
  if (!(W > 0 && H > 0)) return 0

  // 画布 → PDF：等比缩放并居中
  const s = Math.min(box.w / W, box.h / H)
  const view: Mat = [s, 0, 0, s, box.x + (box.w - W * s) / 2, box.y + (box.h - H * s) / 2]

  let painted = 0

  const walk = async (el: Element, ctm: Mat): Promise<void> => {
    const local = mul(ctm, parseTransform(el.getAttribute('transform')))
    const tag = el.nodeName.toLowerCase()
    const st = styleOf(el, local)

    switch (tag) {
      case 'g': case 'svg': {
        for (const ch of Array.from(el.children)) await walk(ch, local)
        break
      }
      case 'rect': {
        const x = num(el, 'x'), y = num(el, 'y')
        const w = num(el, 'width'), h = num(el, 'height')
        if (!(w > 0 && h > 0)) break
        const [x0, y0] = apply(local, x, y)
        const [x1, y1] = apply(local, x + w, y + h)
        const fill = st.fill
        if (fill) {
          pdf.setFillColor(fill.r, fill.g, fill.b)
          applyOpacity(pdf, fill.a)
          pdf.rect(x0, y0, x1 - x0, y1 - y0, 'F')
          painted++
        }
        if (st.stroke) {
          pdf.setDrawColor(st.stroke.r, st.stroke.g, st.stroke.b)
          pdf.setLineWidth(st.lineWidth)
          pdf.rect(x0, y0, x1 - x0, y1 - y0, 'S')
          painted++
        }
        break
      }
      case 'path': {
        const d = el.getAttribute('d')
        if (!d) break
        if (!st.fill && !st.stroke) break
        applyStyle(pdf, st)
        if (drawPath(pdf, parsePathData(d), local, st)) painted++
        break
      }
      case 'circle': {
        const [x, y] = apply(local, num(el, 'cx'), num(el, 'cy'))
        const r = num(el, 'r') * scaleOf(local)
        if (!(r > 0)) break
        if (st.fill) {
          pdf.setFillColor(st.fill.r, st.fill.g, st.fill.b)
          applyOpacity(pdf, st.fill.a)
          pdf.circle(x, y, r, 'F')
          painted++
        }
        if (st.stroke) {
          pdf.setDrawColor(st.stroke.r, st.stroke.g, st.stroke.b)
          pdf.setLineWidth(st.lineWidth)
          pdf.circle(x, y, r, 'S')
          painted++
        }
        break
      }
      case 'ellipse': {
        const [x, y] = apply(local, num(el, 'cx'), num(el, 'cy'))
        const rx = num(el, 'rx') * scaleOf(local)
        const ry = num(el, 'ry') * scaleOf(local)
        if (!(rx > 0 && ry > 0)) break
        if (st.fill) {
          pdf.setFillColor(st.fill.r, st.fill.g, st.fill.b)
          applyOpacity(pdf, st.fill.a)
          pdf.ellipse(x, y, rx, ry, 'F')
          painted++
        }
        if (st.stroke) {
          pdf.setDrawColor(st.stroke.r, st.stroke.g, st.stroke.b)
          pdf.setLineWidth(st.lineWidth)
          pdf.ellipse(x, y, rx, ry, 'S')
          painted++
        }
        break
      }
      case 'polygon': case 'polyline': {
        const pts = (el.getAttribute('points') || '')
          .match(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi)
          ?.map(Number) || []
        if (pts.length < 4) break
        applyStyle(pdf, st)
        const [fx, fy] = apply(local, pts[0], pts[1])
        pdf.moveTo(fx, fy)
        for (let i = 2; i + 1 < pts.length; i += 2) {
          const [px, py] = apply(local, pts[i], pts[i + 1])
          pdf.lineTo(px, py)
        }
        if (tag === 'polygon') pdf.close()
        if (st.fill && st.stroke) pdf.fillStroke()
        else if (st.fill) pdf.fill()
        else if (st.stroke) pdf.stroke()
        else pdf.discardPath()
        painted++
        break
      }
      case 'text': {
        const size = num(el, 'font-size', 12) * scaleOf(local)
        const fill = st.fill || { r: 0, g: 0, b: 0, a: 1 }
        if (!(size > 0)) break
        const spans = el.getElementsByTagName('tspan').length
          ? Array.from(el.getElementsByTagName('tspan'))
          : [el]
        for (const sp of spans) {
          const content = (sp.textContent || '').replace(/\s+/g, ' ')
          if (!content.trim()) continue
          const tx = num(sp, 'x', num(el, 'x'))
          const ty = num(sp, 'y', num(el, 'y'))
          const [px, py] = apply(local, tx, ty)
          const isCjk = CJK_RE.test(content)
          const cjkFont = options?.cjkFont
          if (!isCjk || cjkFont) {
            // 矢量文字：中文用嵌入字型，拉丁字符用内置 Helvetica
            useFont(pdf, isCjk ? (cjkFont as string) : 'helvetica')
            pdf.setFontSize(size)
            pdf.setTextColor(fill.r, fill.g, fill.b)
            pdf.text(content, px, py, { baseline: 'alphabetic' })
          } else {
            // 中文字体不可用（加载失败）：栅格化兜底，至少保证可读
            const img = rasterizeText(content, size, fill)
            if (img) {
              pdf.addImage(img.data, 'PNG', px, py - size, img.w, img.h)
            } else {
              useFont(pdf, 'helvetica')
              pdf.setFontSize(size)
              pdf.setTextColor(fill.r, fill.g, fill.b)
              pdf.text(content, px, py, { baseline: 'alphabetic' })
            }
          }
          painted++
        }
        break
      }
      case 'image': {
        let href = el.getAttribute('xlink:href') || el.getAttribute('href')
        if (!href || !href.startsWith('data:')) break
        const x = num(el, 'x'), y = num(el, 'y')
        const w = num(el, 'width'), h = num(el, 'height')
        if (!(w > 0 && h > 0)) break

        // 图片可被旋转（本笔记里就有一张斜放的卡片）：此时轴对齐包围盒的宽高会变成
        // 对角投影（实测 1760×880 被算成 617×-70），必须先按矩阵烘焙成位图再嵌入。
        if (hasRotation(local)) {
          const baked = await bakeTransformedImage(href, local, w, h)
          if (baked) {
            pdf.addImage(baked.data, 'PNG', baked.x, baked.y, baked.w, baked.h)
            painted++
            break
          }
        }

        const [x0, y0] = apply(local, x, y)
        const [x1, y1] = apply(local, x + w, y + h)
        const fmt = /^data:image\/(\w+)/i.exec(href)?.[1]?.toLowerCase() || 'png'
        let type = fmt === 'jpg' || fmt === 'jpeg' ? 'JPEG' : fmt.toUpperCase()
        if (fmt === 'webp' || fmt === 'gif' || fmt === 'bmp' || fmt === 'avif') {
          // jsPDF 只稳定支持 JPEG/PNG：其它格式先用画布转码
          const png = await toPngDataUrl(href)
          if (png) { href = png; type = 'PNG' }
        }
        try {
          pdf.addImage(href, type, x0, y0, x1 - x0, y1 - y0)
          painted++
        } catch {
          // 仍失败则跳过该图，不让整页导出失败
        }
        break
      }
      default:
        // 未支持的元素：递归它的子节点，尽量不丢内容
        for (const ch of Array.from(el.children)) await walk(ch, local)
    }
  }

  await walk(root, view)
  return painted
}
