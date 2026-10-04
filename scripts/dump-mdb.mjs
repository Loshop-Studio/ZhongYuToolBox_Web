#!/usr/bin/env node
/**
 * 云笔记 page_mdb/data.mdb 全量导出工具（LMDB + ObjectBox + FlatBuffers）
 *
 * 用法：
 *   node scripts/dump-mdb.mjs <path/to/data.mdb>                  # 导出本地文件
 *   node scripts/dump-mdb.mjs --urls <url1> [url2 ...]            # 直接从 OSS 拉取并导出
 *   node scripts/dump-mdb.mjs --login <user> <pass> [--days 7]    # 登录 → 列出 7 天内笔记
 *   node scripts/dump-mdb.mjs --login <user> <pass> --note <关键词>  # 登录 → 导出匹配笔记的所有 mdb
 *   node scripts/dump-mdb.mjs --login <user> <pass> --file <fileId>
 *
 * 说明：
 *   - ObjectBox 的实体类型号 = 生成类 `XxxEntity_.mo13995r()` 的返回值，编码在 8 字节 key 前 4 字节：
 *       typeId = ((key[2] << 8) | key[3]) >> 2 ,  flags = key[3] & 3
 *     实例：HeaderEntity=6、BlackBoardEntity=12、PageEntity=14、BackgroundLineConfigEntity=24
 *   - 值统一是 FlatBuffers；字段号 = `new Property(entity, index, uid, ...)` 里的 uid。
 *   - 本工具对未知 typeId / 未知字段也照常输出（数值 + 所有可解释形式 + ASCII 串），不隐藏任何数据。
 */
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import CryptoJS from 'crypto-js'

/**
 * 极简 HTTP 客户端。
 * 之所以不用全局 fetch（undici）：本机 undici 按主机名解析时会 connect timeout，
 * 而 node:http 正常（DNS 走 dns.lookup，行为与 curl / PowerShell 一致）。
 */
function httpRequest(method, url, { headers = {}, body = null, timeout = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const req = http.request({
      method,
      hostname: u.hostname,
      port: u.port || 80,
      path: u.pathname + u.search,
      headers,
      timeout
    }, res => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, buffer: Buffer.concat(chunks) }))
    })
    req.on('timeout', () => req.destroy(new Error('请求超时：' + url)))
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

/* ==================== 1. LMDB 扫描（比 mdb.js 更宽松：所有 key 长度都收） ==================== */

const PAGE_SIZE = 4096
const P_LEAF = 0x02
const P_LEAF2 = 0x20
const F_BIGDATA = 0x01
const NODE_HDR = 8

function readEntries(u8) {
  const out = []
  if (!u8 || u8.length < PAGE_SIZE) return out
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength)
  const pages = Math.floor(u8.length / PAGE_SIZE)
  for (let p = 0; p < pages; p++) {
    const o = p * PAGE_SIZE
    const flags = dv.getUint16(o + 10, true)
    if ((flags & P_LEAF) !== P_LEAF) continue
    const lower = dv.getUint16(o + 12, true)
    const upper = dv.getUint16(o + 14, true)
    if (lower < 16 || lower > PAGE_SIZE) continue
    const n = (lower - 16) >> 1
    for (let k = 0; k < n; k++) {
      const np = dv.getUint16(o + 16 + k * 2, true)
      if (np < 16 || np + NODE_HDR > PAGE_SIZE) continue
      const lo = dv.getUint16(o + np, true)
      const hi = dv.getUint16(o + np + 2, true)
      const nflags = dv.getUint16(o + np + 4, true)
      const ksz = dv.getUint16(o + np + 6, true)
      const dsz = lo | (hi << 16)
      if (nflags & F_BIGDATA) continue
      if (np + NODE_HDR + ksz + dsz > PAGE_SIZE) continue
      const ks = o + np + NODE_HDR
      out.push({ page: p, key: u8.subarray(ks, ks + ksz), val: u8.subarray(ks + ksz, ks + ksz + dsz) })
    }
  }
  return out
}

/* ==================== 2. FlatBuffers 通用解码 ==================== */

function table(dv, pos) {
  if (pos < 0 || pos + 4 > dv.byteLength) return null
  const vt = pos - dv.getInt32(pos, true)
  if (vt < 0 || vt + 4 > dv.byteLength) return null
  const vtSize = dv.getUint16(vt, true)
  if (vtSize < 4 || vt + vtSize > dv.byteLength) return null
  return { pos, vt, vtSize }
}

const UTF8 = new TextDecoder('utf-8', { fatal: false })

/** 尝试把位置 p 解释成字符串字段（u32 offset → u32 len → bytes） */
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
    const s = UTF8.decode(bytes)
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s)) return null
    return s
  } catch { return null }
}

/** 解码一个 table 的所有字段；对每个字段给出多种解释，避免误判 */
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
    const i32 = dv.getInt32(p, true)
    const u32 = dv.getUint32(p, true)
    const f32 = dv.getFloat32(p, true)
    let i64 = null
    if (p + 8 <= dv.byteLength) i64 = dv.getBigInt64(p, true).toString()
    const str = tryString(dv, p)
    fields.push({ fid, off, i32, u32, f32: Number.isFinite(f32) ? f32 : null, i64, str })
  }
  return fields
}

/** 从值里扫出所有长度≥2的可打印 ASCII/UTF8 串（兜底，保证不漏信息） */
function scanStrings(u8) {
  const out = []
  let cur = []
  for (let i = 0; i < u8.length; i++) {
    const b = u8[i]
    if (b >= 32 && b < 127) cur.push(b)
    else {
      if (cur.length >= 3) out.push(String.fromCharCode(...cur))
      cur = []
    }
  }
  if (cur.length >= 3) out.push(String.fromCharCode(...cur))
  return [...new Set(out)].filter(s => /[A-Za-z0-9_./:-]{3,}/.test(s))
}

/* ==================== 3. 已知类型号（来自 APK 的 XxxEntity_.mo13995r()） ==================== */

const TYPE_NAMES = {
  1: 'ObjectBox schema/model',
  6: 'HeaderEntity',
  8: 'AuthorEntity',
  10: 'TouchRecordEntity? (含 *_touch.bin 文件名)',
  12: 'BlackBoardEntity  ← 含本地 dir（userNote/<userId>/note/<fileId>/<pageDir>）',
  14: 'PageEntity',
  16: 'MoveConfigEntity',
  24: 'BackgroundLineConfigEntity',
  28: 'TouchInfoEntity',
  26: 'TouchEventEntity'
}

/* ==================== 4. 输出一条记录 ==================== */

function typeIdOf(key) {
  if (key.length < 4) return { typeId: -1, flags: 0 }
  // ObjectBox 实体类型号编码在 key 的第 2~3 字节：typeId = ((key[2] << 8) | key[3]) >> 2
  // 例：HeaderEntity=6 → 0x0018；BlackBoardEntity=12 → 0x0030；PageEntity=14 → 0x0038
  const v = ((key[2] << 8) | key[3]) >>> 0
  return { typeId: v >> 2, flags: v & 3 }
}

function objIdOf(key) {
  if (key.length < 8) return null
  return (key[4] << 24 | key[5] << 16 | key[6] << 8 | key[7]) >>> 0
}

function hex(u8) {
  return Buffer.from(u8).toString('hex')
}

function fmtNum(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(4)
}

function printEntry(e, idx) {
  const { typeId, flags } = typeIdOf(e.key)
  const objId = objIdOf(e.key)
  const name = TYPE_NAMES[typeId] || 'UNKNOWN'
  const dv = new DataView(e.val.buffer, e.val.byteOffset, e.val.byteLength)

  console.log(`\n── #${idx}  type=0x${typeId.toString(16)}(${typeId}) ${name}${flags ? ` flags=${flags}` : ''}`)
  console.log(`   key(${e.key.length}B)=${hex(e.key)}  objId=${objId}  value(${e.val.length}B)`)

  const fields = dumpTable(dv)
  if (fields && fields.length) {
    for (const f of fields) {
      const parts = []
      if (f.str !== null) parts.push(`str="${f.str}"`)
      if (f.i64 !== null && (f.i64.length > 10 || Math.abs(Number(f.i64)) > 2 ** 31) && f.str === null) parts.push(`i64=${f.i64}`)
      parts.push(`i32=${f.i32}`)
      if (f.f32 !== null && f.str === null && Math.abs(f.f32) > 1e-6 && Math.abs(f.f32) < 1e9) parts.push(`f32=${fmtNum(f.f32)}`)
      console.log(`   f${f.fid}: ${parts.join('  ')}`)
    }
  } else {
    console.log('   (非 FlatBuffers 根表，原始 hex 见下)')
  }
  const strs = scanStrings(e.val)
  if (strs.length) console.log(`   strings: ${strs.slice(0, 20).map(s => JSON.stringify(s)).join(' ')}`)
  if (!fields || !fields.length) console.log(`   raw: ${hex(e.val.slice(0, 96))}${e.val.length > 96 ? '…' : ''}`)
}

function dumpMdb(u8, label) {
  const entries = readEntries(u8)
  console.log('\n' + '='.repeat(78))
  console.log(`文件：${label}`)
  console.log(`大小：${u8.length} B (${(u8.length / 1024).toFixed(1)} KB)  页数：${Math.floor(u8.length / PAGE_SIZE)}  记录：${entries.length}`)
  console.log('='.repeat(78))

  // 按类型号汇总
  const byType = new Map()
  for (const e of entries) {
    const { typeId } = typeIdOf(e.key)
    byType.set(typeId, (byType.get(typeId) || 0) + 1)
  }
  console.log('\n【类型号分布】')
  for (const [t, n] of [...byType.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`  0x${t.toString(16).padStart(2, '0')} (${String(t).padStart(3)})  ×${n}   ${TYPE_NAMES[t] || 'UNKNOWN'}`)
  }

  console.log('\n【逐条记录】')
  entries.forEach((e, i) => printEntry(e, i + 1))

  // ObjectBox schema 条目（key 长度非 8 或 type=1）单列，便于还原字段名
  const schema = entries.filter(e => e.key.length !== 8 || typeIdOf(e.key).typeId === 1)
  if (schema.length) {
    console.log('\n【ObjectBox schema / 关系索引 条目】')
    for (const e of schema) {
      const { typeId } = typeIdOf(e.key)
      console.log(`  key(${e.key.length}B)=${hex(e.key)} type=${typeId} val=${e.val.length}B strings=${scanStrings(e.val).map(s => JSON.stringify(s)).join(' ')}`)
    }
  }
}

/* ==================== 5. 诊断：提取本地目录 / 各类计数 ==================== */

/**
 * 从 mdb 里抽关键信息。
 * 最重要的一条：BlackBoardEntity.dir 是 App 的本地工作目录
 *   /storage/emulated/0/Android/data/com.friday.cloudsnote/userNote/<userId>/note/<fileId>/<pageDir>
 * 其中 <userId> 属于「最初创建该笔记的账号」。把资源拷给别的账号时如果只改 URL 不改它，
 * App 就会认为这份板数据不属于当前账号 → 打开编辑时看不到内容。
 */
function analyze(u8) {
  const entries = readEntries(u8)
  const counts = new Map()
  let dir = null
  const touchFiles = []
  for (const e of entries) {
    const { typeId } = typeIdOf(e.key)
    counts.set(typeId, (counts.get(typeId) || 0) + 1)
    if (e.val.length < 8) continue
    const dv = new DataView(e.val.buffer, e.val.byteOffset, e.val.byteLength)
    const fields = dumpTable(dv)
    if (!fields) continue
    for (const f of fields) {
      if (!f.str) continue
      if (!dir && /\/userNote\//.test(f.str)) dir = f.str
      if (/_touch\.bin$/i.test(f.str)) touchFiles.push(f.str)
    }
  }
  return { counts, dir, touchFiles }
}

const uidOfUrl = url => url?.match(/\/res\/(\d+)\//)?.[1] ?? '-'
const uidOfDir = dir => dir?.match(/\/userNote\/(\d+)\//)?.[1] ?? '-'

/* ==================== 6. 中育云笔记 API（登录 / 取资源） ==================== */

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

function aesEncrypt(data) {
  return CryptoJS.AES.encrypt(data, CryptoJS.enc.Utf8.parse(aesKey()), {
    mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7
  }).toString()
}

function aesDecrypt(b64) {
  return CryptoJS.AES.decrypt(b64, CryptoJS.enc.Utf8.parse(aesKey()), {
    mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7
  }).toString(CryptoJS.enc.Utf8)
}

async function login(base, user, pass) {
  const body = JSON.stringify({ userName: user, password: pass, clientType: 1 })
  const r = await httpRequest('POST', `${base}/api/TokenAuth/Login`, {
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    body
  })
  const json = JSON.parse(r.buffer.toString('utf8'))
  if (!json.result) throw new Error('登录失败：' + JSON.stringify(json.error || json))
  return json.result.accessToken
}

async function getUserInfo(base, token) {
  const r = await httpRequest('GET', `${base}/api/services/app/User/GetInfoAsync`, { headers: { Authorization: `Bearer ${token}` } })
  try { return JSON.parse(r.buffer.toString('utf8')).result || {} } catch { return {} }
}

async function getAllNotes(base, token) {
  const r = await httpRequest('GET', `${base}/CloudNotes/api/Notes/GetAll`, { headers: { Authorization: `Bearer ${token}` } })
  const json = JSON.parse(r.buffer.toString('utf8'))
  if (json.code !== 0) throw new Error('取笔记失败：' + (json.msg || JSON.stringify(json)))
  return JSON.parse(aesDecrypt(json.data)).noteList || []
}

async function getResources(base, token, fileId) {
  const url = `${base}/CloudNotes/api/Resources/GetByFileId?${aesEncrypt('fileId=' + fileId)}`
  const r = await httpRequest('GET', url, { headers: { Authorization: `Bearer ${token}` } })
  const json = JSON.parse(r.buffer.toString('utf8'))
  if (json.code !== 0) throw new Error('取资源失败：' + (json.msg || JSON.stringify(json)))
  return JSON.parse(aesDecrypt(json.data)).resourceList || []
}

async function download(url) {
  const r = await httpRequest('GET', url, { timeout: 60000 })
  if (r.status < 200 || r.status >= 300) throw new Error(`HTTP ${r.status}`)
  return new Uint8Array(r.buffer)
}

/* ==================== 6. CLI ==================== */

const argv = process.argv.slice(2)
const API_BASE = process.env.ZY_API_BASE || 'http://sxz.api.zykj.org'

function argOf(flag, def) {
  const i = argv.indexOf(flag)
  return i >= 0 ? argv[i + 1] : def
}

async function main() {
  const loginIdx = argv.indexOf('--login')
  if (loginIdx >= 0) {
    const user = argv[loginIdx + 1]
    const pass = argv[loginIdx + 2]
    const base = argOf('--base', API_BASE)
    console.log(`登录 ${base} 用户 ${user} …`)
    const token = await login(base, user, pass)
    console.log('登录成功')

    const info = await getUserInfo(base, token)
    const myUid = info.id ?? info.userId ?? '(未知)'
    console.log(`当前账号：${info.userName || info.userNameOrEmailAddress || user}  userId=${myUid}  ${info.name || info.realName || ''}`)

    let notes = await getAllNotes(base, token)
    const fileId = argOf('--file', null)
    const kw = argOf('--note', null)
    const scan = argv.includes('--scan')
    const all = argv.includes('--all')
    const days = Number(argOf('--days', '7'))

    if (fileId) {
      notes = notes.filter(n => n.fileId === fileId)
    } else if (kw) {
      notes = notes.filter(n => (n.fileName || '').includes(kw))
    } else if (!scan && !all) {
      const since = Date.now() - days * 86400e3
      notes = notes.filter(n => {
        const t = Date.parse(n.updateTime || n.createTime || 0)
        return !Number.isFinite(t) || t >= since
      })
      console.log(`\n【近 ${days} 天笔记】共 ${notes.length} 条`)
      for (const n of notes) {
        console.log(`  ${n.fileId}  type=${n.type}  update=${n.updateTime}  ${n.fileName}`)
      }
      console.log('\n提示：用 --file <fileId> / --note <关键词> 导出；--scan 扫描全部笔记做拷贝一致性检查')
      return
    }

    if (scan) {
      console.log('\n【拷贝一致性扫描】')
      console.log('urlUid = 资源 URL 里的 /res/<uid>/；dirUid = mdb 里 BlackBoardEntity.dir 的 /userNote/<uid>/')
      console.log('任何一行 urlUid ≠ dirUid 的笔记，就是"预览在、编辑空"的元凶\n')
      console.log('  fileId                            urlUid  dirUid      pageDir   事件  笔迹点  page  判定  名称')
      for (const n of notes) {
        try {
          const list = await getResources(base, token, n.fileId)
          const mdbUrl = list.find(r => /data\.mdb$/i.test(r.ossImageUrl))?.ossImageUrl
          if (!mdbUrl) { console.log(`  ${n.fileId}  (无 mdb)  ${n.fileName}`); continue }
          const u8 = await download(mdbUrl)
          const a = analyze(u8)
          const urlUid = uidOfUrl(mdbUrl)
          const dirUid = uidOfDir(a.dir)
          const pageDir = a.dir ? a.dir.split('/').pop() : '-'
          const ev = a.counts.get(26) || 0
          const pts = a.counts.get(28) || 0
          const bad = urlUid !== '-' && dirUid !== '-' && urlUid !== dirUid
          console.log(`  ${n.fileId}  ${urlUid.padStart(6)}  ${dirUid.padStart(6)}  ${String(pageDir).padStart(13)}  ${String(ev).padStart(4)}  ${String(pts).padStart(6)}  ${String(n.type).padStart(4)}  ${bad ? '★不匹配' : '  ok  '}  ${n.fileName}`)
        } catch (e) {
          console.log(`  ${n.fileId}  扫描失败：${e.message}  ${n.fileName}`)
        }
      }
      return
    }

    for (const n of notes) {
      console.log(`\n>>> 笔记 ${n.fileName} (${n.fileId})`)
      const list = await getResources(base, token, n.fileId)
      console.log(`    资源 ${list.length} 条`)
      for (const r of list) {
        const isMdb = /data\.mdb/i.test(r.ossImageUrl)
        console.log(`    [${r.resourceType}] page=${r.pageIndex} ${isMdb ? '★MDB ' : ''}${r.ossImageUrl}`)
        if (isMdb) {
          try {
            const u8 = await download(r.ossImageUrl)
            dumpMdb(u8, r.ossImageUrl)
          } catch (e) {
            console.log(`    下载失败：${e.message}`)
          }
        }
      }
    }
    return
  }

  const urlsIdx = argv.indexOf('--urls')
  if (urlsIdx >= 0) {
    for (const url of argv.slice(urlsIdx + 1)) {
      try {
        dumpMdb(await download(url), url)
      } catch (e) {
        console.log(`下载失败 ${url}：${e.message}`)
      }
    }
    return
  }

  const local = argv.find(a => !a.startsWith('--'))
  if (local) {
    if (!fs.existsSync(local)) throw new Error('文件不存在：' + local)
    dumpMdb(new Uint8Array(fs.readFileSync(local)), path.resolve(local))
    return
  }

  console.log(`用法：
  node scripts/dump-mdb.mjs <path/to/data.mdb>
  node scripts/dump-mdb.mjs --urls <url...>
  node scripts/dump-mdb.mjs --login <user> <pass> [--days 7|--note <kw>|--file <fileId>] [--base http://sxz.api.zykj.org]`)
}

main().catch(e => {
  console.error('ERROR:', e.message)
  if (e.cause) console.error('CAUSE:', e.cause?.code || '', e.cause?.message || '')
  process.exit(1)
})
