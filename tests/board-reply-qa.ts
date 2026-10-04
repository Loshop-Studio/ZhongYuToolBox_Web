import { fabric } from 'fabric'
import { createApp, nextTick } from 'vue'
import { createRouter, createMemoryHistory } from 'vue-router'
import ElementPlus from 'element-plus'
import BoardView from '../src/views/BoardView.vue'

/** Exercises the actual Fabric editor. No uploads or message API calls. */
export async function boardReplyQa(check: (ok: boolean, message: string) => void) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/quora/:sessionId/board', component: BoardView }] })
  await router.push('/quora/77/board')
  const root = document.createElement('div')
  root.style.cssText = 'width:390px;height:700px;position:fixed;left:0;top:0;background:white;z-index:9999'
  document.body.append(root)
  const app = createApp(BoardView).use(router).use(ElementPlus)
  app.mount(root)
  const settle = async () => { await nextTick(); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))) }
  const button = (name: string) => {
    const found = [...root.querySelectorAll('button')].find(b => b.textContent?.trim() === name)
    if (!found) throw Error('Missing board control: ' + name)
    found.click()
  }
  // Capture the real editor instance when history is restored; inspect Fabric's
  // resulting objects, not the JSON argument that the implementation passed in.
  let restoredCanvas: fabric.Canvas | undefined
  const loadOriginal = fabric.Canvas.prototype.loadFromJSON
  fabric.Canvas.prototype.loadFromJSON = function (...args: Parameters<typeof loadOriginal>) {
    restoredCanvas = this
    return loadOriginal.apply(this, args)
  }
  try {
    await settle()
    const canvas = root.querySelector('canvas.lower-canvas') as HTMLCanvasElement
    const zoom = Number(root.querySelector('.zoom-label')!.textContent!.replace('%', ''))
    check(zoom > 0 && zoom <= 100 && canvas.width > 0 && canvas.height > 0, '实际回复画板正缩放及有效像素尺寸')
    const describe = () => { const data=canvas.getContext('2d')!.getImageData(0,0,canvas.width,canvas.height).data; let ink=0; for(let i=0;i<data.length;i+=4)if(data[i+3]>0 && (data[i]<250 || data[i+1]<250 || data[i+2]<250))ink++;return {width:canvas.width,height:canvas.height,ink,corner:[...data.slice(0,4)]} };
    const empty = canvas.toDataURL()
    button('文字'); await settle()
    const textarea = document.querySelector('textarea[data-fabric-hiddentextarea]') as HTMLTextAreaElement
    check(Boolean(textarea), '实际 Fabric 文字编辑器可用')
    textarea.value = '编辑后的回复'; textarea.selectionStart = textarea.selectionEnd = textarea.value.length
    textarea.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: textarea.value }))
    button('选择'); await settle()
    const textInfo=describe(); const text = canvas.toDataURL()
    check(textInfo.ink > 0 && text !== empty, '输入文字实际绘制到画布')
    button('撤销'); await settle(); button('撤销'); await settle()
    check(describe().ink === 0, '撤销文字输入和添加，恢复空画板')
    button('重做'); await settle(); button('重做'); await settle()
    const object = restoredCanvas?.getObjects()[0] as fabric.Textbox | undefined
    check(object?.text === '编辑后的回复' && describe().ink > 0, '重做实际恢复编辑后的文字和可见笔迹')
    restoredCanvas!.setActiveObject(object!)
    object!.enterEditing()
    await settle()
    const restored = document.querySelector('textarea[data-fabric-hiddentextarea]') as HTMLTextAreaElement | null
    check(restored?.value === '编辑后的回复', '恢复的文字仍可进入编辑器继续编辑')
    object!.exitEditing()
    const swatch = root.querySelector('.swatch[style*="255, 0, 0"]') as HTMLElement
    if (!swatch) throw Error('Missing red swatch')
    swatch.click(); await settle()
    check(object!.fill === '#FF0000', '文字颜色修改应用到实际对象')
    button('撤销'); await settle()
    check(restoredCanvas!.getObjects()[0].fill === '#000000', '撤销恢复原文字颜色')
    button('重做'); await settle()
    check(restoredCanvas!.getObjects()[0].fill === '#FF0000', '重做恢复新文字颜色')
    const before = canvas.getBoundingClientRect().width
    button('−'); await settle()
    check(canvas.getBoundingClientRect().width < before, '手机适配缩放下缩小按钮不会反向放大')
    button('+'); await settle()
    check(canvas.getBoundingClientRect().width > 0, '缩放同步保留有效 Fabric 画布尺寸')
    button('清空'); await settle()
    const pixels = canvas.getContext('2d')!.getImageData(0, 0, 1, 1).data
    check(pixels[0] === 255 && pixels[1] === 255 && pixels[2] === 255, '清空保留白色背景')
  } finally { fabric.Canvas.prototype.loadFromJSON=loadOriginal; app.unmount(); root.remove() }
}
