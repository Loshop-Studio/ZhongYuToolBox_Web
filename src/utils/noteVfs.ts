/**
 * 把云笔记（friday / 优客畅学）的资源元数据按需组装成一个 ezy-board-viewer 能识别的
 * 虚拟文件系统（VFS）。NoteViewer 通过这个 VFS 拉取 header.bin / snapshot.bin /
 * res/image/* / *_touch.bin，从而免去下载整个 zip 包。
 *
 * VFS 接口约定（与 board.js 的 readZip 输出一致）：
 *   - names: string[]         所有可见的相对路径（如 '1/header.bin', 'res/image/x.png'）
 *   - read(name): Promise<Uint8Array | null>   按需读取对应文件的字节
 */
import { resourceFetchUrl } from './proxy'
import { readBgLineConfig, readHeaderBgColor } from 'ezy-board-viewer'
import type { BgLines } from './noteBackground'

/** 云笔记某一页的资源指针 */
export interface NotePage {
  /** 当前页号（1-based）。用作虚拟目录名（如 '1'、'2'） */
  pageKey: number
  /** 该页 snapshot.bin 的完整 OSS URL（直连或代理前均可） */
  snapshotUrl: string
  /** 该页 _touch.bin 列表（旧笔记：每段笔触一个独立文件） */
  touchUrls?: string[]
  /**
   * 新版笔记的 page_mdb/data.mdb（ObjectBox 数据库，未压缩的 LMDB）。
   * 新版不再单独上传 *_touch.bin，笔触（TouchEventEntity / TouchInfoEntity）
   * 存在这里，由 NoteViewer 现场解析合成 TouchSource。
   */
  mdbUrl?: string
  /**
   * 该页合成 header.bin 的画布尺寸。NoteViewer 需要 header.bin 才能解析画板大小，
   * 这里取该页截图的像素尺寸；没有截图则用默认 1080x1920。
   */
  width?: number
  height?: number
  /**
   * 该页画布背景色（protobuf varint 编码 0xAARRGGBB；-1=不透明白）。
   * 不传则默认 -1（白底）。建议从页面截图（screenshot.png）左上角取色传入。
   */
  bgcolor?: number
  /**
   * 该页背景线（网格 / 横线）。新笔记不上传 header.bin，背景线只能由截图推断，
   * 见 utils/noteBackground.detectBgLines。不传则只画纯色底。
   */
  bgLines?: BgLines
}

/** 共享图片资源（res/image/*）。多页共用一份。 */
export interface NoteImage {
  /** res/image/ 下的相对文件名，如 'abc.png'。会拼成 'res/image/abc.png' */
  fileName: string
  /** OSS 完整 URL */
  url: string
}

export interface NoteVfsOptions {
  /** 所有页面（顺序无所谓，VFS 内部按 pageKey 升序） */
  pages: NotePage[]
  /** 全局/共享图片（多页共用） */
  images?: NoteImage[]
  /** 自定义 fetch 工厂；不传则默认走 resourceFetchUrl() */
  fetchBlob?: (url: string) => Promise<Blob>
}

export interface NoteVfs {
  names: string[]
  read(name: string): Promise<Uint8Array | null>
}

/** 默认 fetch 工厂：复用项目里的代理/直连策略 */
async function defaultFetchBlob(url: string): Promise<Blob> {
  const res = await fetch(resourceFetchUrl(url))
  if (!res.ok) throw new Error('资源下载失败：HTTP ' + res.status)
  return await res.blob()
}

/** 把 protobuf 的 varint 编码成字节（仅用于合成的 header.bin） */
function varintBytes(v: number): number[] {
  const out: number[] = []
  let x = v >>> 0
  while (x > 0x7f) {
    out.push((x & 0x7f) | 0x80)
    x >>>= 7
  }
  out.push(x)
  return out
}

/** 把 int32 按标准 protobuf varint 编码成字节（负数会变 10 字节）。与 board.js 的 I() 读取方式匹配。 */
function int32VarintBytes(v: number): number[] {
  let big = BigInt(v | 0) & 0xFFFFFFFFn  // uint32 视图（负数取低 32 位）
  const out: number[] = []
  while (big > 0x7fn) {
    out.push(Number(big & 0x7fn) | 0x80)
    big >>= 7n
  }
  out.push(Number(big))
  return out
}

/** protobuf float（wire type 5）字段编码 */
function f32Bytes(tag: number, val: number): number[] {
  const b = new Uint8Array(4)
  new DataView(b.buffer).setFloat32(0, val, true)
  return [tag, b[0], b[1], b[2], b[3]]
}

/**
 * 合成一个最小可用的 header.bin：
 *   field 2 = width、field 3 = height、field 11 = bgcolor、field 13 = 背景线（可选）。
 * bgcolor 用 protobuf int32 编码（0xAARRGGBB）：-1 = 不透明白（默认），0x80FF0000 = 半透明红，依此类推。
 * 背景线 f1=颜色 f2=间距 f3=是否交错(1=网格) f4=线宽，与 board.js 的读法一致
 * （新笔记不上传 header.bin，这些值由截图推断，见 utils/noteBackground）。
 * board.js 用 `BigInt.asIntN(32, v)` 解码，自动把 varint 还原成有符号 int32 → col() 转为 #RRGGBB + alpha。
 */
function makeHeaderBlob(width: number, height: number, bgcolor: number = -1, bgLines?: BgLines): Blob {
  const bytes = [
    ...varintBytes(0x10), ...varintBytes(width),             // field 2 = width (uint32)
    ...varintBytes(0x18), ...varintBytes(height),            // field 3 = height (uint32)
    ...varintBytes(0x58), ...int32VarintBytes(bgcolor)       // field 11 = bgcolor (int32)
  ]
  // field 13 = 背景线（横线 / 交错网格）。board.js 读 f1=颜色 f2=间距 f3=是否交错 f4=线宽。
  if (bgLines && bgLines.spacing > 0) {
    const body = [
      ...varintBytes(0x08), ...int32VarintBytes(bgLines.color),
      ...f32Bytes(0x15, bgLines.spacing),
      ...varintBytes(0x18), ...varintBytes(bgLines.cross ? 1 : 0),
      ...f32Bytes(0x25, bgLines.width)
    ]
    bytes.push(...varintBytes(0x6a), ...varintBytes(body.length), ...body)
  }
  return new Blob([new Uint8Array(bytes)], { type: 'application/octet-stream' })
}

/**
 * 创建笔记按需 VFS。NoteViewer 接受 `{ names, read }` 形式的 source，
 * 因此可以把返回值直接传给 `<NoteViewer :source="vfs" />`。
 */
export async function createNoteVfs(opts: NoteVfsOptions): Promise<NoteVfs> {
  const fetchBlob = opts.fetchBlob || defaultFetchBlob
  // 按 pageKey 升序
  const pages = [...opts.pages].sort((a, b) => a.pageKey - b.pageKey)

  /**
   * 该页的画布配置：新版笔记不上传 header.bin，底色与背景线都存在 page_mdb/data.mdb 里
   * （HeaderEntity.defaultBackgroundColor / BackgroundLineConfigEntity）。
   * 同一 mdb 只下载解析一次，底色与背景线共用结果。
   */
  const mdbCfgCache = new Map<string, Promise<{ bgColor: number | null; bgLines: BgLines | null }>>()
  function pageMdbConfig(mdbUrl?: string): Promise<{ bgColor: number | null; bgLines: BgLines | null }> {
    if (!mdbUrl) return Promise.resolve({ bgColor: null, bgLines: null })
    let job = mdbCfgCache.get(mdbUrl)
    if (!job) {
      job = (async () => {
        try {
          const blob = await fetchBlob(mdbUrl)
          const u8 = new Uint8Array(await blob.arrayBuffer())
          return { bgColor: readHeaderBgColor(u8), bgLines: readBgLineConfig(u8) }
        } catch {
          return { bgColor: null, bgLines: null }
        }
      })()
      mdbCfgCache.set(mdbUrl, job)
    }
    return job
  }

  // 构建 names：每页 header.bin / snapshot.bin / touch；全局 res/image/*。
  // 注意：note 视图只关心 inspectNote 能识别出 page 目录，因此 touch 文件名按
  // `<pageKey>/<basename(touchUrl)>` 形式填入即可。
  const names: string[] = []
  const pageDirMap = new Map<string, NotePage>()            // '1/' -> page
  /** 新版笔记的 mdb 在虚拟目录里的固定相对路径（NoteViewer 按此约定探测） */
  const MDB_VIRTUAL = 'page_mdb/data.mdb'
  for (const p of pages) {
    const dir = String(p.pageKey) + '/'
    pageDirMap.set(dir, p)
    names.push(dir + 'header.bin')
    names.push(dir + 'snapshot.bin')
    if (p.mdbUrl) names.push(dir + MDB_VIRTUAL)
    for (const tu of p.touchUrls || []) {
      const base = tu.split('/').pop() || ('touch_' + p.pageKey + '.bin')
      names.push(dir + base)
    }
  }
  const imageMap = new Map<string, NoteImage>()            // 'res/image/x.png' -> image
  for (const img of opts.images || []) {
    const key = 'res/image/' + img.fileName
    imageMap.set(key, img)
    names.push(key)
  }

  // 字节缓存（URL → Uint8Array），避免同一资源被多次拉取
  const cache = new Map<string, Uint8Array>()
  const cachePromise = new Map<string, Promise<Uint8Array>>()
  const remember = async (key: string, blob: Blob): Promise<Uint8Array> => {
    const u8 = new Uint8Array(await blob.arrayBuffer())
    cache.set(key, u8)
    return u8
  }

  /** 把 header.bin / snapshot.bin / touch / mdb 按"页 URL"统一去重 */
  const pageUrlOf = (name: string): string | null => {
    const seg = name.split('/')
    if (seg.length < 2) return null
    const dir = seg[0] + '/'
    const base = seg[seg.length - 1]
    const p = pageDirMap.get(dir)
    if (!p) return null
    if (base === 'snapshot.bin') return p.snapshotUrl
    if (/^data\.mdb$/i.test(base)) return p.mdbUrl || null
    if (/_touch\.bin$/i.test(base)) {
      const t = (p.touchUrls || []).find(u => (u.split('/').pop() || '') === base)
      return t || null
    }
    return null
  }

  async function read(name: string): Promise<Uint8Array | null> {
    const seg = name.split('/')
    const base = seg[seg.length - 1]

    // header.bin → 按页面尺寸 + 背景色 + 背景线合成
    if (base === 'header.bin') {
      const dir = seg[0] + '/'
      const p = pageDirMap.get(dir)
      const w = p?.width || 1080
      const h = p?.height || 1920
      // 底色与背景线以该页 mdb 为准（HeaderEntity / BackgroundLineConfigEntity）；
      // mdb 取不到时才退回调用方按截图推断的结果
      const cfg = await pageMdbConfig(p?.mdbUrl)
      const bg = cfg.bgColor ?? (p?.bgcolor != null ? p.bgcolor : -1)
      const bgLines = cfg.bgLines || p?.bgLines
      const blob = makeHeaderBlob(w, h, bg, bgLines)
      return new Uint8Array(await blob.arrayBuffer())
    }

    // snapshot.bin / *_touch.bin → 走 OSS
    const pageUrl = pageUrlOf(name)
    if (pageUrl) {
      const hit = cache.get(pageUrl)
      if (hit) return hit
      const inflight = cachePromise.get(pageUrl)
      if (inflight) return inflight
      const p = fetchBlob(pageUrl).then(blob => remember(pageUrl, blob))
      cachePromise.set(pageUrl, p)
      return p
    }

    // res/image/* → 共享图片
    if (name.startsWith('res/image/')) {
      const img = imageMap.get(name)
      if (!img) return null
      const hit = cache.get(img.url)
      if (hit) return hit
      const inflight = cachePromise.get(img.url)
      if (inflight) return inflight
      const p = fetchBlob(img.url).then(blob => remember(img.url, blob))
      cachePromise.set(img.url, p)
      return p
    }

    return null
  }

  return { names, read }
}