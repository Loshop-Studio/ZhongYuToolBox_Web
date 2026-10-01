import { safeQuestionHtml } from '../src/utils/questionHtml'
import { prepareMistakeMath } from '../src/utils/mistakeMath'
import { loadMistakePrintFont, renderQuestion, type ExportQuestion } from '../src/utils/mistakePdf'

export const mathPrintQuestion: ExportQuestion = {
  title: '公式与正文大小对照',
  stem: String.raw`<p>正文：数学 ABC xyz 0123456789；公式：\(a+b=3\)，乘除：\(a\times b\div c\leq d\)。</p>
    <p>解方程 \(x^2-2x-3=0\)，求 \(\sqrt{x+1}\)；下标 \(a_n\) 与正文同行。</p>
    <p>分式 \(\frac{a+b}{c+d}\)，不等式 \(x\geq 0\)。</p>
    <span class="math-tex">\[\frac{x^2+1}{x-1}=\sqrt{x+2}\]</span>
    <p>编辑器大字号应归一：<span data-latex="\Huge x + y = 1"></span>；图片公式：<img src="https://fixture.invalid/formula.png" alt="\(a\times b=c\)"></p>`,
  answer: String.raw`<p>答案：\(x=-1\) 或 \(x=3\)。</p>`,
  analysis: String.raw`<p>解析：由 \(x^2-2x-3=(x+1)(x-3)\) 得结果。</p>`
}

export async function mistakeMathQa(check: (ok: boolean, message: string) => void) {
  await loadMistakePrintFont()
  const root = document.createElement('div')
  root.className = 'aoki-mistake-print'
  root.style.cssText = 'position:fixed;left:-10000px;width:720px;font:16.28px/1.5 "Aoki PDF Song",serif'
  const source = mathPrintQuestion.stem + '<p>价格 $5，另一件 $10；<code>\\(code\\)</code></p>'
  const cleaned = safeQuestionHtml(source)
  check(cleaned.includes('data-math-latex') && cleaned.includes('formula.png') && safeQuestionHtml(cleaned) === cleaned, '保留公式源码与原图片预览，反复清理不丢失公式')
  const unsafe = safeQuestionHtml('<span data-latex="\\href{javascript:alert(1)}{x}" onclick="bad()"></span><img src="https://fixture.invalid/diagram.png" style="width:160px;height:80px;position:fixed" onerror="bad()">')
  check(!/onclick|onerror|style=/.test(unsafe) && unsafe.includes('width="160"') && unsafe.includes('height="80"'), '仅保留图片数值尺寸，公式元数据不会放行脚本与任意 CSS')
  const bitmap = safeQuestionHtml('<img src="https://fixture.invalid/formula.png" style="height:1.2em">')
  check(bitmap.includes('data-print-height="1.2em"') && safeQuestionHtml(bitmap) === bitmap, '没有 LaTeX 源码的公式图片保留相对正文的 em 尺寸')
  root.innerHTML = cleaned
  document.body.append(root)
  try {
    await prepareMistakeMath(root)
    check(!root.querySelector('img'), '仅在 PDF 排版时用原图片的 LaTeX 源码替换公式图片')
    const maths = [...root.querySelectorAll<HTMLElement>('.katex')]
    const bodySize = parseFloat(getComputedStyle(root).fontSize)
    check(maths.length === 10 && maths.every(node => Math.abs(parseFloat(getComputedStyle(node).fontSize) - bodySize) < .01), '行内、独立、分式、根号及编辑器公式的主字号全部与正文一致')
    const operators = [...root.querySelectorAll<HTMLElement>('.mbin,.mrel')].filter(node => !node.closest('.katex-sizing'))
    check(operators.length > 10 && operators.every(node => Math.abs(parseFloat(getComputedStyle(node).fontSize) - bodySize) < .01), '加减乘除、等号和不等号没有默认 1.21 倍放大')
    check(root.querySelectorAll('.msupsub').length > 0 && [...root.querySelectorAll<HTMLElement>('.msupsub .katex-sizing')].some(node => parseFloat(getComputedStyle(node).fontSize) < bodySize), '上下标保留正常数学缩放，不挤压基线与根号分式')
    check(root.textContent!.includes('价格 $5，另一件 $10') && root.querySelector('code')?.textContent === '\\(code\\)', '金额和代码片段不会被当作公式转换')
    root.innerHTML = unsafe
    await prepareMistakeMath(root)
    check(!root.querySelector('a,script,iframe') && root.querySelector('img')?.getAttribute('width') === '160', '不可信 TeX 链接禁止执行，普通几何图保持原始显示尺寸')
    root.innerHTML = safeQuestionHtml('<span data-latex="\\frac{"></span>')
    let failed = false
    try { await prepareMistakeMath(root) } catch { failed = true }
    check(failed, '损坏的 LaTeX 中止导出并报错，不静默遗漏公式')
  } finally { root.remove() }
  // Compare printed ink, not just DOM rectangles: html2canvas uses per-font metrics.
  const baseline = await renderQuestion({title:'',stem:String.raw`<p>0123456789 \(0123456789\) 0123456789</p>`}, false)
  const context = baseline.getContext('2d')!
  context.font = '16.28px "Aoki PDF Song"'
  const digitsWidth = context.measureText('0123456789').width, gap = context.measureText(' ').width
  const pixels = context.getImageData(0,0,baseline.width,baseline.height).data
  const inkBottom = (left: number, right: number) => {
    let bottom = -1
    for(let y=0;y<baseline.height;y++) for(let x=Math.ceil(left*2);x<Math.floor(right*2);x++) {
      const at=(y*baseline.width+x)*4
      if(pixels[at]<160 && pixels[at+1]<160 && pixels[at+2]<160) bottom=y
    }
    return bottom
  }
  const textBottom = inkBottom(0,digitsWidth), mathBottom = inkBottom(digitsWidth+gap,digitsWidth+gap+81.4)
  const host=(window as any).nativeHost
  if(host) await host.saveFile(await (await new Promise<Blob>(resolve=>baseline.toBlob(resolve,'image/png'))).arrayBuffer(),'qa-math-baseline.png')
  check(textBottom>0 && mathBottom>=textBottom && mathBottom-textBottom<=5, `PDF 行内公式不高于正文且校正不超过 2.5 CSS 像素：正文 ${textBottom}，公式 ${mathBottom}`)
}
