/**
 * Electron 预加载脚本
 * 通过 contextBridge 向渲染进程暴露有限、安全的原生能力。
 * 当前提供文件保存接口，对应 src/utils/saveFile.ts 中 electron 分支的
 * window.electronAPI.saveFile(arrayBuffer, filename)。
 */
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  /** Read a whitelisted bundled note template in packaged file:// mode. */
  readNoteTemplate: relative => ipcRenderer.invoke('read-note-template', relative),
  /**
   * 保存文件到用户指定路径。
   * @param {ArrayBuffer} arrayBuffer 文件二进制内容
   * @param {string} filename 默认文件名
   * @returns {Promise<boolean>} 是否成功保存
   */
  saveFile: async (arrayBuffer, filename) => {
    try {
      const res = await ipcRenderer.invoke('save-file', arrayBuffer, filename)
      return !res.canceled && Boolean(res.filePath)
    } catch (e) {
      console.error('[electronAPI.saveFile] 失败', e)
      return false
    }
  },

  /**
   * 获取本机稳定设备号（主进程在 userData 下持久化，重装前不变）。
   * @returns {Promise<string>}
   */
  getDeviceId: async () => {
    try {
      return (await ipcRenderer.invoke('get-device-id')) || ''
    } catch (e) {
      console.error('[electronAPI.getDeviceId] 失败', e)
      return ''
    }
  },

  /**
   * 获取本地风控评分：{ devScore, zyScore, devFound, zyFound, scanned }。
   * @returns {Promise<object>}
   */
  getRiskScores: async () => {
    try {
      return await ipcRenderer.invoke('get-risk-scores')
    } catch (e) {
      console.error('[electronAPI.getRiskScores] 失败', e)
      return { devScore: 0, zyScore: 0, devFound: [], zyFound: [], scanned: false }
    }
  }
})
