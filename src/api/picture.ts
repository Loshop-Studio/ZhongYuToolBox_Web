/**
 * 图库模块接口（复刻 index.js loadPictures / doUploadPicture）
 * - 列表：GET /api/services/app/PictureLibrary/GetAllPicturesFromLibrary
 * - 上传记录：POST /api/services/app/PictureLibrary/AddPictureAsync
 */
import { request } from '@/utils/request'
import { accountKey } from '@/utils/localData'

export interface PictureItem {
  id: string | number
  picture: string
  name: string
  size: string
  createTime: string
  [key: string]: any
}

export interface PictureListResult {
  items: PictureItem[]
  totalCount: number
}

/** 分页拉取图库（isRecycleBin: false=正常, true=回收站） */
export async function getPictures(
  isRecycleBin: boolean,
  skip: number,
  maxResultCount: number,
  signal?: AbortSignal
): Promise<PictureListResult> {
  const resp = await request<{ result: PictureListResult }>(
    `/api/services/app/PictureLibrary/GetAllPicturesFromLibrary?SkipCount=${skip}&MaxResultCount=${maxResultCount}&IsRecycleBin=${isRecycleBin}`,
    { method: 'GET', signal }
  )
  return resp.result
}

function pictureIds(values: (string | number)[]): number[] {
  const ids = [...new Set(values.map(value => {
    const id = Number(value)
    if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(id) || id <= 0) throw new Error('图片编号无效')
    return id
  }))]
  if (!ids.length || ids.length > 200) throw new Error('请选择 1–200 张图片')
  return ids
}
/** Contracts from com.zykj.manage 1.1.2 / PictureService (module_gallery_release).
 * POST receives a JSON Long[]; DELETE uses repeated ids query parameters, no body.
 * Refresh current-account membership before changing either collection.
 */
async function mutatePictures(action: 'move' | 'recover' | 'delete', values: (string | number)[], signal?: AbortSignal) {
  const ids = pictureIds(values), key = accountKey(), recycled = action !== 'move'
  const ensure = () => { if (signal?.aborted || accountKey() !== key) throw new Error('操作已取消或账号已切换') }
  ensure()
  const found = new Set<number>()
  let skip = 0
  for (;;) {
    const page = await getPictures(recycled, skip, 200, signal); ensure()
    for (const item of page.items || []) {
      const id = Number(item.id)
      if (ids.includes(id)) found.add(id)
    }
    if (ids.every(id => found.has(id))) break
    skip += page.items?.length || 0
    if (!page.items?.length || skip >= page.totalCount) throw new Error(recycled ? '图片已不在回收站，请刷新后重试' : '图片已不在图库，请刷新后重试')
  }
  const root = '/api/services/app/PictureLibrary/'
  if (action === 'delete') {
    const query = new URLSearchParams()
    ids.forEach(id => query.append('ids', String(id)))
    await request(root + 'DeletePicture?' + query, { method: 'DELETE', signal })
  } else {
    await request(root + (action === 'move' ? 'MoveToRecycleBinAsync' : 'RecoverPictureFromRecycleBinAsync'), {
      method: 'POST', body: JSON.stringify(ids), signal
    })
  }
  ensure()
  return ids
}
export const movePicturesToRecycleBin = (ids: (string | number)[], signal?: AbortSignal) => mutatePictures('move', ids, signal)
export const recoverPictures = (ids: (string | number)[], signal?: AbortSignal) => mutatePictures('recover', ids, signal)
export const deleteRecycledPictures = (ids: (string | number)[], signal?: AbortSignal) => mutatePictures('delete', ids, signal)

/** 上传后登记图片到图库 */
export async function addPicture(
  picture: string,
  name: string,
  size: string
): Promise<any> {
  return request(`/api/services/app/PictureLibrary/AddPictureAsync`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      AppName: 'com.zykj.manage',
      AppVersion: '32'
    },
    body: JSON.stringify({ picture, name, size })
  })
}

/** 格式化文件大小（复刻 index.js formatFileSize） */
export function formatFileSize(bytes: number): string {
  if (!bytes) return '0 B'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB'
  return (bytes / 1024 / 1024).toFixed(2) + ' MB'
}
