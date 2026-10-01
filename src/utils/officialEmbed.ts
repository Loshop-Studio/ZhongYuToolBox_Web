import CryptoJS from 'crypto-js'

/** Match the official school web client's encrypted userInfo storage format. */
export function officialUserBootstrap(info: Record<string, unknown>, webOrigin: string): string {
  const digest = CryptoJS.enc.Base64.stringify(CryptoJS.SHA1('userId'))
  const key = CryptoJS.enc.Utf8.parse(digest.slice(-16))
  const value = CryptoJS.AES.encrypt(JSON.stringify(info), key, {mode:CryptoJS.mode.ECB,padding:CryptoJS.pad.Pkcs7}).toString()
  return `(function(){if(location.origin!==${JSON.stringify(new URL(webOrigin).origin)})return;var value=${JSON.stringify(value)};sessionStorage.setItem('userInfo',value);localStorage.setItem('userInfo',value);})();`
}
export function officialEmbedUrl(base:string, apiHost:string, token:string, kind:'course'|'column') {
  const url = new URL(kind === 'course' ? 'index.html' : 'navPage.html', base.replace(/\/+$/, '') + '/')
  url.search = new URLSearchParams({apiHost,apiToken:token}).toString()
  url.hash = kind === 'course' ? '/index/courseChoosing/StudentsCoursesList' : '/list?messageType=pager'
  return url.href
}
