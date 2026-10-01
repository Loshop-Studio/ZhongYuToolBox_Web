/** Strict passive HTML subset for cached/imported questions and local exports. */
export function safeQuestionHtml(html: string, base = localStorage.getItem('apiBaseUrl') || location.href): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const allowed = new Set('DIV P SPAN BR HR TABLE THEAD TBODY TFOOT TR TD TH IMG B STRONG I EM U SUB SUP OL UL LI H1 H2 H3 H4 PRE CODE BLOCKQUOTE'.split(' '))
  for (const el of [...doc.body.querySelectorAll('*')]) {
    if (!allowed.has(el.tagName)) {
      if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'FORM', 'INPUT', 'BUTTON', 'LINK', 'META'].includes(el.tagName)) el.remove()
      else el.replaceWith(...el.childNodes)
      continue
    }
    for (const attr of [...el.attributes]) {
      if (!['src', 'alt', 'colspan', 'rowspan'].includes(attr.name)) el.removeAttribute(attr.name)
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
