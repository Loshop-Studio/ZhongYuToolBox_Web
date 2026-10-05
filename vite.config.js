import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';
export default defineConfig(function (_a) {
    var mode = _a.mode;
    return ({
        // electron / plus 产物都会被打包到本地、由 file://（或 5+ 本地 webview）直接加载，
        // 需要相对路径 base；否则绝对 /assets/... 在 file:// 下解析不到，导致整页白屏。
        // 其余模式（browser）仍用默认绝对 base 由服务器托管。
        base: ['electron', 'plus', 'android', 'ios'].includes(mode) ? './' : '/',
        plugins: [vue()],
        resolve: {
            alias: {
                '@': fileURLToPath(new URL('./src', import.meta.url))
            }
        },
        server: {
            port: 5173,
            host: true
        },
        // pdfjs-dist v4 是纯 ESM，且主包与 worker 必须共享同一份模块实例
        // （否则私有 # 字段不互通，报 "Cannot read from private field"）。
        // 因此将 pdfjs-dist 排除出依赖预构建，让主包与 worker 都从原始 .mjs 加载。
        optimizeDeps: {
            exclude: ['pdfjs-dist', 'ezy-board-viewer']
        },
        worker: {
            format: 'es'
        },
        build: {
            rollupOptions: {
                input: process.env.ZYTB_IOS_UPLOAD_QA === '1'
                    ? { app: fileURLToPath(new URL('./index.html', import.meta.url)), uploadQa: fileURLToPath(new URL('./tests/ios-upload-qa.html', import.meta.url)) }
                    : process.env.ZYTB_BUILD_QA === '1'
                        ? { app: fileURLToPath(new URL('./index.html', import.meta.url)), qa: fileURLToPath(new URL('./tests/native-qa.html', import.meta.url)) }
                        : fileURLToPath(new URL('./index.html', import.meta.url))
            }
        }
    });
});
