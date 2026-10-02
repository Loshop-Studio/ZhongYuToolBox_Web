import katex from 'katex'
import 'katex/dist/katex.min.css'
import './mistakeMath.css'

const delimiters = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|(?<!\\)\$([^$\n]+?)(?<!\\)\$/g

function formula(source: string, display: boolean): HTMLSpanElement {
  if (source.length > 16000) throw new Error('公式过长，请单独检查该题')
  const span = document.createElement('span')
  span.className = display ? 'aoki-print-formula aoki-print-display' : 'aoki-print-formula'
  // Imported editor font-size commands must not override the 12 pt print body.
  const tex = source.replace(/\\(?:Huge|huge|LARGE|Large|large|normalsize|small|footnotesize|scriptsize|tiny)\b/g, '')
  try {
    katex.render(tex, span, {displayMode: display, output: 'html', throwOnError: true,
      trust: false, strict: 'ignore', maxExpand: 1000, maxSize: 20, macros: {}})
  } catch { throw new Error('题目 LaTeX 公式无法排版，请检查公式内容：' + source.slice(0, 80)) }
  return span
}

/** Typeset only sanitized formula sources/text; no remote scripts, fonts or TeX links. */
export async function prepareMistakeMath(content: HTMLElement): Promise<void> {
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT)
  const texts: Text[] = []
  while (walker.nextNode()) {
    const text = walker.currentNode as Text
    if (!text.parentElement?.closest('pre,code,[data-math-latex]')) texts.push(text)
  }
  for (const text of texts) {
    const fragment = document.createDocumentFragment()
    let at = 0
    for (const match of text.data.matchAll(delimiters)) {
      // A pair of currency prices is not a math delimiter.
      if (match[4] && !/[a-zA-Z\\=+*/^_<>−×÷-]/.test(match[4]) && !/^\s*\d+(?:\.\d+)?\s*$/.test(match[4])) continue
      fragment.append(text.data.slice(at, match.index), formula(match[1] || match[2] || match[3] || match[4], !!(match[1] || match[2])))
      at = match.index! + match[0].length
    }
    if (at) { fragment.append(text.data.slice(at)); text.replaceWith(fragment) }
  }
  for (const source of [...content.querySelectorAll<HTMLElement>('[data-math-latex]')]) {
    source.replaceWith(formula(source.dataset.mathLatex || '', source.dataset.mathDisplay === 'true'))
  }
  await document.fonts.ready
  // Wait for each actually used local math font before taking the canvas snapshot.
  const fonts = new Set<string>()
  for (const node of content.querySelectorAll<HTMLElement>('.katex span')) {
    const style = getComputedStyle(node)
    fonts.add(`${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`)
  }
  await Promise.all([...fonts].map(async font => {
    const loaded = await document.fonts.load(font)
    if (font.includes('KaTeX_') && !loaded.length) throw new Error('PDF 数学字体加载失败，请重试导出')
  }))
}
