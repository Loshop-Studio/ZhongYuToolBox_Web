/* eslint-disable */
// 画板生成器：按 zykj-board-format-spec.md 写出 zip（或 {path, blob} 列表）。
import { cat, fi, fl, fs, fb, fo, E, W, sha256, writeZip } from './writer.js'

export const GRAPH = { ROOT: 0, GROUP: 1, IMAGE: 2, STROKE: 3, BEELINE: 4, TEXT: 5, GEOMETRY: 6 }
export const CMD = { ADD: 1, REMOVE: 2, MATRIX: 3, CHANGE: 4, CUSTOM: 5, AUDIO: 6, CAMERA: 7, CAMERA_MATRIX: 8, CONFIG: 9, STOP: 10, CURSOR: 11, REBUILD: 12 }
const FLT = 3.4028234663852886e38
const ID = [1, 0, 0, 1, 0, 0]                                       // [scaleX, skewY, skewX, scaleY, transX, transY]（= SVG matrix(a b c d e f)）
const mul = (A, B) => [A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1], A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3], A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]]
const Tr = (x, y) => [1, 0, 0, 1, x, y], Sc = s => [s, 0, 0, s, 0, 0], Ro = r => [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]
const uuid = () => (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16) }))

/** '#rgb' | '#rrggbb' | '#rrggbbaa'（CSS 写法）| 数字（Android ARGB int32） */
export function parseColor(c, d = -16777216) {
  if (c == null) return d
  if (typeof c === 'number') return c | 0
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(String(c).trim())
  if (!m) throw Error('不支持的颜色：' + c)
  let h = m[1]; if (h.length === 3) h = [...h].map(x => x + x).join('')
  return parseInt((h.length === 8 ? h.slice(6) : 'ff') + h.slice(0, 6), 16) | 0
}
async function toBytes(s) {
  if (s instanceof Uint8Array) return s
  if (s instanceof ArrayBuffer) return new Uint8Array(s)
  if (ArrayBuffer.isView(s)) return new Uint8Array(s.buffer, s.byteOffset, s.byteLength)
  if (typeof s === 'string') return new Uint8Array(await (await fetch(s)).arrayBuffer())
  if (s && s.arrayBuffer) return new Uint8Array(await s.arrayBuffer())
  throw Error('需要 Blob / ArrayBuffer / Uint8Array / URL')
}
function imageSize(b) {                                              // PNG / JPEG / GIF / WebP
  const be16 = i => (b[i] << 8) | b[i + 1], le16 = i => b[i] | (b[i + 1] << 8)
  if (b[0] === 0x89 && b[1] === 0x50) return { ext: 'png', w: ((b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19]) >>> 0, h: ((b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23]) >>> 0 }
  if (b[0] === 0xFF && b[1] === 0xD8) { let i = 2; while (i < b.length) { if (b[i] !== 0xFF) break; const m = b[i + 1]; if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return { ext: 'jpg', h: be16(i + 5), w: be16(i + 7) }; i += 2 + be16(i + 2) } }
  if (b[0] === 0x47 && b[1] === 0x49) return { ext: 'gif', w: le16(6), h: le16(8) }
  if (b[0] === 0x52 && b[8] === 0x57) {
    const t = String.fromCharCode(b[12], b[13], b[14], b[15])
    if (t === 'VP8 ') return { ext: 'webp', w: le16(26) & 0x3fff, h: le16(28) & 0x3fff }
    if (t === 'VP8L') return { ext: 'webp', w: 1 + (((b[22] & 0x3f) << 8) | b[21]), h: 1 + (((b[24] & 0xf) << 10) | (b[23] << 2) | ((b[22] & 0xc0) >> 6)) }
    if (t === 'VP8X') return { ext: 'webp', w: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), h: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) }
  }
  return null
}
const audioExt = b => (b[0] === 0x49 && b[1] === 0x44) || (b[0] === 0xFF && (b[1] & 0xE0) === 0xE0 && (b[1] & 6) !== 0) ? 'mp3'
  : b[0] === 0x52 && b[8] === 0x57 ? 'wav' : b[0] === 0x4F && b[1] === 0x67 ? 'ogg' : b[4] === 0x66 && b[5] === 0x74 ? 'm4a' : b[0] === 0x66 && b[1] === 0x4C ? 'flac' : 'mp3'
async function probeDuration(bytes) {
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext
  if (!AC) throw Error('无法自动获取音频时长，请传入 duration（毫秒）')
  const ctx = new AC(); try { return Math.round((await ctx.decodeAudioData(bytes.slice().buffer)).duration * 1000) } finally { ctx.close && ctx.close() }
}

function mkPaint(o = {}, base = {}) {
  const dash = o.dash !== undefined ? o.dash : null
  return {
    width: o.lineWidth ?? base.width ?? 0, color: o.color !== undefined ? parseColor(o.color) : base.color ?? -16777216,
    spacing: dash ? (dash[1] || 0) : base.spacing ?? 0, itemLength: dash ? (dash[0] || 1) : base.itemLength ?? 1,
    style: o.style ?? base.style ?? 1, textSize: o.size ?? o.textSize ?? base.textSize ?? 0
  }
}
const bbox = pts => { const xs = pts.map(p => p.x), ys = pts.map(p => p.y); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] }
const normLine = l => (l ? { color: parseColor(l.color, 0), space: l.space ?? 64, type: l.type === 'staggered' || l.type === 1 ? 1 : 0, width: l.width ?? 0 } : { color: 0, space: 64, type: 0, width: 0 })

class Page {
  constructor(board, o = {}) {
    const b = board.o
    Object.assign(this, { board, W: o.width ?? board.W, H: o.height ?? board.H, id: uuid(), names: {}, cmds: [], acmds: [], res: [], clock: 0, pend: 0, aend: 0, cam: ID, stopped: false, cursorUsed: false })
    this.bg0 = this.bg = parseColor(o.background ?? b.background ?? '#ffffff')
    this.bgLine0 = this.bgLine = normLine(o.backgroundLine ?? b.backgroundLine)
    this.src = { touch: [], matrix: [], file: [], text: [], geometry: [] }
    this.root = this._mk(GRAPH.ROOT, [-FLT, -FLT, FLT, FLT], null)
    this._add(this.root)
  }
  /* ---- 内部 ---- */
  _fn(kind) { return (this.names[kind] ??= `${uuid()}_${kind}.bin`) }
  _mk(type, rect, parent, extra = {}) {
    const n = { id: uuid(), type, rect, m: ID, parent, kids: [], ...extra }
    if (parent) parent.kids.push(n)
    return n
  }
  _n(h) { const n = h && (h.__n || h); if (!n || !n.id) throw Error('无效的图元句柄'); if (n.dead) throw Error('图元已被删除'); return n }
  _peek(delay = 0) { return this.clock + this.pend + delay }
  _cmd(e, data, { delay = 0, duration = 0, isPlay = false } = {}) {
    const start = this._peek(delay)
    this.cmds.push({ delay: this.pend + delay, duration, e, data, isPlay }); this.pend = 0; this.clock = start + duration
    return start
  }
  _gd(n) { return cat(fi(1, n.type), fs(2, n.id), fb(3, W.rectf(n.rect)), fs(4, n.parent ? n.parent.id : ''), fs(5, n.file), fi(6, n.sid)) }
  _add(n, o = {}) { return this._cmd(CMD.ADD, this._gd(n), o) }
  _wm(n) { let m = ID; for (let p = n; p; p = p.parent) m = mul(p.m, m); return m }
  _ts(start) { return this.board.base + start }
  _frames(o, pivot) {
    if (o.matrix) return { dur: 0, fr: [{ t: 0, m: o.matrix }] }
    const dur = o.duration ?? 300, s = o.scale ?? 1, r = ((o.rotate ?? 0) * Math.PI) / 180, dx = o.dx ?? 0, dy = o.dy ?? 0
    const N = Math.max(2, o.frames ?? Math.ceil(dur / 16)), fr = []
    for (let k = 0; k <= N; k++) {
      const p = k / N
      fr.push({ t: Math.round(dur * p), m: mul(Tr(dx * p, dy * p), mul(Tr(pivot.x, pivot.y), mul(Ro(r * p), mul(Sc(s ** p), Tr(-pivot.x, -pivot.y))))) })
    }
    return { dur: fr[fr.length - 1].t - fr[0].t, fr }
  }
  _gesture(frames, delay) {   // 写 matrix.bin 一项，返回 sid 与命令起点
    const start = this._peek(delay), sid = this.src.matrix.length
    this.src.matrix.push(frames.map(f => ({ t: this._ts(start) + f.t, m: f.m })))
    return { sid, start }
  }
  _place(n, x, y, delay = 0) {
    if (!x && !y) return
    const m = Tr(x, y), { sid } = this._gesture([{ t: 0, m }], delay)
    this._cmd(CMD.MATRIX, cat(fb(1, this._gd(n)), fs(4, this._fn('matrix')), fi(5, sid)), { delay })
    n.m = m
  }
  _points(points, o) {
    let pts = points.map(p => (Array.isArray(p) ? { x: p[0], y: p[1], t: p[2] } : { x: p.x, y: p.y, t: p.t }))
    if (!pts.length) throw Error('点集不能为空')
    if (pts.every(p => typeof p.t === 'number')) { const t0 = pts[0].t; pts = pts.map(p => ({ ...p, t: p.t - t0 })) }
    else { const n = pts.length, step = o.duration != null && n > 1 ? o.duration / (n - 1) : o.step ?? 16; pts = pts.map((p, i) => ({ ...p, t: Math.round(i * step) })) }
    return pts
  }
  _touch(pts, paint, start) { const sid = this.src.touch.length; this.src.touch.push({ events: pts.map(p => ({ t: this._ts(start) + p.t, x: p.x, y: p.y })), paint }); return sid }
  _snap(n) {
    const hasPoly = n.type === GRAPH.GEOMETRY && n.geo === 1
    return cat(fs(1, n.id), fi(2, n.type), fb(3, W.rectf(n.rect)), fb(4, W.matrix(n.m)), n.kids.map(k => fb(5, this._snap(k))), fs(6, n.file), fi(7, n.sid),
      n.paint ? fb(9, W.paint(n.paint)) : E, fs(10, n.content), hasPoly ? n.gp.map(p => fb(11, W.pointf(p))) : E)
  }
  _lineCfg(l) { return W.lineConfig(l) }

  /* ---- 时间 ---- */
  /** 下一条命令之前再等待 ms 毫秒（即 delayTime） */
  wait(ms) { this.pend += ms; return this }

  /* ---- 图元 ---- */
  group(o = {}) { const n = this._mk(GRAPH.GROUP, [0, 0, 0, 0], o.parent ? this._n(o.parent) : this.root); this._add(n, { delay: o.delay }); return n }
  async image(src, o = {}) {
    const bytes = await toBytes(src), info = imageSize(bytes)
    if (!info && !(o.width && o.height)) throw Error('无法识别图片尺寸，请传入 width / height')
    const w = o.width ?? info.w, h = o.height ?? info.h, name = `${uuid()}.${info ? info.ext : 'png'}`
    this.res.push({ name: 'res/image/' + name, data: bytes, store: true })
    const sid = this.src.file.length; this.src.file.push({ name, validate: await sha256(bytes) })
    const n = this._mk(GRAPH.IMAGE, [0, 0, w, h], o.parent ? this._n(o.parent) : this.root, { file: this._fn('file'), sid })
    this._add(n, { delay: o.delay }); this._place(n, o.x ?? 0, o.y ?? 0); return n
  }
  stroke(points, o = {}, type = GRAPH.STROKE) {
    const pts = this._points(points, o), dur = pts[pts.length - 1].t
    let parent = o.parent ? this._n(o.parent) : this.root, delay = o.delay
    if (!o.parent && o.group !== false) { parent = this.group({ delay }); delay = 0 }
    const start = this._peek(delay), paint = mkPaint({ lineWidth: 4, ...o })
    const sid = this._touch(pts, paint, start)
    const n = this._mk(type, bbox(pts), parent, { file: this._fn('touch'), sid, paint })
    this._add(n, { delay, duration: dur }); return n
  }
  line(a, b, o = {}) {
    const d = o.duration ?? 200, p = [[...(Array.isArray(a) ? a : [a.x, a.y]), 0], [...(Array.isArray(b) ? b : [b.x, b.y]), d]]
    return this.stroke(p, o, GRAPH.BEELINE)
  }
  text(content, o = {}) {
    const paint = mkPaint({ size: 40, ...o }), sid = this.src.text.length; this.src.text.push({ content, paint })
    const n = this._mk(GRAPH.TEXT, [0, 0, o.width ?? 600, o.height ?? 100], o.parent ? this._n(o.parent) : this.root, { file: this._fn('text'), sid, paint, content })
    this._add(n, { delay: o.delay }); this._place(n, o.x ?? 0, o.y ?? 0); return n
  }
  _geo(type, points, rect, x, y, o) {
    const paint = mkPaint({ lineWidth: 3, ...o }), sid = this.src.geometry.length; this.src.geometry.push({ type, points, paint })
    const n = this._mk(GRAPH.GEOMETRY, rect, o.parent ? this._n(o.parent) : this.root, { file: this._fn('geometry'), sid, paint, geo: type, gp: points })
    this._add(n, { delay: o.delay }); this._place(n, x, y); return n
  }
  oval(o) { return this._geo(0, [], [0, 0, o.width, o.height], o.x ?? 0, o.y ?? 0, o) }
  polygon(points, o = {}) {
    const pts = points.map(p => (Array.isArray(p) ? { x: p[0], y: p[1] } : { x: p.x, y: p.y })), [l, t, r, b] = bbox(pts)
    return this._geo(1, pts.map(p => ({ x: p.x - l, y: p.y - t })), [0, 0, r - l, b - t], l + (o.x ?? 0), t + (o.y ?? 0), o)
  }
  rect(o) { const { x = 0, y = 0, width: w, height: h } = o; return this._geo(1, [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }], [0, 0, w, h], x, y, o) }

  /* ---- 对图元的操作 ---- */
  /** 变换手势：dx/dy 平移，scale 缩放，rotate 旋转（度），pivot 支点（世界坐标，默认图元中心）；或 matrix 单帧直接指定 */
  move(h, o = {}) {
    const n = this._n(h), wm = this._wm(n), cx = (n.rect[0] + n.rect[2]) / 2, cy = (n.rect[1] + n.rect[3]) / 2
    const pv = o.pivot ?? { x: wm[0] * cx + wm[2] * cy + wm[4], y: wm[1] * cx + wm[3] * cy + wm[5] }
    const { dur, fr } = this._frames(o, pv), { sid } = this._gesture(fr, o.delay)
    this._cmd(CMD.MATRIX, cat(fb(1, this._gd(n)), fs(4, this._fn('matrix')), fi(5, sid)), { delay: o.delay, duration: dur })
    n.m = mul(fr[fr.length - 1].m, n.m); return n
  }
  /** 修改属性：content（文字）、color/lineWidth/size/dash（画笔）、width/height（outRect）、points（多边形点集，本地坐标） */
  change(h, o = {}) {
    const n = this._n(h); let rect = null, paint = null, content = null, pts = null
    if (o.width != null || o.height != null) { rect = [0, 0, o.width ?? n.rect[2] - n.rect[0], o.height ?? n.rect[3] - n.rect[1]]; n.rect = rect }
    if (['color', 'lineWidth', 'size', 'textSize', 'dash', 'style'].some(k => o[k] !== undefined)) { n.paint = paint = mkPaint(o, n.paint || {}) }
    if (o.content != null) { n.content = content = o.content }
    if (o.points) { pts = o.points.map(p => (Array.isArray(p) ? { x: p[0], y: p[1] } : p)); n.gp = pts }
    this._cmd(CMD.CHANGE, cat(fs(1, n.id), fi(2, n.type), fo(3, rect && W.rectf(rect)), fs(4, content || ''), fo(5, paint && W.paint(paint)), pts ? pts.map(p => fb(6, W.pointf(p))) : E), { delay: o.delay })
    return n
  }
  remove(h, o = {}) {
    const n = this._n(h); this._cmd(CMD.REMOVE, fb(1, this._gd(n)), { delay: o.delay })
    if (n.parent) n.parent.kids = n.parent.kids.filter(k => k !== n)
    const kill = x => { x.dead = true; x.kids.forEach(kill) }; kill(n)
  }
  /** 用当前完整图元树重置页面（App 里删除/撤销用的就是这条命令） */
  rebuild(o = {}) { this._cmd(CMD.REBUILD, cat(fb(1, this._snap(this.root)), fi(2, this.bg), fb(3, this._lineCfg(this.bgLine))), { delay: o.delay }) }

  /* ---- 画布 / 相机 / 激光笔 ---- */
  config(o = {}) {
    const ob = this.bg, ol = this.bgLine
    if (o.background !== undefined) this.bg = parseColor(o.background)
    if (o.backgroundLine !== undefined) this.bgLine = normLine(o.backgroundLine)
    this._cmd(CMD.CONFIG, cat(fi(1, ob), fi(2, this.bg), fb(3, this._lineCfg(ol)), fb(4, this._lineCfg(this.bgLine))), { delay: o.delay })
  }
  /** 瞬时设置相机：matrix 或 scale/dx/dy */
  camera(o = {}) {
    const m = o.matrix ?? mul(Tr(o.dx ?? 0, o.dy ?? 0), mul(Tr(0, 0), Sc(o.scale ?? 1)))
    this._cmd(CMD.CAMERA, cat(fb(1, W.matrix(this.cam)), fb(2, W.matrix(m))), { delay: o.delay }); this.cam = m
  }
  /** 相机手势（缩放/平移动画），参数同 move，pivot 默认画布中心 */
  cameraMove(o = {}) {
    const { dur, fr } = this._frames(o, o.pivot ?? { x: this.W / 2, y: this.H / 2 }), { sid } = this._gesture(fr, o.delay)
    this._cmd(CMD.CAMERA_MATRIX, cat(fs(3, this._fn('matrix')), fi(4, sid)), { delay: o.delay, duration: dur })
    this.cam = mul(fr[fr.length - 1].m, this.cam)
  }
  /** 激光笔轨迹（🔶 数据来源按 touch.bin 约定，真实 App 的格式未验证） */
  cursor(points, o = {}) {
    const pts = this._points(points, o), start = this._peek(o.delay), sid = this._touch(pts, mkPaint({}), start)
    this.cursorUsed = true
    this._cmd(CMD.CURSOR, cat(fs(1, this._fn('touch')), fi(2, sid)), { delay: o.delay, duration: pts[pts.length - 1].t })
  }
  /** 自定义命令（原样写入 data 字节，查看器忽略） */
  custom(bytes, o = {}) { this._cmd(CMD.CUSTOM, bytes, { delay: o.delay }) }
  stop(o = {}) { this._cmd(CMD.STOP, E, { delay: o.delay }); this.stopped = true }

  /* ---- 音频 ---- */
  /** 加入一段音频。start = 在主时间轴上开始播放的时刻（毫秒，按 _audio.bin 命令链计时）；duration 缺省时在浏览器里自动探测 */
  async audio(src, o = {}) {
    const bytes = await toBytes(src), ext = o.ext || audioExt(bytes), dur = o.duration ?? (await probeDuration(bytes))
    const start = o.start ?? this.aend, delay = start - this.aend
    if (delay < 0) throw Error(`音频起点 ${start}ms 早于上一段音频结束 ${this.aend}ms`)
    const name = `${uuid()}.${ext}`; this.res.push({ name: 'res/audio/' + name, data: bytes, store: true })
    this.acmds.push({ delay, duration: dur, e: CMD.AUDIO, isPlay: true, data: cat(fs(1, name), fi(2, dur)) }); this.aend = start + dur
    return { name, start, duration: dur }
  }

  /* ---- 序列化 ---- */
  async _files(rec) {
    const dir = this.id + '/', out = [], recs = {}, put = async (kind, bytes, group) => {
      const name = this.names[kind] || (this.names[kind] = `${uuid()}_${kind}.bin`)
      out.push({ name: dir + name, data: bytes }); (recs[group] ??= []).push(W.record(name, await sha256(bytes)))
    }
    if (rec && !this.stopped) this.stop()
    const total = Math.max(this.clock, this.aend)
    await put('command', cat(this.cmds.map(c => fb(1, W.command(c)))), 1)
    if (this.acmds.length) await put('audio', cat(this.acmds.map(c => fb(1, W.command(c)))), 2)
    const S = this.src
    if (S.touch.length) await put('touch', cat(S.touch.map(t => fb(1, W.touchInfo(t)))), 3)
    if (S.matrix.length) await put('matrix', cat(S.matrix.map(fr => fb(1, cat(fr.map(f => fb(1, W.matrix(f.m, f.t))))))), 4)
    if (S.file.length) await put('file', cat(S.file.map(f => fb(1, W.fileInfo(f)))), 5)
    if (S.text.length) await put('text', cat(S.text.map(t => fb(1, W.textInfo(t)))), 6)
    if (S.geometry.length) await put('geometry', cat(S.geometry.map(g => fb(1, W.geoInfo(g)))), 7)
    const b = this.board.o, create = this.board.base, mc = { maxHeightTimes: 1, maxWidthTimes: 1, ...(b.moveConfig || {}) }
    const au = a => (a ? W.author({ name: a.name, schoolId: a.schoolId, id: a.id, url: a.url, startTime: a.startTime, duration: a.duration }) : null)
    const header = cat(fi(1, 6), fi(2, this.W), fi(3, this.H), fi(4, create), fi(5, create + total), fi(6, rec ? Math.max(total, 1) : 0), fo(7, au(b.author)), fs(8, b.convertUrl || ''),
      (b.provider || []).map(a => fb(9, au(a))), fi(10, this.bg0), fi(11, this.bg), fb(12, W.moveConfig(mc)), fb(13, this._lineCfg(this.bgLine0)), fb(14, this._lineCfg(this.bgLine)))
    out.push({ name: dir + 'header.bin', data: header })
    out.push({ name: dir + 'snapshot.bin', data: cat(fb(1, W.matrix(this.cam)), fb(2, this._snap(this.root))) })
    out.push({ name: dir + 'router.bin', data: cat([1, 2, 3, 4, 5, 6, 7].map(g => (recs[g] || []).map(r => fb(g, r)))) })
    return { dir, entries: [...out, ...this.res.map(r => ({ name: r.name, data: r.data, store: true }))] }
  }
}

class Board {
  constructor(o) {
    if (!(o && o.width > 0 && o.height > 0)) throw Error('createBoard 需要 width 和 height（像素）')
    this.o = o; this.W = Math.round(o.width); this.H = Math.round(o.height); this.base = o.createDate ?? Date.now(); this.pages = []
    this.addPage({})
  }
  addPage(o = {}) { const p = new Page(this, o); this.pages.push(p); return p }
  page(i = 0) { return this.pages[i] }
  get isRecording() { const r = this.o.recording; return r === undefined || r === 'auto' ? this.pages.some(p => p.acmds.length || p.stopped || p.cursorUsed) : !!r }
  /** 生成文件列表 [{ path, blob }]，可直接作为查看器的 source */
  async toFiles() {
    const rec = this.isRecording, entries = [], router = []
    for (const p of this.pages) { const f = await p._files(rec); entries.push(...f.entries); router.push(fb(1, cat(fs(1, p.id), fi(2, router.length)))) }
    entries.unshift({ name: 'page_router.bin', data: cat(router) })
    const seen = new Set(), list = entries.filter(e => !seen.has(e.name) && seen.add(e.name))
    if (this.o.screenshot !== false && typeof document !== 'undefined') {
      try { const { convert, toVfs } = await import('./board.js'); const svgs = await convert(toVfs(list.map(e => ({ path: e.name, data: e.data }))))
        for (let i = 0; i < this.pages.length; i++) if (svgs[i] && svgs[i].svg) list.push({ name: this.pages[i].id + '/screenshot.png', data: await svgToPng(svgs[i].svg, this.pages[i].W, this.pages[i].H), store: true }) } catch (e) { /* 预览图失败不影响内容 */ }
    }
    return list.map(e => ({ path: e.name, blob: new Blob([e.data]), data: e.data, store: e.store }))
  }
  async toBlob() { return writeZip((await this.toFiles()).map(e => ({ name: e.path, data: e.data, store: e.store }))) }
}
async function svgToPng(svg, w, h) {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url })
    const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(img, 0, 0, w, h)
    return new Uint8Array(await (await new Promise(r => c.toBlob(r, 'image/png'))).arrayBuffer())
  } finally { URL.revokeObjectURL(url) }
}

/** 新建一个画板。第一页已自动创建：board.page()；更多页：board.addPage() */
export function createBoard(options) { return new Board(options) }
