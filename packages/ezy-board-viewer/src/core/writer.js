/* eslint-disable */
// 最小 protobuf 编码器 + zip 写入器 + SHA-256。字段号与 .proto 一一对应（见 zykj-board-format-spec.md）。
const te = new TextEncoder()
export const E = new Uint8Array(0)
export const cat = (...a) => { a = a.flat(Infinity); let n = 0; for (const x of a) n += x.length; const o = new Uint8Array(n); let p = 0; for (const x of a) { o.set(x, p); p += x.length } return o }
const vint = v => { let b = typeof v === 'bigint' ? v : BigInt(Math.trunc(v)); if (b < 0n) b = BigInt.asUintN(64, b); const o = []; while (b > 127n) { o.push(Number(b & 127n) | 128); b >>= 7n } o.push(Number(b)); return Uint8Array.from(o) }
const key = (f, w) => vint(f * 8 + w)
const f32 = v => { const b = new Uint8Array(4); new DataView(b.buffer).setFloat32(0, v, true); return b }
// proto3：默认值不写
export const fi = (f, v) => (v ? cat(key(f, 0), vint(v)) : E)
export const fl = (f, v) => (v ? cat(key(f, 5), f32(v)) : E)
export const fb = (f, b) => cat(key(f, 2), vint(b.length), b)        // 嵌套消息 / repeated 元素：总是写出
export const fs = (f, s) => (s ? fb(f, te.encode(s)) : E)
export const fo = (f, b) => (b ? fb(f, b) : E)                        // 可选嵌套消息

export const W = {
  matrix: (m, t = 0) => cat(fi(1, t), fl(2, m[0]), fl(3, m[2]), fl(4, m[4]), fl(5, m[1]), fl(6, m[3]), fl(7, m[5]), fl(10, 1)),
  paint: p => cat(fl(1, p.width), fi(2, p.color), fl(3, p.spacing), fl(4, p.itemLength), fi(5, p.style), fl(6, p.textSize)),
  pointf: p => cat(fl(1, p.x), fl(2, p.y)),
  rectf: r => cat(fl(1, r[0]), fl(2, r[1]), fl(3, r[2]), fl(4, r[3])),
  touchEvent: e => cat(fi(1, e.t), fl(3, e.x), fl(4, e.y)),
  touchInfo: t => cat(t.events.map(e => fb(1, W.touchEvent(e))), fo(2, W.paint(t.paint))),
  fileInfo: f => cat(fs(1, f.name), fi(2, f.width), fi(3, f.height), fs(4, f.validate)),
  textInfo: t => cat(fs(1, t.content), fo(2, W.paint(t.paint))),
  geoInfo: g => cat(fi(1, g.type), g.points.map(p => fb(2, W.pointf(p))), fo(3, W.paint(g.paint))),
  author: a => cat(fs(1, a.name), fs(2, a.schoolId), fs(3, a.id), fs(4, a.url), fi(5, a.startTime), fi(6, a.duration)),
  moveConfig: c => cat(fi(1, c.isEnable), fi(2, c.verticalTranslate), fi(3, c.horizontalTranslate), fi(4, c.scale), fi(5, c.rotate), fi(6, c.maxHeightTimes), fi(7, c.maxWidthTimes)),
  lineConfig: c => cat(fi(1, c.color), fl(2, c.space), fi(3, c.type), fl(4, c.width)),
  command: c => cat(fi(1, c.delay), fi(2, c.duration), fi(3, c.isPlay), fi(4, c.e), c.data && c.data.length ? fb(5, c.data) : E),
  record: (name, hash) => cat(fs(1, name), fs(2, hash))
}

export async function sha256(u8) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', u8))
  return [...d].map(x => x.toString(16).padStart(2, '0')).join('').replace(/^0+/, '')   // Java BigInteger.toString(16)：去掉前导 0
}

/* ---------- zip ---------- */
const crcT = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 } return t })()
export const crc32 = u => { let c = ~0; for (let i = 0; i < u.length; i++) c = crcT[(c ^ u[i]) & 255] ^ (c >>> 8); return (~c) >>> 0 }
async function deflateRaw(u) { return new Uint8Array(await new Response(new Blob([u]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()) }

/** entries: [{ name, data: Uint8Array, store?: boolean }] → Blob(zip) */
export async function writeZip(entries) {
  const parts = [], cd = []; let off = 0
  const d = new Date(), dd = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(), tt = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)
  for (const e of entries) {
    const nm = te.encode(e.name); let data = e.data, method = 0
    if (!e.store && typeof CompressionStream !== 'undefined' && data.length > 64) { const z = await deflateRaw(data); if (z.length < data.length) { data = z; method = 8 } }
    const crc = crc32(e.data), h = new DataView(new ArrayBuffer(30))
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, method, true)
    h.setUint16(10, tt, true); h.setUint16(12, dd, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, e.data.length, true); h.setUint16(26, nm.length, true)
    parts.push(new Uint8Array(h.buffer), nm, data); cd.push({ nm, crc, method, cs: data.length, us: e.data.length, off }); off += 30 + nm.length + data.length
  }
  const cstart = off
  for (const c of cd) {
    const h = new DataView(new ArrayBuffer(46))
    h.setUint32(0, 0x02014b50, true); h.setUint16(4, 20, true); h.setUint16(6, 20, true); h.setUint16(8, 0x0800, true); h.setUint16(10, c.method, true)
    h.setUint16(12, tt, true); h.setUint16(14, dd, true); h.setUint32(16, c.crc, true); h.setUint32(20, c.cs, true); h.setUint32(24, c.us, true); h.setUint16(28, c.nm.length, true); h.setUint32(42, c.off, true)
    parts.push(new Uint8Array(h.buffer), c.nm); off += 46 + c.nm.length
  }
  const z = new DataView(new ArrayBuffer(22))
  z.setUint32(0, 0x06054b50, true); z.setUint16(8, cd.length, true); z.setUint16(10, cd.length, true); z.setUint32(12, off - cstart, true); z.setUint32(16, cstart, true)
  if (off > 0xFFFFFFFE || cd.length > 0xFFFE) throw Error('内容过大（暂不支持 zip64）')
  parts.push(new Uint8Array(z.buffer))
  return new Blob(parts, { type: 'application/zip' })
}
