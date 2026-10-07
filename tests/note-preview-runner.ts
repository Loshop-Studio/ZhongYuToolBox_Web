import 'element-plus/dist/index.css'
import { notePreviewQa } from './note-preview-qa'
// Standalone localhost QA has no native bridge; bypass the remote browser proxy
// for the synthetic data/blob screenshots used by the export checks.
if (!(window as any).nativeHost) Object.defineProperty(window, 'nativeHost', { value: { kind: 'webview2' } })
const checks: string[] = []
notePreviewQa((ok, name) => { if (!ok) throw Error(name); checks.push(name) }).then(() => {
  document.getElementById('result')!.textContent = JSON.stringify({ passed: true, checks }, null, 2)
}).catch(error => {
  document.getElementById('result')!.textContent = JSON.stringify({ passed: false, error: String(error.stack || error), checks }, null, 2)
})
