import { AUTHOR_STATS_ENABLED, TRACK_API } from '@/config'

/** Preserve the original author's login-count contract for upstream builds.
 * The aoki fork defaults to off. Reporting never controls school authentication.
 */
export async function reportLogin(school: string, username: string): Promise<void> {
  if (!AUTHOR_STATS_ENABLED || !school || !username) return
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5000)
  try {
    await fetch(`${TRACK_API}/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ school, username, deviceId: '' }),
      signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer'
    })
  } catch { /* Statistics must never block login, even if the author's server is unavailable. */ }
  finally { clearTimeout(timer) }
}
export async function checkVersion(): Promise<void> {}
