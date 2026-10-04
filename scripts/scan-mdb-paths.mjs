#!/usr/bin/env node
/**
 * 扫所有笔记的 mdb，提取每个 FlatBuffers 字符串字段，命中路径模式则输出。
 * 路径模式：绝对路径（/xxx）、Windows 盘符（C:\ / D:\）、含扩展名（.bin/.mdb/.png/.jpg/.webp/.snapshot/.touch/.command/.file/.matrix）
 */
import http from 'node:http'
import CryptoJS from 'crypto-js'

const argv = process.argv.slice(2)
const USER = argOf('--login', null) ?? (argv[1] || null)
const PASS = argOf('--login', null) ? argv[3] : (argv[2] || null)
const BASE = argOf('--base', 'http://sxz.api.zykj.org')

function argOf(flag, def) { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : def }

function httpRequest(method, url, { headers = {}, body = null, timeout = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const req = http.request({ method, hostname: u.hostname, port: u.port || 80, path: u.pathname + u.search, headers, timeout },
      res => { const c = []; res.on('data', x => c.push(x)); res.on('end', () => resolve({ status: res.statusCode, buffer: Buffer.concat(c) })) })
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.on('error', reject)
    if (body) req.write(body); req.end()
  })
}

function aesKey() {
  const e = ":F0wKU!Qg3}UkbW+w[:9|D3-5h=:T;7t#_GZ4#G;~ZNSq{8;}QIP>'{q.lje"
  const t = new Date()
  const n = t.getFullYear(), r = t.getMonth() + 1, o = t.getDate()
  const i = 33 + o * r * 33
  const a = String.fromCharCode((i % 94) + 33)
  const s = e[o + r]
  const c = (n * r * o) % e.length
  return a + (e.substring(c) + e.substring(0, c)).substring(0, 14) + s
}
const AES_ENC = d => CryptoJS.AES.encrypt(d, CryptoJS.enc.Utf8.parse(aesKey()), { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 }).toString()
const AES_DEC = b => CryptoJS.AES.decrypt(b, CryptoJS.enc.Utf8.parse(aesKey()), { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 }).toString(CryptoJS.enc.Utf8)

async function login() {
  const body = JSON.stringify({ userName: USER, password: PASS, clientType: 1 })
  const r = await httpRequest('POST', `${BASE}/api/TokenAuth/Login`, { headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, body })
  return JSON.parse(r.buffer.toString('utf8')).result.accessToken
}

async function getAllNotes(tk) {
  const r = await httpRequest('GET', `${BASE}/CloudNotes/api/Notes/GetAll`, { headers: { Authorization: `Bearer ${tk}` } })
  const j = JSON.parse(r.buffer.toString('utf8'))
  return JSON.parse(AES_DEC(j.data)).noteList || []
}

async function getResources(tk, fileId) {
  const r = await httpRequest('GET', `${BASE}/CloudNotes/api/Resources/GetByFileId?${AES_ENC('fileId=' + fileId)}`, { headers: { Authorization: `Bearer ${tk}` } })
  const j = JSON.parse(r.buffer.toString('utf8'))
  return JSON.parse(AES_DEC(j.data)).resourceList || []
}

/* ==================== LMDB 扫描 + FlatBuffers 通用解码（复刻自 dump-mdb.mjs） ==================== */
const PAGE_SIZE = 4096, P_LEAF = 0x02, F_BIGDATA = 0x01, NODE_HDR = 8

function readEntries(u8) {
  const out = []
  if (!u8 || u8.length < PAGE_SIZE) return out
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength)
  const pages = Math.floor(u8.length / PAGE_SIZE)
  for (let p = 0; p < pages; p++) {
    const o = p * PAGE_SIZE
    const flags = dv.getUint16(o + 10, true)
    if ((flags & P_LEAF) !== P_LEAF) continue
    const lower = dv.getUint16(o + 12, true), upper = dv.getUint16(o + 14, true)
    if (lower < 16 || lower > PAGE_SIZE) continue
    const n = (lower - 16) >> 1
    for (let k = 0; k < n; k++) {
      const np = dv.getUint16(o + 16 + k * 2, true)
      if (np < 16 || np + NODE_HDR > PAGE_SIZE) continue
      const lo = dv.getUint16(o + np, true), hi = dv.getUint16(o + np + 2, true)
      const nflags = dv.getUint16(o + np + 4, true), ksz = dv.getUint16(o + np + 6, true)
      const dsz = lo | (hi << 16)
      if (nflags & F_BIGDATA) continue
      if (np + NODE_HDR + ksz + dsz > PAGE_SIZE) continue
      const ks = o + np + NODE_HDR
      out.push({ key: u8.subarray(ks, ks + ksz), val: u8.subarray(ks + ksz, ks + ksz + dsz) })
    }
  }
  return out
}

function table(dv, pos) {
  if (pos < 0 || pos + 4 > dv.byteLength) return null
  const vt = pos - dv.getInt32(pos, true)
  if (vt < 0 || vt + 4 > dv.byteLength) return null
  const vtSize = dv.getUint16(vt, true)
  if (vtSize < 4 || vt + vtSize > dv.byteLength) return null
  return { pos, vt, vtSize }
}
const UTF8 = new TextDecoder('utf-8', { fatal: false })
function tryString(dv, p) {
  try {
    const sp = p + dv.getUint32(p, true)
    if (sp < 0 || sp + 4 > dv.byteLength) return null
    const len = dv.getUint32(sp, true)
    if (len === 0 || len > dv.byteLength) return null
    const s0 = sp + 4
    if (s0 + len > dv.byteLength) return null
    const bytes = new Uint8Array(dv.buffer, dv.byteOffset + s0, len)
    let printable = 0
    for (const b of bytes) if (b === 9 || b === 10 || b === 13 || (b >= 32 && b < 127) || b >= 0x80) printable++
    if (printable / bytes.length < 0.85) return null
    return UTF8.decode(bytes)
  } catch { return null }
}
function dumpTable(dv, valueOffset = 0) {
  if (dv.byteLength < 8) return null
  const rootPos = valueOffset + dv.getUint32(valueOffset, true)
  const t = table(dv, rootPos)
  if (!t) return null
  const fields = []
  const maxFid = Math.min(96, (t.vtSize - 4) / 2)
  for (let fid = 0; fid < maxFid; fid++) {
    const off = dv.getUint16(t.vt + 4 + fid * 2, true)
    if (!off) continue
    const p = t.pos + off
    if (p + 4 > dv.byteLength) continue
    const str = tryString(dv, p)
    if (str) fields.push({ fid, str })
  }
  return fields
}
function typeIdOf(key) {
  if (key.length < 4) return -1
  return (((key[2] << 8) | key[3]) >>> 0) >> 2
}

const TYPE_NAMES = { 1: 'schema', 6: 'Header', 8: 'Author', 10: 'TouchRecord', 12: 'BlackBoard', 14: 'Page', 16: 'MoveConfig', 24: 'BgLine', 26: 'TouchEvent', 28: 'TouchInfo' }

/* 路径判定 */
const PATH_RE = [
  /(?:^|[^A-Za-z0-9_])(\/[\w.\-/]+)/,                       // unix 绝对路径
  /[A-Z]:[\\\/][\w.\\\/:-]+/i,                              // Windows 盘符
  /userNote\//,                                     // Android data dir
  /(?:\.\/|\.\.\/|\/)(?:\w+\/)*[\w]+\.(?:bin|mdb|png|jpg|jpeg|webp|touch|command|file|router|matrix|snapshot|pdf)/i,
  /[\w\-_/]+_(?:touch|command|file|matrix|router|header)\.bin/i,
  /[\w\-_/]+\.(?:bin|mdb|png|jpg|webp|snapshot)\b/i
]

function isPathy(s) {
  if (!s || s.length < 3) return false
  for (const r of PATH_RE) if (r.test(s)) return true
  return false
}

async function main() {
  console.log(`登录 ${BASE} 用户 ${USER} …`)
  const tk = await login()
  console.log('登录成功')
  const notes = await getAllNotes(tk)
  console.log(`笔记共 ${notes.length} 条`)
  console.log('扫描中，仅下载含 data.mdb 的笔记的第一页 mdb，逐字符串字段做路径判定…\n')

  let totalMdb = 0, totalNotes = 0, totalHits = 0
  let notesWithMdb = []
  for (const n of notes) {
    try {
      const list = await getResources(tk, n.fileId)
      const mdbList = list.filter(r => /data\.mdb$/i.test(r.ossImageUrl))
      if (!mdbList.length) continue
      totalNotes++
      // 只下第一页 mdb 做抽样诊断
      const u8 = await new Promise((res, rej) => {
        httpRequest('GET', mdbList[0].ossImageUrl, { timeout: 60000 })
          .then(r => res(new Uint8Array(r.buffer))).catch(rej)
      })
      totalMdb++
      const entries = readEntries(u8)
      const hits = []
      for (const e of entries) {
        const tid = typeIdOf(e.key)
        const dv = new DataView(e.val.buffer, e.val.byteOffset, e.val.byteLength)
        const fields = dumpTable(dv) || []
        for (const f of fields) {
          if (f.str && isPathy(f.str)) {
            hits.push({ typeId: tid, fid: f.fid, str: f.str })
          }
        }
      }
      if (hits.length) {
        totalHits += hits.length
        notesWithMdb.push({ name: n.fileName, fileId: n.fileId, hits })
        console.log(`★ ${n.fileId}  ${n.fileName}  (含 ${hits.length} 处路径类字符串)`)
        for (const h of hits.slice(0, 8)) {
          console.log(`    [${TYPE_NAMES[h.typeId] || `t#${h.typeId}`}].f${h.fid}  ${h.str}`)
        }
        if (hits.length > 8) console.log(`    …还有 ${hits.length - 8} 条`)
      }
    } catch (e) {
      // 静默失败
    }
  }

  console.log('\n========== 汇总 ==========')
  console.log(`含 data.mdb 的笔记：${totalNotes}`)
  console.log(`下到 mdb：${totalMdb}`)
  console.log(`命中路径类字符串的笔记：${notesWithMdb.length}`)
  console.log(`命中条数合计：${totalHits}`)
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1) })