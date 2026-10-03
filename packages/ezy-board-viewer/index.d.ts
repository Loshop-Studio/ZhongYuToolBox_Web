import type { DefineComponent, Plugin } from 'vue'

export interface BoardFile { path: string; blob: Blob | Uint8Array | ArrayBuffer }
/** zip（Blob/File/ArrayBuffer/Uint8Array/URL）、文件列表，或 createBoard() 返回的画板 */
export type BoardSource = Blob | File | ArrayBuffer | Uint8Array | string | BoardFile[] | Board

export interface EzyBoardViewerProps {
  /** zip（Blob / File / ArrayBuffer / Uint8Array / URL）、文件列表 [{ path, blob }]，或 createBoard() 返回的画板 */
  source?: BoardSource | null
  /** 'auto' 自动识别静态/录制，也可强制指定。默认 'auto' */
  mode?: 'auto' | 'static' | 'recording'
  /** 录制：载入后自动播放。默认 true */
  autoplay?: boolean
  loop?: boolean
  muted?: boolean
  /** 倍速档位。默认 [0.5, 0.75, 1, 1.25, 1.5, 2] */
  speeds?: number[]
  /** 音频起点计时基准。默认 'chain'（按 _audio.bin 自身命令链） */
  audioAnchor?: 'chain' | 'segment'
  /** 缩放下/上限，相对"适应窗口"的倍数。默认 0.25 / 8 */
  minZoom?: number
  maxZoom?: number
  /** 导出文件名（不含扩展名）。默认 'board' */
  fileName?: string
  fetchOptions?: RequestInit
  /** 右键 / 长按菜单。默认 true */
  contextMenu?: boolean
}

export interface EzyBoardLoadedInfo {
  kind: 'static' | 'recording'
  pages: number
  /** 录制总时长（ms），静态为 0 */
  duration: number
}

export interface EzyBoardViewerInstance {
  zoomIn(): void
  zoomOut(): void
  resetView(): void
  play(): void
  pause(): void
  toggle(): void
  seek(ms: number): void
  setRate(rate: number): void
  setMuted(muted: boolean): void
  /** 导出 SVG，返回 Blob；download:true 时同时触发浏览器下载 */
  exportSvg(options?: { download?: boolean }): Promise<Blob>
  /** 导出 MP4（仅录制），返回 Blob */
  exportMp4(options?: Mp4Options & { download?: boolean }): Promise<Blob>
}

export declare const EzyBoardViewer: DefineComponent<EzyBoardViewerProps> & Plugin
export default EzyBoardViewer

export interface Mp4Options {
  /** 'low' 960p/1.5Mbps · 'mid' 1280p/3Mbps（默认）· 'high' 1920p/8Mbps，或自定义 { long: 长边像素, kbps } */
  quality?: 'low' | 'mid' | 'high' | { long: number; kbps: number }
  /** stage: 'mix' | 'encode' | 'noaudio'；frac: 0~1 */
  onProgress?: (stage: string, frac: number) => void
  signal?: AbortSignal
}

/** 不挂载组件：每页一个 SVG 字符串（图片 base64 内联） */
export declare function boardToSvgs(source: BoardSource, options?: { fetchOptions?: RequestInit }): Promise<Array<{ svg?: string; error?: string }>>
/** 不挂载组件：导出 SVG Blob（多页纵向合并） */
export declare function boardToSvgBlob(source: BoardSource, options?: { fetchOptions?: RequestInit }): Promise<Blob>
/** 不挂载组件：导出 MP4 Blob（仅录制；需要 WebCodecs） */
export declare function boardToMp4Blob(source: BoardSource, options?: Mp4Options & { fetchOptions?: RequestInit; /** 静态内容默认拒绝，force 则按命令回放导出 */ force?: boolean }): Promise<Blob>
/** [{ path, blob }] → zip Blob */
export declare function filesToZip(files: BoardFile[]): Promise<Blob>
export declare const MP4_QUALITY: Record<'low' | 'mid' | 'high', { key: string; label: string; long: number; kbps: number }>

/* ---------------- 创建新画板 ---------------- */
/** CSS '#rgb' | '#rrggbb' | '#rrggbbaa'，或 Android ARGB int32 */
export type Color = string | number
export interface Pt { x: number; y: number; t?: number }
export type PointLike = [number, number] | [number, number, number] | Pt
export interface Handle { readonly id: string; readonly type: number }
export interface Delay { /** 本条命令之前再等待的毫秒数（delayTime） */ delay?: number }
export interface Parent { /** 挂到某个 group 下，默认根 */ parent?: Handle }
export interface StrokeStyle { color?: Color; lineWidth?: number; /** [实线长, 间隔] */ dash?: [number, number]; style?: number }
export interface StrokeOptions extends StrokeStyle, Delay, Parent {
  /** 书写总时长 ms（点没有 t 时均分）；也可给每个点 t */
  duration?: number
  /** 点没有 t 且没给 duration 时的间隔，默认 16ms */
  step?: number
  /** 默认自动包一层 GROUP（和 App 一致），false 则直接挂在 parent / 根 */
  group?: boolean
}
export interface MoveOptions extends Delay {
  dx?: number; dy?: number; scale?: number; /** 度 */ rotate?: number
  /** 世界坐标，默认图元中心 */ pivot?: { x: number; y: number }
  duration?: number; frames?: number
  /** 单帧直接指定手势矩阵 [scaleX, skewY, skewX, scaleY, transX, transY] */
  matrix?: [number, number, number, number, number, number]
}
export interface Line { color?: Color; space?: number; type?: 'horizontal' | 'staggered'; width?: number }
export interface AuthorInput { name?: string; id?: string; schoolId?: string; url?: string; startTime?: number; duration?: number }

export interface BoardPage {
  /** 下一条命令之前再等待 ms 毫秒 */
  wait(ms: number): this
  group(o?: Delay & Parent): Handle
  image(src: Blob | Uint8Array | ArrayBuffer | string, o?: { x?: number; y?: number; width?: number; height?: number } & Delay & Parent): Promise<Handle>
  stroke(points: PointLike[], o?: StrokeOptions): Handle
  line(a: PointLike, b: PointLike, o?: StrokeOptions & { duration?: number }): Handle
  text(content: string, o?: { x?: number; y?: number; size?: number; color?: Color; width?: number; height?: number } & Delay & Parent): Handle
  oval(o: { x?: number; y?: number; width: number; height: number } & StrokeStyle & Delay & Parent): Handle
  polygon(points: PointLike[], o?: { x?: number; y?: number } & StrokeStyle & Delay & Parent): Handle
  rect(o: { x?: number; y?: number; width: number; height: number } & StrokeStyle & Delay & Parent): Handle
  move(h: Handle, o?: MoveOptions): Handle
  change(h: Handle, o: { content?: string; color?: Color; lineWidth?: number; size?: number; dash?: [number, number]; width?: number; height?: number; points?: PointLike[] } & Delay): Handle
  remove(h: Handle, o?: Delay): void
  /** 用当前完整图元树重置页面（App 的删除/撤销用这条命令） */
  rebuild(o?: Delay): void
  config(o: { background?: Color; backgroundLine?: Line } & Delay): void
  camera(o: { matrix?: MoveOptions['matrix']; scale?: number; dx?: number; dy?: number } & Delay): void
  cameraMove(o?: MoveOptions): void
  /** 激光笔轨迹（🔶 未经真实 App 验证） */
  cursor(points: PointLike[], o?: { duration?: number; step?: number } & Delay): void
  /** 原样写入自定义命令字节（查看器忽略） */
  custom(bytes: Uint8Array, o?: Delay): void
  stop(o?: Delay): void
  /** start：音频在主时间轴上开始的毫秒（按 _audio.bin 命令链计时）；duration 缺省时在浏览器里自动探测，Node 里必须传 */
  audio(src: Blob | Uint8Array | ArrayBuffer | string, o?: { start?: number; duration?: number; ext?: string }): Promise<{ name: string; start: number; duration: number }>
}

export interface BoardOptions {
  /** 像素 */ width: number; height: number
  background?: Color; backgroundLine?: Line
  moveConfig?: { isEnable?: boolean; verticalTranslate?: boolean; horizontalTranslate?: boolean; scale?: boolean; rotate?: boolean; maxHeightTimes?: number; maxWidthTimes?: number }
  author?: AuthorInput; provider?: AuthorInput[]; convertUrl?: string
  /** 'auto'：有音频 / 停止标记 / 激光笔即为录制 */
  recording?: boolean | 'auto'
  createDate?: number
  /** 浏览器里默认生成 screenshot.png 预览图，false 关闭 */
  screenshot?: boolean
}
export interface Board {
  page(index?: number): BoardPage
  addPage(o?: { width?: number; height?: number; background?: Color; backgroundLine?: Line }): BoardPage
  readonly pages: BoardPage[]
  /** [{ path, blob }]，可直接作为查看器的 source */
  toFiles(): Promise<Array<BoardFile & { data: Uint8Array }>>
  toBlob(): Promise<Blob>
}
export declare function createBoard(options: BoardOptions): Board
export declare function parseColor(c: Color, fallback?: number): number
export declare const GRAPH: { ROOT: 0; GROUP: 1; IMAGE: 2; STROKE: 3; BEELINE: 4; TEXT: 5; GEOMETRY: 6 }
export declare const CMD: { ADD: 1; REMOVE: 2; MATRIX: 3; CHANGE: 4; CUSTOM: 5; AUDIO: 6; CAMERA: 7; CAMERA_MATRIX: 8; CONFIG: 9; STOP: 10; CURSOR: 11; REBUILD: 12 }
