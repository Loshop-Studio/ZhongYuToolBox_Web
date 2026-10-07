/**
 * 阿里云 OSS 直传封装（1:1 复刻 index.js 的 uploadFile / fetchOssBaseUrl）
 *
 * 流程：调用 ObjectStorage/GenerateTokenV2Async 换取 STS 凭证，
 * 再用 ali-oss 直传到 {fc}/res/{userId}/{yyyyMMdd}/{nonce}/{fileName}。
 */
import OSS from 'ali-oss'
import CryptoJS from 'crypto-js'
import { PLATFORM } from '@/config'
import { request } from '@/utils/request'
import { ossDateStamp } from './ossUploadDate'

/** 上传类型 -> fc 数值映射（复刻 V_MAP） */
const V_MAP: Record<string, number> = {
  note_v2: 1,
  eval_v2: 2,
  quora_v2: 3,
  mistake_v2: 4,
  study_v2: 5,
  column_v2: 6,
  paper_v2: 7,
  revise_v2: 8,
  selection_v2: 9,
  manage_v2: 19
}

/** 资源分类 -> fr 数值映射（复刻 G_MAP） */
const G_MAP: Record<string, number> = { res: 1 }

const FR = 'res'
const FT = 2
const FE = ''
const FO = '0'

/** 缓存的 OSS 根地址 */
let ossBaseUrl = ''

export function getOssBaseUrl(): string {
  return ossBaseUrl
}

export function setOssBaseUrl(url: string): void {
  ossBaseUrl = url
}

/** MD5 大写（复刻 index.js md5） */
function md5Upper(str: string): string {
  return CryptoJS.MD5(str).toString().toUpperCase()
}

/** 生成 UUID 风格 nonce（复刻 generateNonce） */
export function generateNonce(): string {
  return (String(1e7) + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) =>
    (
      (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))) as number
    ).toString(16)
  )
}

export interface StsCredential {
  region?: string
  accessKeyId: string
  accessKeySecret: string
  securityToken: string
  bucket?: string
  endpoint?: string
  expiration?: string
}

/** OSS accepts HTTPS even when the legacy STS response advertises HTTP. */
export function secureOssEndpoint(credential: StsCredential): string {
  const endpoint = new URL(credential.endpoint || `https://${credential.bucket}.${credential.region || 'oss-cn-hangzhou'}.aliyuncs.com`)
  if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash || !['http:', 'https:'].includes(endpoint.protocol)) throw new Error('OSS endpoint 格式无效')
  if (endpoint.protocol === 'http:' && /\.aliyuncs\.com$/i.test(endpoint.hostname) && (!endpoint.port || endpoint.port === '80')) {
    endpoint.protocol = 'https:'; endpoint.port = ''
  }
  if (PLATFORM === 'ios' && endpoint.protocol !== 'https:') throw new Error('iOS OSS 上传需要 HTTPS endpoint')
  return endpoint.href.replace(/\/+$/, '')
}

/** 请求 STS 临时凭证（复刻 GenerateTokenV2Async 调用） */
export async function generateStsToken(
  userId: string,
  fc: string,
  nonce: string
): Promise<StsCredential> {
  return (await requestUploadGrant(userId, fc, nonce)).credential
}

async function requestUploadGrant(userId: string, fc: string, nonce: string) {
  const ts = Date.now()
  const rawStr = `${userId}+${fc}+${FR}+${FT}+${FE}+${FO}+${nonce}+${ts}`
  const sign = md5Upper(rawStr)
  const response = await request<Response>('/api/services/app/ObjectStorage/GenerateTokenV2Async', {
    method: 'POST',
    raw: true,
    headers: { Accept: 'application/json' },
    body: JSON.stringify({ fc: V_MAP[fc], fr: G_MAP[FR], ft: FT, fe: FE, fo: FO, nonce, ts, sign })
  })
  const data = await response.json()
  if (data?.success === false) throw new Error(data.error?.message || '官方接口拒绝上传授权')
  if (!data.result) throw new Error('获取 token 失败: ' + JSON.stringify(data))
  const serverTime = Date.parse(response.headers.get('Date') || '')
  return { credential: data.result as StsCredential, dateStamp: ossDateStamp(Number.isFinite(serverTime) ? serverTime : ts) }
}

export interface OssUploadSession {
  /** Fixed to the STS grant, not recomputed for every resource at midnight. */
  dateStamp: string
  upload(file: Blob | File, fileName?: string): Promise<string>
}

/** One grant covers one nonce directory; credentials never persist outside this operation. */
export async function createOssUploadSession(userId: string, fc: string, nonceInput = ''): Promise<OssUploadSession> {
  const nonce = nonceInput.trim() || generateNonce()
  const { credential: result, dateStamp } = await requestUploadGrant(userId, fc, nonce)
  const expiresAt = Date.parse(result.expiration || '')
  const client = PLATFORM === 'android' || PLATFORM === 'ios' ? null : new OSS({
    region: result.region || 'oss-cn-hangzhou', accessKeyId: result.accessKeyId,
    accessKeySecret: result.accessKeySecret, stsToken: result.securityToken, bucket: result.bucket, secure: true
  })
  return { dateStamp, async upload(file, fileNameInput = '') {
    if (Number.isFinite(expiresAt) && Date.now() >= expiresAt) throw new Error('OSS 临时上传授权已过期，请重试本次上传')
    const remoteFileName = fileNameInput.trim() || (file as File).name
    const remoteFile = `${fc}/${FR}/${userId}/${dateStamp}/${nonce}/${remoteFileName}`
    if (!client) {
      const endpoint = secureOssEndpoint(result)
      const date = new Date().toUTCString(), contentType = file.type || 'application/octet-stream'
      const canonical = ['PUT', '', contentType, date, `x-oss-security-token:${result.securityToken}`, `/${result.bucket}/${remoteFile}`].join('\n')
      const signature = CryptoJS.enc.Base64.stringify(CryptoJS.HmacSHA1(canonical, result.accessKeySecret))
      const url = endpoint.replace(/\/+$/, '') + '/' + remoteFile
      const response = await fetch(url, { method: 'PUT', body: file, headers: {
        Date: date, 'Content-Type': contentType, 'x-oss-security-token': result.securityToken,
        Authorization: `OSS ${result.accessKeyId}:${signature}`
      } })
      if (!response.ok) throw new Error(`OSS 上传失败(${response.status}): ${(await response.text()).slice(0, 200)}`)
      return url
    }
    const uploaded = await client.put(remoteFile, file as any)
    if (uploaded.url) return uploaded.url
    return secureOssEndpoint(result) + '/' + remoteFile
  } }
}

/**
 * 上传文件到 OSS（复刻 uploadFile，返回文件完整 URL）
 * @param file 文件/Blob
 * @param userId 用户 ID
 * @param fc 上传类型前缀，如 note_v2
 * @param nonceInput 指定 nonce，留空自动生成
 * @param fileNameInput 指定远端文件名（可含子路径），留空用 file.name
 */
export async function uploadFile(
  file: Blob | File,
  userId: string,
  fc: string,
  nonceInput = '',
  fileNameInput = ''
): Promise<string> {
  return (await createOssUploadSession(userId, fc, nonceInput)).upload(file, fileNameInput)
}

/** 获取并缓存 OSS 根地址（复刻 fetchOssBaseUrl） */
export async function fetchOssBaseUrl(userId: string): Promise<string> {
  if (ossBaseUrl) return ossBaseUrl
  const token = localStorage.getItem('token')
  if (!token) throw new Error('未登录')

  const nonce = generateNonce()
  const ts = Date.now()
  const rawStr = `${userId}+note_v2+res+1++0+${nonce}+${ts}`
  const sign = md5Upper(rawStr)

  const data = await request('/api/services/app/ObjectStorage/GenerateTokenV2Async', {
    method: 'POST', headers: { Accept: 'application/json' },
    body: JSON.stringify({ fc: 1, fr: 1, ft: 2, fe: '', fo: '0', nonce, ts, sign })
  })
  if (!data.result) throw new Error('获取 OSS 配置失败')
  const region = data.result.region || 'oss-cn-hangzhou'
  const bucket = data.result.bucket || 'ezy-sxz'
  ossBaseUrl = `https://${bucket}.${region}.aliyuncs.com/`
  return ossBaseUrl
}

/** 从服务端获取当前登录用户 ID（复刻 getUserId） */
export async function fetchUserId(): Promise<string> {
  const token = localStorage.getItem('token')
  if (!token) throw new Error('localStorage 中未找到 token')

  // The successful login already stored this ID; logout/account changes clear it.
  // Avoid a redundant raw fetch when Safari is opening the file picker.
  const cached = localStorage.getItem('userId')
  if (cached && cached !== '0') return cached
  const data = await request('/api/services/app/User/GetInfoAsync', { method: 'GET' })
  const id = data.result?.userId || data.result?.id
  if (id) return String(id)
  throw new Error('无法获取用户ID: ' + JSON.stringify(data))
}
