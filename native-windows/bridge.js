(() => {
  // No privileged bridge in remote pages or embedded frames.
  if (window !== window.top || location.origin !== 'https://toolbox.local') return;
  let nextId = 0;
  const pending = new Map();
  const call = (method, args = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    window.chrome.webview.postMessage({ id, method, args });
  });
  window.chrome.webview.addEventListener('message', ({ data }) => {
    const item = pending.get(data.id);
    if (!item) return;
    pending.delete(data.id);
    data.error ? item.reject(new Error(data.error)) : item.resolve(data.result);
  });
  const host = {
    kind: 'webview2',
    getDeviceId: () => call('getDeviceId'),
    readNoteTemplate: async relative => {
      const base64 = await call('readNoteTemplate', { relative });
      return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    },
    saveFile: async (buffer, filename) => {
      const session = await call('beginSave', { filename });
      if (!session) return { canceled: true };
      try {
        const bytes = new Uint8Array(buffer);
        for (let offset = 0; offset < bytes.length; offset += 384 * 1024) {
          const chunk = bytes.subarray(offset, offset + 384 * 1024);
          let binary = '';
          for (let i = 0; i < chunk.length; i += 8192) binary += String.fromCharCode(...chunk.subarray(i, i + 8192));
          await call('writeSaveChunk', { session, offset, base64: btoa(binary) });
        }
        await call('finishSave', { session, size: bytes.length });
        return { canceled: false };
      } catch (error) {
        await call('abortSave', { session }).catch(() => {});
        throw error;
      }
    },
    openEmbedded: args => call('openEmbedded', args),
    resizeEmbedded: args => call('resizeEmbedded', args),
    closeEmbedded: args => call('closeEmbedded', args),
    getEmbeddedState: args => call('getEmbeddedState', args),
    setThemeDark: dark => call('setThemeDark', { dark })
  };
  Object.defineProperty(window, 'nativeHost', { value: Object.freeze(host) });
  // Compatibility for existing desktop utility callers, without Electron or Node.
  Object.defineProperty(window, 'electronAPI', { value: window.nativeHost });
})();
