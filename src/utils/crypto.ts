/**
 * 加解密工具
 * - 中育 AES-ECB（密钥每日动态生成）
 * - 领创 AES-CBC（固定密钥/IV）
 * - MD5
 */
import CryptoJS from 'crypto-js'
import { generateAesKey, LINSPIRER } from '@/config'
import { logError } from '@/utils/errorText'

/** 中育 AES-ECB 加解密（复刻 window.aesEncrypt/aesDecrypt） */
function currentZyKey() { return CryptoJS.enc.Utf8.parse(generateAesKey()) }

export function aesEncrypt(data: string): string {
  const encrypted = CryptoJS.AES.encrypt(data, currentZyKey(), {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.Pkcs7
  })
  return encrypted.toString()
}

export function aesDecrypt(encryptedBase64Str?: string): string {
  if (!encryptedBase64Str) return ''
  try {
    const decrypted = CryptoJS.AES.decrypt(encryptedBase64Str, currentZyKey(), {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7
    })
    return decrypted.toString(CryptoJS.enc.Utf8)
  } catch (e) {
    logError('aesDecrypt', e)
    return ''
  }
}

/** 领创 AES-CBC 加解密（复刻 linspirer.js） */
const linKey = CryptoJS.enc.Utf8.parse(LINSPIRER.KEY)
const linIv = CryptoJS.enc.Utf8.parse(LINSPIRER.IV)

export function linspirerEncrypt(text: string): string {
  const encrypted = CryptoJS.AES.encrypt(text, linKey, {
    iv: linIv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7
  })
  return encrypted.toString()
}

export function linspirerDecrypt(b64text: string): string {
  const decrypted = CryptoJS.AES.decrypt(b64text, linKey, {
    iv: linIv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7
  })
  return decrypted.toString(CryptoJS.enc.Utf8)
}

export function md5(text: string): string {
  return CryptoJS.MD5(text).toString()
}
