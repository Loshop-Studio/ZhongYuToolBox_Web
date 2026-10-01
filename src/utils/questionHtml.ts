function unwrapTex(source: string): string {
  return source.trim().replace(/^\$\$([\s\S]*)\$\$$/, '$1').replace(/^\$([\s\S]*)\$$/, '$1')
    .replace(/^\\\(([\s\S]*)\\\)$/, '$1').replace(/^\\\[([\s\S]*)\\\]$/, '$1')
}
/** Preserve only inert formula sources and numeric image dimensions, never editor CSS. */
function preserveMath(doc: Document) {
  for (const el of [...doc.body.querySelectorAll<HTMLElement>('img,span,math')]) {
    let tex = el.getAttribute('data-math-latex') || el.getAttribute('data-latex') || el.getAttribute('data-tex') || ''
    const marked = /(?:^|\s)(?:math-tex|mathquill-embedded-latex|latex|equation|Wirisformula)(?:\s|$)/i.test(el.className || '')
    if (!tex && el.tagName === 'MATH') tex = el.querySelector('annotation[encoding="application/x-tex"]')?.textContent || ''
    if (!tex && marked) {
      const source = el.tagName === 'IMG' ? el.getAttribute('alt') || '' : el.textContent || ''
      if (el.tagName !== 'IMG' || /[a-zA-Z0-9\\$=+^_]/.test(source)) tex = source
    }
    if (!tex && el.tagName === 'IMG') {
      const alt = el.getAttribute('alt') || ''
      if (/^\s*(?:\$|\\[([])|\\(?:frac|sqrt|sum|int|times|div|leq|geq|alpha|beta)\b/.test(alt)) tex = alt
    }
    if (tex && tex.length <= 16000) {
      // Keep image previews intact in the app; only the PDF renderer replaces them.
      const replacement = el.tagName === 'IMG' ? el : doc.createElement('span')
      replacement.setAttribute('data-math-latex', unwrapTex(tex))
      if (el.getAttribute('data-math-display') === 'true' || el.getAttribute('data-display') === 'true' || /^\s*(?:\$\$|\\\[)/.test(tex)) replacement.setAttribute('data-math-display', 'true')
      if (replacement !== el) { replacement.textContent = unwrapTex(tex); el.replaceWith(replacement) }
    }
    if (el.tagName === 'IMG') {
      for (const dimension of ['width', 'height']) {
        const relative = 'data-print-' + dimension
        const value = el.style.getPropertyValue(dimension) || el.getAttribute(relative) || el.getAttribute(dimension) || ''
        el.removeAttribute(relative)
        if (/^\d+(?:\.\d+)?em$/.test(value) && parseFloat(value) > 0 && parseFloat(value) <= 100) { el.setAttribute(relative, value); el.removeAttribute(dimension) }
        else if (/^\d+(?:\.\d+)?(?:px)?$/.test(value) && +value.replace('px', '') > 0 && +value.replace('px', '') <= 10000) el.setAttribute(dimension, value.replace('px', ''))
        else el.removeAttribute(dimension)
      }
    }
  }
}
/** Strict passive HTML subset for cached/imported questions and local exports. */
export function safeQuestionHtml(html: string, base = localStorage.getItem('apiBaseUrl') || location.href): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  preserveMath(doc)
  const allowed = new Set('DIV P SPAN BR HR TABLE THEAD TBODY TFOOT TR TD TH IMG B STRONG I EM U SUB SUP OL UL LI H1 H2 H3 H4 PRE CODE BLOCKQUOTE'.split(' '))
  for (const el of [...doc.body.querySelectorAll('*')]) {
    if (!allowed.has(el.tagName)) {
      if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'FORM', 'INPUT', 'BUTTON', 'LINK', 'META'].includes(el.tagName)) el.remove()
      else el.replaceWith(...el.childNodes)
      continue
    }
    for (const attr of [...el.attributes]) {
      const math = ['SPAN', 'IMG'].includes(el.tagName) && ['data-math-latex', 'data-math-display'].includes(attr.name)
      const dimension = el.tagName === 'IMG' && ['width', 'height', 'data-print-width', 'data-print-height'].includes(attr.name)
      if (!math && !dimension && !['src', 'alt', 'colspan', 'rowspan'].includes(attr.name)) el.removeAttribute(attr.name)
    }
    if (el.tagName === 'IMG') {
      try {
        const url = new URL(el.getAttribute('src') || '', base)
        if (!['http:', 'https:', 'data:'].includes(url.protocol) || (url.protocol === 'data:' && !/^data:image\/(png|jpeg|webp|gif);base64,/i.test(url.href))) el.remove()
        else el.setAttribute('src', url.href)
      } catch { el.remove() }
    }
  }
  return doc.body.innerHTML
}
export function parseQuestionHtml(html: string, base?: string) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return {
    stem: safeQuestionHtml(doc.querySelector('.stem')?.innerHTML || '', base),
    answer: safeQuestionHtml(doc.querySelector('.answers')?.innerHTML || '', base),
    analysis: [...doc.querySelectorAll('.analysis')].map(el => safeQuestionHtml(el.innerHTML, base)).join('<hr>')
  }
}
