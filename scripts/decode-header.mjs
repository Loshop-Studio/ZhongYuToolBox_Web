#!/usr/bin/env node
/**
 * 解码云笔记 header.bin（protobuf 格式）：
 *   field 11 wire 0 = bgcolor      int32 0xAARRGGBB
 *   field 13 wire 2 = BgLines sub-message：
 *     f1 wire 0 = color        int32 0xAARRGGBB
 *     f2 wire 5 = spacing      fixed32 float32
 *     f3 wire 0 = cross        varint (0=仅横线, 1=横竖交错网格)
 *     f4 wire 5 = width        fixed32 float32
 *
 * 用法：
 *   node scripts/decode-header.mjs <local header.bin>
 *   node scripts/decode-header.mjs --login <user> <pass> --note <kw> --base <api>
 */
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import CryptoJS from 'crypto-js'

function readVarint(u8, p) {
  let r = 0n, s = 0n
  for (;;) {
    if (p >= u8.length) throw new Error('varint 越界')
    const b = u8[p++]
    r |= BigInt(b & 0x7f) << s
    if ((b & 0x80) === 0) return { v: Number(BigInt.asIntN(32, r)), p }
    s += 7n
    if (s > 70n) throw new Error('varint 过长')
  }
}

function decodeHeader(u8) {
  const out = { bgcolor: null, bgLines: null, raw: u8.length + 'B' }
  let p = 0
  while (p < u8.length) {
    const { v: tag, p: p1 } = readVarint(u8, p)
    const field = tag >>> 3
    const wire = tag & 7
    if (wire === 0) {
      const { v, p: p2 } = readVarint(u8, p1)
      const n = Number(v) | 0
      if (field === 11) out.bgcolor = n
      p = p2
    } else if (wire === 1) {
      p = p1 + 8
    } else if (wire === 2) {
      const { v: len, p: p2 } = readVarint(u8, p1)
      const ln = Number(len)
      if (field === 13) {
        const sub = u8.subarray(p2, p2 + ln)
        const sub_ = { color: null, spacing: null, cross: null, width: null }
        let q = 0
        while (q < sub.length) {
          const { v: t, p: q1 } = readVarint(sub, q)
          const f = t >>> 3, w = t & 7
          if (w === 0) {
            const { v, p: q2 } = readVarint(sub, q1)
            const n = Number(v) | 0
            if (f === 1) sub_.color = n
            else if (f === 3) sub_.cross = n
            q = q2
          } else if (w === 5) {
            const dv = new DataView(sub.buffer, sub.byteOffset + q1, 4)
            const f32 = dv.getFloat32(0, true)
            if (f === 2) sub_.spacing = f32
            else if (f === 4) sub_.width = f32
            q = q1 + 4
          } else if (w === 2) {
            const { v, p: q2 } = readVarint(sub, q1)
            q = q2 + Number(v)
          } else if (w === 1) {
            q = q1 + 8
          } else {
            throw new Error('未知 wire type ' + w + ' at sub field ' + f)
          }
        }
        out.bgLines = sub_
      }
      p = p2 + ln
    } else if (wire === 5) {
      p = p1 + 4
    } else {
      throw new Error('未知 wire type ' + wire + ' at field ' + field)
    }
  }
  return out
}

function colorHtml(c) {
  if (c == null) return '-'
  const a = (c >>> 24) & 0xff, r = (c >>> 16) & 0xff, g = (c >>> 8) & 0xff, b = c & 0xff
  return `#${a.toString(16).padStart(2,'0')}${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}  rgb(${r},${g},${b}) a=${a}`
}

function hex(u8) { return Buffer.from(u8).toString('hex') }

const argv = process.argv.slice(2)
const loginIdx = argv.indexOf('--login')
const localIdx = argv.findIndex(a => !a.startsWith('--') && a !== process.argv[3] && a !== process.argv[4])

function httpJson(method, url, { body, headers, timeout = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const req = http.request({
      method, hostname: u.hostname, port: u.port || 80, path: u.pathname + u.search,
      headers, timeout
    }, res => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode, buffer: Buffer.concat(chunks) }))
    })
    req.on('timeout', () => req.destroy(new Error('请求超时：' + url)))
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

function aesKey() {
  const e = ':F0wKU!Qg3}UkbW+w[:9|D3-5h=:T;7t#_GZ4#G;~ZNSq{8;}QIP>\'{q.lje'
  const t = new Date()
  const n = t.getFullYear(), r = t.getMonth() + 1, o = t.getDate()
  const i = 33 + o * r * 33
  const a = String.fromCharCode((i % 94) + 33)
  const s = e[o + r]
  const c = (n * r * o) % e.length
  const f = (e.substring(c) + e.substring(0, c)).substring(0, 14)
  return a + f + s
}

async function login(base, user, pass) {
  const body = JSON.stringify({ userName: user, password: pass, clientType: 1 })
  const r = await httpJson('POST', `${base}/api/TokenAuth/Login`, {
    body, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
  })
  const j = JSON.parse(r.buffer.toString('utf8'))
  if (!j.result) throw new Error('登录失败：' + JSON.stringify(j.error || j))
  return j.result.accessToken
}

async function getNotes(base, token) {
  const r = await httpJson('GET', `${base}/CloudNotes/api/Notes/GetAll`, { headers: { Authorization: `Bearer ${token}` } })
  const j = JSON.parse(r.buffer.toString('utf8'))
  if (j.code !== 0) throw new Error('GetAll: ' + (j.msg || JSON.stringify(j)))
  const dec = CryptoJS.AES.decrypt(j.data, CryptoJS.enc.Utf8.parse(aesKey()), { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 }).toString(CryptoJS.enc.Utf8)
  return JSON.parse(dec).noteList || []
}

async function getResources(base, token, fileId) {
  const enc = CryptoJS.AES.encrypt('fileId=' + fileId, CryptoJS.enc.Utf8.parse(aesKey()), { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 }).toString()
  const r = await httpJson('GET', `${base}/CloudNotes/api/Resources/GetByFileId?${enc}`, { headers: { Authorization: `Bearer ${token}` } })
  const j = JSON.parse(r.buffer.toString('utf8'))
  if (j.code !== 0) return []
  const dec = CryptoJS.AES.decrypt(j.data, CryptoJS.enc.Utf8.parse(aesKey()), { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 }).toString(CryptoJS.enc.Utf8)
  return JSON.parse(dec).resourceList || []
}

async function main() {
  if (loginIdx >= 0) {
    const user = argv[loginIdx + 1], pass = argv[loginIdx + 2]
    const base = argv[argv.indexOf('--base') + 1] || 'http://sxz.api.zykj.org'
    const kw = argv[argv.indexOf('--note') + 1] || ''
    const token = await login(base, user, pass)
    const list = await getNotes(base, token)
    const filtered = kw ? list.filter(n => (n.fileName || '').includes(kw)) : list
    for (const n of filtered) {
      console.log(`\n笔记 ${n.fileName}  fileId=${n.fileId}`)
      const res = await getResources(base, token, n.fileId)
      const headers = res.filter(x => /\/header\.bin$/.test(x.ossImageUrl)).sort((a, b) => (a.pageIndex || 0) - (b.pageIndex || 0))
      console.log(`  共 ${res.length} 资源，header.bin ×${headers.length}`)
      for (const h of headers) {
        try {
          const r2 = await httpJson('GET', h.ossImageUrl, { timeout: 30000 })
          const u8 = new Uint8Array(r2.buffer)
          const info = decodeHeader(u8)
          console.log(`  page=${String(h.pageIndex).padStart(2)}  ${h.ossImageUrl.split('/').slice(-2,-1)[0]}  bgcolor=${info.bgcolor != null ? '0x' + (info.bgcolor >>> 0).toString(16).padStart(8,'0') : '-'} (${colorHtml(info.bgcolor)})  bgLines=${info.bgLines ? `color=0x${(info.bgLines.color>>>0).toString(16).padStart(8,'0')} spacing=${info.bgLines.spacing} cross=${info.bgLines.cross} width=${info.bgLines.width}` : '-'}`)
        } catch (e) {
          console.log(`  page=${h.pageIndex}  下载失败：${e.message}`)
        }
      }
    }
    return
  }
  const file = argv[localIdx]
  if (!file) throw new Error('用法：node scripts/decode-header.mjs <header.bin> 或 --login --note <关键词>')
  const u8 = fs.readFileSync(file)
  console.log('文件', path.resolve(file), u8.length, 'B  hex=' + hex(u8))
  console.log(JSON.stringify(decodeHeader(new Uint8Array(u8)), null, 2))
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1) })