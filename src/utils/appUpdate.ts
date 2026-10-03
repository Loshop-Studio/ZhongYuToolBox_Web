/** Public release metadata only. Never attach school credentials or author telemetry. */
export interface AppRelease { tag: string; title: string; notes: string; url: string; publishedAt: string; assets: { name: string; size: number; url: string }[] }
export function versionParts(version: string): number[] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-aoki)?(?:[ ._-]?patch[ ._-]?(\d+))?$/i.exec(version.trim())
  return match ? match.slice(1).map(n => Number(n || 0)) : null
}
export function compareVersions(a: string, b: string): number | null {
  const x = versionParts(a), y = versionParts(b)
  if (!x || !y) return null
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1
  return 0
}
function githubLink(value: unknown, repository: string, kind: 'release' | 'asset'): string {
  if (typeof value !== 'string') throw new Error('发布链接无效')
  const url = new URL(value)
  const prefix = '/' + repository + (kind === 'release' ? '/releases/tag/' : '/releases/download/')
  if (url.origin !== 'https://github.com' || !url.pathname.startsWith(prefix) || url.username || url.password) throw new Error('发布链接不是当前仓库的 GitHub 地址')
  return url.href
}
export async function fetchLatestRelease(repository: string, signal?: AbortSignal): Promise<AppRelease> {
  if (!['nickfox395/ZhongYuToolBox_Web', 'Loshop-Studio/ZhongYuToolBox_Web'].includes(repository)) throw new Error('未知的发布仓库')
  const response = await fetch(`https://api.github.com/repos/${repository}/releases/latest`, { credentials: 'omit', signal, headers: { Accept: 'application/vnd.github+json' } })
  if (!response.ok) throw new Error(response.status === 404 ? '此仓库暂时没有正式发布版本' : response.status === 403 || response.status === 429 ? 'GitHub 请求频率受限，请稍后重试或直接打开发布页' : `GitHub 返回 HTTP ${response.status}`)
  const data = await response.json()
  if (data.draft || data.prerelease || typeof data.tag_name !== 'string') throw new Error('没有可用的正式发布版本')
  return { tag: data.tag_name, title: String(data.name || data.tag_name), notes: typeof data.body === 'string' ? data.body : '该版本没有填写更新说明。', url: githubLink(data.html_url, repository, 'release'), publishedAt: String(data.published_at || ''), assets: (Array.isArray(data.assets) ? data.assets : []).filter((a: any) => a.state === 'uploaded').map((a: any) => ({ name: String(a.name), size: Number(a.size) || 0, url: githubLink(a.browser_download_url, repository, 'asset') })) }
}
