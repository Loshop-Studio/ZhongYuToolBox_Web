const fs = require('node:fs')
const path = require('node:path')
const uuid = 'a888b5fb-e65d-4611-a3af-1f80a0fb6ced'
const allowed = new Set(['page_router.bin', ...[
  '059848e4-1971-47fb-9e47-517266cdef05_matrix.bin',
  'a2b4fb47-3623-45be-9fe9-57fc62e66651_file.bin',
  'e339e39b-64d9-4de0-bfaa-dace2a3f8e7d_command.bin',
  'header.bin', 'router.bin', 'screenshot.png', 'snapshot.bin'
].map(name => uuid + '/' + name)])

/** Expose only these public bundled templates, never arbitrary filesystem paths. */
function readNoteTemplate(root, relative) {
  if (typeof relative !== 'string' || !allowed.has(relative)) throw new Error('不支持此笔记模板路径')
  return new Uint8Array(fs.readFileSync(path.join(root, relative)))
}
module.exports = { readNoteTemplate }
