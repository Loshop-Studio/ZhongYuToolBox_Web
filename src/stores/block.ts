import { reactive } from 'vue'

export type BlockKind = 'version' | 'ban'

/** 全局阻断状态：命中强制更新或风控封禁时，全屏弹窗阻止继续使用 */
export const blockState = reactive({
  active: false,
  title: '',
  message: '',
  kind: 'version' as BlockKind
})

export function setBlock(title: string, message: string, kind: BlockKind = 'version') {
  blockState.title = title
  blockState.message = message
  blockState.kind = kind
  blockState.active = true
}

export function clearBlock() {
  blockState.active = false
}
