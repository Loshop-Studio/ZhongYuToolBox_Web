import type { NoteResource } from '@/api/note'
import { proxyImgSrc } from './proxy'
import type { NotePage, NoteImage } from './noteVfs'

export const NOTE_IMAGE_EXT = /\.(jpg|jpeg|png|webp|gif|bmp)$/i
export interface NoteImageEntry { raw: string; imgSrc: string }
export interface NotePageData { thumbnail?: NoteImageEntry; originals: NoteImageEntry[] }
export const noteResourceUrl = (resource: NoteResource) => /^https?:\/\//i.test(resource.ossImageUrl)
  ? resource.ossImageUrl : 'http://friday-note.oss-cn-hangzhou.aliyuncs.com/' + resource.ossImageUrl.replace(/^\//, '')

export function collectNoteResources(resources: NoteResource[]) {
  const pageMap: Record<number, NotePageData> = {}
  const boards = new Map<number, NotePage>(), images = new Map<string, NoteImage>()
  for (const item of resources) {
    const key = Number(item.pageIndex) + 1
    if (!Number.isSafeInteger(key) || key < 1) continue
    const raw = noteResourceUrl(item), path = raw.split(/[?#]/)[0]
    const page: NotePage = boards.get(key) || { pageKey: key, snapshotUrl: '' }
    if (item.resourceType === 1) {
      if (/snapshot\.bin$/i.test(path)) { page.snapshotUrl = raw; pageMap[key] ||= { originals: [] } }
      else if (/header\.bin$/i.test(path)) page.headerUrl = raw
      else if (/data\.mdb$/i.test(path)) page.mdbUrl = raw
      else if (/_touch\.bin$/i.test(path)) (page.touchUrls ||= []).push(raw)
      else if (!/lock\.mdb$/i.test(path)) (page.files ||= []).push({ fileName: path.split('/').pop()!, url: raw })
      boards.set(key, page)
    } else if (NOTE_IMAGE_EXT.test(path)) {
      const data = pageMap[key] ||= { originals: [] }
      const image = { raw, imgSrc: proxyImgSrc(raw) }
      if (item.resourceType === 2) data.thumbnail = image
      else {
        data.originals.push(image)
        if (item.resourceType === 0) {
          const fileName = path.split('/').pop()!
          images.set(fileName, { fileName, url: raw })
        }
      }
    }
  }
  return { pageMap, pages: Object.keys(pageMap).map(Number).sort((a, b) => a - b),
    boards: [...boards.values()].filter(p => p.snapshotUrl).sort((a, b) => a.pageKey - b.pageKey), images: [...images.values()] }
}
