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
}

/** 请求 STS 临时凭证（复刻 GenerateTokenV2Async 调用） */
export async function generateStsToken(
  userId: string,
  fc: string,
  nonce: string
): Promise<StsCredential> {
  const ts = Date.now()
  const rawStr = `${userId}+${fc}+${FR}+${FT}+${FE}+${FO}+${nonce}+${ts}`
  const sign = md5Upper(rawStr)
  const data = await request('/api/services/app/ObjectStorage/GenerateTokenV2Async', {
    method: 'POST',
    headers: { Accept: 'application/json' },
    body: JSON.stringify({ fc: V_MAP[fc], fr: G_MAP[FR], ft: FT, fe: FE, fo: FO, nonce, ts, sign })
  })
  if (!data.result) throw new Error('获取 token 失败: ' + JSON.stringify(data))
  return data.result as StsCredential
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
  const nonce = nonceInput.trim() || generateNonce()
  const remoteFileName = fileNameInput.trim() || (file as File).name
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')

  const result = await generateStsToken(userId, fc, nonce)

  if (PLATFORM === 'android' || PLATFORM === 'ios') {
    const remoteFile = `${fc}/${FR}/${userId}/${dateStr}/${nonce}/${remoteFileName}`
    const endpoint = result.endpoint || `https://${result.bucket}.oss-cn-hangzhou.aliyuncs.com`
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

  const client = new OSS({
    region: result.region || 'oss-cn-hangzhou',
    accessKeyId: result.accessKeyId,
    accessKeySecret: result.accessKeySecret,
    stsToken: result.securityToken,
    bucket: result.bucket
  })

  const remoteFile = `${fc}/${FR}/${userId}/${dateStr}/${nonce}/${remoteFileName}`
  const uploaded = await client.put(remoteFile, file as any)
  if (uploaded.url) return uploaded.url

  const endpoint = result.endpoint || `https://${result.bucket}.oss-cn-hangzhou.aliyuncs.com`
  return endpoint.replace(/\/+$/, '') + '/' + remoteFile
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
