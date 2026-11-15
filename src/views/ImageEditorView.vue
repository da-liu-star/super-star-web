<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
} from 'vue'
import { useRouter } from 'vue-router'
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  ClipboardPaste,
  Crop,
  Download,
  ImagePlus,
  Layers,
  LoaderCircle,
  Maximize,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Trash2,
  Upload,
} from '@lucide/vue'
import BrandMark from '../components/BrandMark.vue'
import {
  clampCropRect,
  computeStitchLayout,
  cropRectToPixels,
  scaleImagesBySizeMode,
  type CropRect,
  type StitchOrientation,
  type StitchSizeMode,
} from '../utils/image-layout'

type EditorMode = 'stitch' | 'crop'
type ExportFormat = 'image/png' | 'image/jpeg' | 'image/webp'
type CropDragMode = 'move' | 'nw' | 'ne' | 'sw' | 'se'

interface StitchImage {
  id: string
  name: string
  fileSize: number
  url: string
  element: HTMLImageElement
}

interface CropDragState {
  mode: CropDragMode
  startX: number
  startY: number
  stageWidth: number
  stageHeight: number
  rect: CropRect
}

const MAX_STITCH_IMAGES = 20
const MAX_CANVAS_EDGE = 16384
const MAX_CANVAS_PIXELS = 80_000_000

const router = useRouter()
const mode = ref<EditorMode>('stitch')
const exportFormat = ref<ExportFormat>('image/png')

const stitchInputRef = ref<HTMLInputElement | null>(null)
const cropInputRef = ref<HTMLInputElement | null>(null)
const cropCanvasRef = ref<HTMLCanvasElement | null>(null)
const cropStageRef = ref<HTMLElement | null>(null)

const stitchImages = ref<StitchImage[]>([])
const stitchOrientation = ref<StitchOrientation>('horizontal')
const stitchGap = ref(0)
const stitchSizeMode = ref<StitchSizeMode>('original')
const fixedWidth = ref(800)
const fixedHeight = ref(800)
const stitchBusy = ref(false)
const stitchError = ref('')
const stitchStatus = ref('')
const stitchResultUrl = ref('')
const stitchResultBlob = ref<Blob | null>(null)
const stitchResultWidth = ref(0)
const stitchResultHeight = ref(0)

const cropName = ref('')
const hasCropImage = ref(false)
const cropBusy = ref(false)
const cropError = ref('')
const cropStatus = ref('')
const cropRect = reactive<CropRect>({
  x: 0,
  y: 0,
  width: 100,
  height: 100,
})

let cropDrag: CropDragState | null = null
let stitchGenerationId = 0

const cropStyle = computed(() => ({
  left: `${cropRect.x}%`,
  top: `${cropRect.y}%`,
  width: `${cropRect.width}%`,
  height: `${cropRect.height}%`,
}))

const cropPixelSize = computed(() => {
  const canvas = cropCanvasRef.value
  if (!canvas || !hasCropImage.value) {
    return '0 × 0'
  }
  const pixelRect = cropRectToPixels(cropRect, canvas.width, canvas.height)
  return `${pixelRect.width} × ${pixelRect.height}`
})

const stitchResultSize = computed(() =>
  stitchResultWidth.value && stitchResultHeight.value
    ? `${stitchResultWidth.value} × ${stitchResultHeight.value}`
    : '',
)

const fixedLengthValue = computed(() =>
  stitchSizeMode.value === 'width'
    ? Number(fixedWidth.value)
    : Number(fixedHeight.value),
)

const fixedLengthLabel = computed(() =>
  stitchSizeMode.value === 'width' ? '固定宽度' : '固定高度',
)

const previewTitle = computed(() =>
  mode.value === 'stitch' ? '拼接预览' : '裁剪预览',
)

onMounted(() => {
  window.addEventListener('paste', handlePaste)
})

onBeforeUnmount(() => {
  window.removeEventListener('paste', handlePaste)
  stopCropDrag()
  clearStitchImages()
})

function setMode(nextMode: EditorMode): void {
  mode.value = nextMode
  stitchError.value = ''
  cropError.value = ''
  stitchStatus.value = ''
  cropStatus.value = ''
}

function goHome(): void {
  router.push('/home')
}

async function handleStitchFiles(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  if (files.length === 0) {
    return
  }
  await addStitchFiles(files)
}

async function addStitchFiles(files: File[]): Promise<void> {
  if (stitchImages.value.length + files.length > MAX_STITCH_IMAGES) {
    stitchError.value = `最多支持 ${MAX_STITCH_IMAGES} 张图片`
    return
  }

  stitchBusy.value = true
  stitchError.value = ''
  stitchStatus.value = ''
  try {
    const loaded = await Promise.all(
      files.map((file) => loadStitchImage(file)),
    )
    stitchImages.value = [...stitchImages.value, ...loaded]
    await generateStitchPreview()
  } catch (error) {
    stitchError.value = errorMessage(error)
  } finally {
    stitchBusy.value = false
  }
}

async function loadStitchImage(file: File): Promise<StitchImage> {
  if (!file.type.startsWith('image/')) {
    throw new Error(`${file.name} 不是支持的图片文件`)
  }
  const url = URL.createObjectURL(file)
  const image = new Image()
  image.src = url
  try {
    await image.decode()
  } catch {
    URL.revokeObjectURL(url)
    throw new Error(`${file.name} 无法读取`)
  }
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: file.name,
    fileSize: file.size,
    url,
    element: image,
  }
}

async function generateStitchPreview(): Promise<void> {
  const generationId = ++stitchGenerationId
  if (stitchImages.value.length === 0) {
    releaseStitchResult()
    return
  }

  stitchBusy.value = true
  stitchError.value = ''
  stitchStatus.value = ''
  try {
    const fixedLength = stitchSizeMode.value !== 'original'
      ? validateFixedLength(fixedLengthValue.value)
      : null
    const imageDimensions = stitchImages.value.map((image) => ({
      width: image.element.naturalWidth,
      height: image.element.naturalHeight,
    }))
    const targetDimensions = scaleImagesBySizeMode(
      imageDimensions,
      stitchSizeMode.value,
      fixedLength,
    )
    const layout = computeStitchLayout(
      targetDimensions,
      stitchOrientation.value,
      stitchGap.value,
    )
    validateCanvasSize(layout.width, layout.height)

    const canvas = document.createElement('canvas')
    canvas.width = layout.width
    canvas.height = layout.height
    const context = get2dContext(canvas)
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)

    layout.placements.forEach((placement, index) => {
      const image = stitchImages.value[index]
      if (image) {
        context.drawImage(
          image.element,
          placement.x,
          placement.y,
          placement.width,
          placement.height,
        )
      }
    })

    const blob = await canvasToBlob(canvas, exportFormat.value)
    if (generationId !== stitchGenerationId) {
      return
    }
    replaceStitchResult(blob, canvas.width, canvas.height)
    stitchStatus.value = '拼接预览已更新'
  } catch (error) {
    if (generationId === stitchGenerationId) {
      stitchError.value = errorMessage(error)
      releaseStitchResult()
    }
  } finally {
    if (generationId === stitchGenerationId) {
      stitchBusy.value = false
    }
  }
}

async function setStitchOrientation(orientation: StitchOrientation): Promise<void> {
  if (stitchOrientation.value === orientation) {
    return
  }
  stitchOrientation.value = orientation
  if (stitchImages.value.length > 0) {
    await generateStitchPreview()
  }
}

async function handleOrientationSelect(event: Event): Promise<void> {
  const orientation = (event.target as HTMLSelectElement).value as StitchOrientation
  await setStitchOrientation(orientation)
}

async function handleStitchSizeModeChange(): Promise<void> {
  if (stitchImages.value.length > 0) {
    await generateStitchPreview()
  }
}

async function handleFixedLengthChange(): Promise<void> {
  if (stitchImages.value.length > 0) {
    await generateStitchPreview()
  }
}

async function handleStitchGapChange(): Promise<void> {
  if (stitchImages.value.length > 0) {
    await generateStitchPreview()
  }
}

function getStitchTargetDimensions(
  image: StitchImage,
): { width: number; height: number } {
  const source = {
    width: image.element.naturalWidth,
    height: image.element.naturalHeight,
  }
  if (stitchSizeMode.value === 'original') {
    return source
  }
  const fixedLength = Number(fixedLengthValue.value)
  if (!Number.isFinite(fixedLength) || fixedLength <= 0) {
    return source
  }
  return scaleImagesBySizeMode(
    [source],
    stitchSizeMode.value,
    fixedLength,
  )[0] ?? source
}

async function removeStitchImage(index: number): Promise<void> {
  const [removed] = stitchImages.value.splice(index, 1)
  if (removed) {
    URL.revokeObjectURL(removed.url)
  }
  if (stitchImages.value.length === 0) {
    releaseStitchResult()
    return
  }
  await generateStitchPreview()
}

async function moveStitchImage(index: number, direction: -1 | 1): Promise<void> {
  const target = index + direction
  if (target < 0 || target >= stitchImages.value.length) {
    return
  }
  const [image] = stitchImages.value.splice(index, 1)
  if (!image) {
    return
  }
  stitchImages.value.splice(target, 0, image)
  await generateStitchPreview()
}

async function handleFormatChange(): Promise<void> {
  if (mode.value === 'stitch' && stitchImages.value.length > 0) {
    await generateStitchPreview()
  }
}

function exportStitch(): void {
  if (!stitchResultBlob.value) {
    return
  }
  downloadBlob(
    stitchResultBlob.value,
    `stitched-${dateStamp()}.${extensionForMime(stitchResultBlob.value.type)}`,
  )
}

function clearStitchImages(revoke = true): void {
  if (revoke) {
    stitchImages.value.forEach((image) => URL.revokeObjectURL(image.url))
  }
  stitchImages.value = []
  stitchStatus.value = ''
  stitchError.value = ''
  releaseStitchResult()
}

function replaceStitchResult(blob: Blob, width: number, height: number): void {
  releaseStitchResult()
  stitchResultBlob.value = blob
  stitchResultUrl.value = URL.createObjectURL(blob)
  stitchResultWidth.value = width
  stitchResultHeight.value = height
}

function releaseStitchResult(): void {
  if (stitchResultUrl.value) {
    URL.revokeObjectURL(stitchResultUrl.value)
  }
  stitchResultUrl.value = ''
  stitchResultBlob.value = null
  stitchResultWidth.value = 0
  stitchResultHeight.value = 0
}

async function handleCropFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) {
    return
  }
  await addCropFile(file)
}

async function addCropFile(file: File): Promise<void> {
  if (!file.type.startsWith('image/')) {
    cropError.value = '请选择支持的图片文件'
    return
  }

  cropBusy.value = true
  cropError.value = ''
  cropStatus.value = ''
  const url = URL.createObjectURL(file)
  const image = new Image()
  image.src = url
  try {
    await image.decode()
    hasCropImage.value = true
    cropName.value = file.name
    await nextTick()
    drawImageToCropCanvas(image)
    cropStatus.value = '图片已导入'
  } catch {
    cropError.value = '图片读取失败，请换一张图片'
  } finally {
    URL.revokeObjectURL(url)
    cropBusy.value = false
  }
}

async function handlePaste(event: ClipboardEvent): Promise<void> {
  const target = event.target
  if (
    target instanceof HTMLElement
    && target.matches('input, textarea, [contenteditable="true"]')
  ) {
    return
  }

  const files = Array.from(event.clipboardData?.items ?? [])
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file))

  if (files.length === 0) {
    return
  }

  event.preventDefault()
  if (mode.value === 'stitch') {
    await addStitchFiles(files)
    if (!stitchError.value) {
      stitchStatus.value = `已从剪贴板导入 ${files.length} 张图片`
    }
    return
  }

  await addCropFile(files[0]!)
  if (!cropError.value) {
    cropStatus.value = files.length > 1
      ? '已从剪贴板导入第一张图片'
      : '已从剪贴板导入图片'
  }
}

function drawImageToCropCanvas(image: HTMLImageElement): void {
  const canvas = cropCanvasRef.value
  if (!canvas) {
    return
  }
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const context = get2dContext(canvas)
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.drawImage(image, 0, 0)
  resetCropRect()
}

function rotateCrop(degrees: -90 | 90): void {
  const canvas = cropCanvasRef.value
  if (!canvas) {
    return
  }
  const source = document.createElement('canvas')
  source.width = canvas.width
  source.height = canvas.height
  get2dContext(source).drawImage(canvas, 0, 0)

  const nextWidth = source.height
  const nextHeight = source.width
  canvas.width = nextWidth
  canvas.height = nextHeight
  const context = get2dContext(canvas)
  context.translate(nextWidth / 2, nextHeight / 2)
  context.rotate((degrees * Math.PI) / 180)
  context.drawImage(source, -source.width / 2, -source.height / 2)
  resetCropRect()
  cropStatus.value = degrees === 90 ? '已顺时针旋转 90°' : '已逆时针旋转 90°'
}

function resetCropRect(): void {
  Object.assign(cropRect, { x: 0, y: 0, width: 100, height: 100 })
  cropStatus.value = '裁剪区域已重置'
}

async function applyCrop(): Promise<void> {
  const canvas = cropCanvasRef.value
  if (!canvas) {
    return
  }
  cropBusy.value = true
  cropError.value = ''
  try {
    const cropped = createCroppedCanvas(canvas)
    canvas.width = cropped.width
    canvas.height = cropped.height
    get2dContext(canvas).drawImage(cropped, 0, 0)
    resetCropRect()
    cropStatus.value = '裁剪已应用'
  } catch (error) {
    cropError.value = errorMessage(error)
  } finally {
    cropBusy.value = false
  }
}

async function exportCrop(): Promise<void> {
  const canvas = cropCanvasRef.value
  if (!canvas) {
    return
  }
  cropBusy.value = true
  cropError.value = ''
  try {
    const cropped = createCroppedCanvas(canvas)
    const blob = await canvasToBlob(cropped, exportFormat.value)
    downloadBlob(
      blob,
      `edited-${dateStamp()}.${extensionForMime(blob.type)}`,
    )
    cropStatus.value = '图片已导出'
  } catch (error) {
    cropError.value = errorMessage(error)
  } finally {
    cropBusy.value = false
  }
}

function createCroppedCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const pixelRect = cropRectToPixels(cropRect, source.width, source.height)
  const output = document.createElement('canvas')
  output.width = pixelRect.width
  output.height = pixelRect.height
  get2dContext(output).drawImage(
    source,
    pixelRect.x,
    pixelRect.y,
    pixelRect.width,
    pixelRect.height,
    0,
    0,
    pixelRect.width,
    pixelRect.height,
  )
  return output
}

function startCropDrag(event: PointerEvent, dragMode: CropDragMode): void {
  const stage = cropStageRef.value
  if (!stage) {
    return
  }
  event.preventDefault()
  const bounds = stage.getBoundingClientRect()
  cropDrag = {
    mode: dragMode,
    startX: event.clientX,
    startY: event.clientY,
    stageWidth: bounds.width,
    stageHeight: bounds.height,
    rect: { ...cropRect },
  }
  window.addEventListener('pointermove', moveCropDrag)
  window.addEventListener('pointerup', stopCropDrag)
}

function moveCropDrag(event: PointerEvent): void {
  if (!cropDrag) {
    return
  }
  const dx = ((event.clientX - cropDrag.startX) / cropDrag.stageWidth) * 100
  const dy = ((event.clientY - cropDrag.startY) / cropDrag.stageHeight) * 100
  const current = cropDrag.rect
  let next: CropRect = { ...current }

  if (cropDrag.mode === 'move') {
    next = {
      ...current,
      x: clamp(current.x + dx, 0, 100 - current.width),
      y: clamp(current.y + dy, 0, 100 - current.height),
    }
  } else if (cropDrag.mode === 'se') {
    next.width = clamp(current.width + dx, 5, 100 - current.x)
    next.height = clamp(current.height + dy, 5, 100 - current.y)
  } else if (cropDrag.mode === 'ne') {
    const bottom = current.y + current.height
    const nextY = clamp(current.y + dy, 0, bottom - 5)
    next = {
      x: current.x,
      y: nextY,
      width: clamp(current.width + dx, 5, 100 - current.x),
      height: bottom - nextY,
    }
  } else if (cropDrag.mode === 'sw') {
    const right = current.x + current.width
    const nextX = clamp(current.x + dx, 0, right - 5)
    next = {
      x: nextX,
      y: current.y,
      width: right - nextX,
      height: clamp(current.height + dy, 5, 100 - current.y),
    }
  } else {
    const right = current.x + current.width
    const bottom = current.y + current.height
    const nextX = clamp(current.x + dx, 0, right - 5)
    const nextY = clamp(current.y + dy, 0, bottom - 5)
    next = {
      x: nextX,
      y: nextY,
      width: right - nextX,
      height: bottom - nextY,
    }
  }

  Object.assign(cropRect, clampCropRect(next))
}

function stopCropDrag(): void {
  cropDrag = null
  window.removeEventListener('pointermove', moveCropDrag)
  window.removeEventListener('pointerup', stopCropDrag)
}

function handleCropKeydown(event: KeyboardEvent): void {
  const amount = event.shiftKey ? 5 : 1
  if (event.key === 'ArrowLeft') {
    cropRect.x = clamp(cropRect.x - amount, 0, 100 - cropRect.width)
  } else if (event.key === 'ArrowRight') {
    cropRect.x = clamp(cropRect.x + amount, 0, 100 - cropRect.width)
  } else if (event.key === 'ArrowUp') {
    cropRect.y = clamp(cropRect.y - amount, 0, 100 - cropRect.height)
  } else if (event.key === 'ArrowDown') {
    cropRect.y = clamp(cropRect.y + amount, 0, 100 - cropRect.height)
  } else {
    return
  }
  event.preventDefault()
}

function validateFixedLength(value: number): number {
  const rounded = Math.round(value)
  if (!Number.isFinite(rounded) || rounded < 16 || rounded > 4096) {
    throw new Error('固定长度需设置在 16-4096px 之间')
  }
  return rounded
}

function validateCanvasSize(width: number, height: number): void {
  if (width <= 0 || height <= 0) {
    throw new Error('拼接尺寸无效')
  }
  if (
    width > MAX_CANVAS_EDGE
    || height > MAX_CANVAS_EDGE
    || width * height > MAX_CANVAS_PIXELS
  ) {
    throw new Error('拼接后的图片过大，请减少图片数量或更换较小的图片')
  }
}

function get2dContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('当前浏览器不支持 Canvas')
  }
  return context
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: ExportFormat,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob)
        } else {
          reject(new Error('图片导出失败'))
        }
      },
      type,
      type === 'image/png' ? undefined : 0.92,
    )
  })
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function extensionForMime(type: string): string {
  if (type === 'image/jpeg') {
    return 'jpg'
  }
  if (type === 'image/webp') {
    return 'webp'
  }
  return 'png'
}

function dateStamp(): string {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '处理图片时发生错误'
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
</script>

<template>
  <div class="image-editor">
    <header class="editor-header">
      <div class="editor-header__left">
        <button
          type="button"
          class="icon-button"
          title="返回工作台"
          aria-label="返回工作台"
          @click="goHome"
        >
          <ArrowLeft :size="18" />
        </button>
        <BrandMark compact />
        <span class="editor-title">图片编辑</span>
      </div>
      <span class="local-note">图片仅在本机处理</span>
    </header>

    <main class="editor-shell">
      <aside class="editor-panel">
        <div class="editor-tabs" role="tablist" aria-label="编辑工具">
          <button
            type="button"
            role="tab"
            :aria-selected="mode === 'stitch'"
            :class="{ active: mode === 'stitch' }"
            @click="setMode('stitch')"
          >
            <Layers :size="17" />
            拼接
          </button>
          <button
            type="button"
            role="tab"
            :aria-selected="mode === 'crop'"
            :class="{ active: mode === 'crop' }"
            @click="setMode('crop')"
          >
            <Crop :size="17" />
            裁剪旋转
          </button>
        </div>

        <div v-if="mode === 'stitch'" class="panel-content">
          <div class="settings-grid">
            <label class="compact-field" for="stitch-orientation">
              <span>拼接方向</span>
              <select
                id="stitch-orientation"
                class="select-input"
                :value="stitchOrientation"
                @change="handleOrientationSelect"
              >
                <option value="horizontal">横向</option>
                <option value="vertical">纵向</option>
              </select>
            </label>

            <label class="compact-field" for="stitch-size-mode">
              <span>尺寸方式</span>
              <select
                id="stitch-size-mode"
                v-model="stitchSizeMode"
                class="select-input"
                @change="handleStitchSizeModeChange"
              >
                <option value="original">原始尺寸</option>
                <option value="width">固定宽度</option>
                <option value="height">固定高度</option>
              </select>
            </label>

            <label
              v-if="stitchSizeMode !== 'original'"
              class="compact-field compact-field--length"
              :for="stitchSizeMode === 'width' ? 'fixed-width' : 'fixed-height'"
            >
              <span>{{ fixedLengthLabel }}</span>
              <span class="number-field__input">
                <input
                  v-if="stitchSizeMode === 'width'"
                  id="fixed-width"
                  v-model.number="fixedWidth"
                  type="number"
                  min="16"
                  max="4096"
                  step="1"
                  @change="handleFixedLengthChange"
                />
                <input
                  v-else
                  id="fixed-height"
                  v-model.number="fixedHeight"
                  type="number"
                  min="16"
                  max="4096"
                  step="1"
                  @change="handleFixedLengthChange"
                />
                <small>px</small>
              </span>
            </label>
          </div>

          <div class="panel-section">
            <label class="section-label" for="stitch-gap">
              <span>图片间距</span>
              <span>{{ stitchGap }}px</span>
            </label>
            <input
              id="stitch-gap"
              v-model.number="stitchGap"
              class="range-input"
              type="range"
              min="0"
              max="48"
              step="4"
              @change="handleStitchGapChange"
            />
          </div>

          <div class="panel-section">
            <label class="section-label" for="export-format">导出格式</label>
            <select
              id="export-format"
              v-model="exportFormat"
              class="select-input"
              @change="handleFormatChange"
            >
              <option value="image/png">PNG</option>
              <option value="image/jpeg">JPEG</option>
              <option value="image/webp">WebP</option>
            </select>
          </div>

          <div class="panel-actions">
            <button
              type="button"
              class="button button--secondary"
              @click="stitchInputRef?.click()"
            >
              <Upload :size="17" />
              导入图片
            </button>
            <input
              ref="stitchInputRef"
              class="file-input"
              type="file"
              accept="image/*"
              multiple
              @change="handleStitchFiles"
            />
            <button
              type="button"
              class="button button--primary"
              :disabled="stitchBusy || stitchImages.length === 0"
              @click="generateStitchPreview"
            >
              <LoaderCircle v-if="stitchBusy" class="spinner" :size="17" />
              <RefreshCw v-else :size="17" />
              更新预览
            </button>
          </div>
          <p class="paste-hint">
            <ClipboardPaste :size="15" />
            支持 Ctrl+V 粘贴图片
          </p>

          <p v-if="stitchError" class="inline-message inline-message--error" role="alert">
            <CircleAlert :size="16" />
            {{ stitchError }}
          </p>
          <p v-else-if="stitchStatus" class="inline-message" aria-live="polite">
            <Check :size="16" />
            {{ stitchStatus }}
          </p>

          <div v-if="stitchImages.length" class="image-list">
            <div class="list-heading">
              <span>图片顺序</span>
              <span>{{ stitchImages.length }} 张</span>
            </div>
            <article
              v-for="(image, index) in stitchImages"
              :key="image.id"
              class="image-row"
            >
              <img :src="image.url" :alt="image.name" />
              <div class="image-row__info">
                <strong>{{ image.name }}</strong>
                <span>
                  {{ image.element.naturalWidth }} × {{ image.element.naturalHeight }}
                  · {{ formatFileSize(image.fileSize) }}
                </span>
                <span v-if="stitchSizeMode !== 'original'" class="image-row__target">
                  输出 {{ getStitchTargetDimensions(image).width }}
                  × {{ getStitchTargetDimensions(image).height }}
                </span>
              </div>
              <div class="image-row__actions">
                <button
                  type="button"
                  title="上移"
                  aria-label="上移图片"
                  :disabled="index === 0"
                  @click="moveStitchImage(index, -1)"
                >
                  <ChevronUp :size="16" />
                </button>
                <button
                  type="button"
                  title="下移"
                  aria-label="下移图片"
                  :disabled="index === stitchImages.length - 1"
                  @click="moveStitchImage(index, 1)"
                >
                  <ChevronDown :size="16" />
                </button>
                <button
                  type="button"
                  title="删除"
                  aria-label="删除图片"
                  @click="removeStitchImage(index)"
                >
                  <Trash2 :size="16" />
                </button>
              </div>
            </article>
          </div>
        </div>

        <div v-else class="panel-content">
          <div class="panel-section">
            <div class="panel-actions panel-actions--stack">
              <button
                type="button"
                class="button button--secondary"
                @click="cropInputRef?.click()"
              >
                <ImagePlus :size="17" />
                {{ hasCropImage ? '更换图片' : '导入图片' }}
              </button>
              <input
                ref="cropInputRef"
                class="file-input"
                type="file"
                accept="image/*"
                @change="handleCropFile"
              />
            </div>
            <p v-if="cropName" class="file-name">{{ cropName }}</p>
            <p class="paste-hint">
              <ClipboardPaste :size="15" />
              支持 Ctrl+V 粘贴图片
            </p>
          </div>

          <template v-if="hasCropImage">
            <div class="panel-section">
              <div class="section-label">
                <span>旋转</span>
              </div>
              <div class="icon-button-row">
                <button
                  type="button"
                  class="button button--secondary"
                  @click="rotateCrop(-90)"
                >
                  <RotateCcw :size="17" />
                  左转
                </button>
                <button
                  type="button"
                  class="button button--secondary"
                  @click="rotateCrop(90)"
                >
                  <RotateCw :size="17" />
                  右转
                </button>
              </div>
            </div>

            <div class="panel-section">
              <div class="section-label">
                <span>裁剪尺寸</span>
                <span>{{ cropPixelSize }}</span>
              </div>
              <button
                type="button"
                class="button button--secondary button--full"
                @click="resetCropRect"
              >
                <Maximize :size="17" />
                重置裁剪框
              </button>
            </div>

            <div class="panel-section">
              <label class="section-label" for="crop-export-format">导出格式</label>
              <select
                id="crop-export-format"
                v-model="exportFormat"
                class="select-input"
              >
                <option value="image/png">PNG</option>
                <option value="image/jpeg">JPEG</option>
                <option value="image/webp">WebP</option>
              </select>
            </div>

            <div class="panel-actions">
              <button
                type="button"
                class="button button--secondary"
                :disabled="cropBusy"
                @click="applyCrop"
              >
                <Crop :size="17" />
                应用裁剪
              </button>
              <button
                type="button"
                class="button button--primary"
                :disabled="cropBusy"
                @click="exportCrop"
              >
                <LoaderCircle v-if="cropBusy" class="spinner" :size="17" />
                <Download v-else :size="17" />
                导出
              </button>
            </div>
          </template>

          <p v-if="cropError" class="inline-message inline-message--error" role="alert">
            <CircleAlert :size="16" />
            {{ cropError }}
          </p>
          <p v-else-if="cropStatus" class="inline-message" aria-live="polite">
            <Check :size="16" />
            {{ cropStatus }}
          </p>
        </div>
      </aside>

      <section class="preview-panel">
        <div class="preview-heading">
          <div>
            <h1>{{ previewTitle }}</h1>
            <p v-if="mode === 'stitch' && stitchResultSize">
              {{ stitchResultSize }}
            </p>
            <p v-else-if="mode === 'crop' && hasCropImage">
              {{ cropPixelSize }}
            </p>
          </div>
          <button
            v-if="mode === 'stitch'"
            type="button"
            class="button button--primary"
            :disabled="!stitchResultBlob || stitchBusy"
            @click="exportStitch"
          >
            <Download :size="17" />
            导出拼接图
          </button>
        </div>

        <div class="preview-surface">
          <div
            v-if="mode === 'stitch' && stitchResultUrl"
            class="stitch-preview"
          >
            <img :src="stitchResultUrl" alt="拼接后的图片预览" />
          </div>

          <div
            v-else-if="mode === 'crop' && hasCropImage"
            class="crop-preview"
          >
            <div ref="cropStageRef" class="crop-stage">
              <canvas ref="cropCanvasRef" class="crop-canvas"></canvas>
              <div class="crop-overlay">
                <div
                  class="crop-box"
                  :style="cropStyle"
                  tabindex="0"
                  role="group"
                  aria-label="裁剪区域，使用方向键移动"
                  @pointerdown="startCropDrag($event, 'move')"
                  @keydown="handleCropKeydown"
                >
                  <span
                    class="crop-handle crop-handle--nw"
                    @pointerdown.stop="startCropDrag($event, 'nw')"
                  ></span>
                  <span
                    class="crop-handle crop-handle--ne"
                    @pointerdown.stop="startCropDrag($event, 'ne')"
                  ></span>
                  <span
                    class="crop-handle crop-handle--sw"
                    @pointerdown.stop="startCropDrag($event, 'sw')"
                  ></span>
                  <span
                    class="crop-handle crop-handle--se"
                    @pointerdown.stop="startCropDrag($event, 'se')"
                  ></span>
                </div>
              </div>
            </div>
          </div>

          <div v-else class="empty-preview">
            <span>
              <ImagePlus :size="28" />
            </span>
            <h2>{{ mode === 'stitch' ? '导入图片开始拼接' : '导入图片开始裁剪' }}</h2>
            <p>
              {{ mode === 'stitch'
                ? '支持同时选择多张图片，并调整顺序。'
                : '导入单张图片后可旋转、裁剪并导出。' }}
            </p>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.image-editor {
  min-height: 100svh;
  background: #f5f5f2;
  color: #243029;
  font-family: var(--font-sans);
}

.editor-header {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  min-height: 64px;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 0 24px;
  border-bottom: 1px solid #deded8;
  background: rgb(255 255 252 / 94%);
}

.editor-header__left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.editor-title {
  padding-left: 12px;
  border-left: 1px solid #deded8;
  font-size: 14px;
  font-weight: 700;
}

.local-note {
  color: #7c857f;
  font-size: 12px;
}

.icon-button {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border: 1px solid #deded8;
  border-radius: 8px;
  background: #fff;
  color: #455149;
  cursor: pointer;
}

.icon-button:hover {
  border-color: #a9b6ae;
}

.editor-shell {
  display: grid;
  height: calc(100svh - 64px);
  min-height: calc(100svh - 64px);
  grid-template-columns: 330px minmax(0, 1fr);
  overflow: hidden;
}

.editor-panel {
  min-height: 0;
  overflow-y: auto;
  border-right: 1px solid #deded8;
  background: #fff;
}

.editor-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  border-bottom: 1px solid #deded8;
}

.editor-tabs button {
  display: flex;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: #7b847e;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.editor-tabs button.active {
  border-bottom-color: #527c68;
  color: #29362e;
}

.panel-content {
  display: flex;
  flex-direction: column;
  gap: 15px;
  padding: 16px;
}

.panel-section {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.section-label,
.list-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: #657068;
  font-size: 11px;
  font-weight: 650;
}

.section-label > span:last-child,
.list-heading > span:last-child {
  color: #8d958f;
  font-family: var(--font-mono);
  font-size: 10px;
}

.settings-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.compact-field {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 6px;
  color: #68736b;
  font-size: 10px;
  font-weight: 650;
}

.compact-field--length {
  min-height: 38px;
  grid-column: 1 / -1;
  align-items: center;
  flex-direction: row;
  justify-content: space-between;
  padding: 0 4px 0 10px;
  border: 1px solid #d8d9d3;
  border-radius: 8px;
}

.compact-field--length:focus-within {
  border-color: #78a28d;
  box-shadow: 0 0 0 3px rgb(82 124 104 / 13%);
}

.range-input {
  width: 100%;
  accent-color: #527c68;
}

.number-field__input {
  display: flex;
  align-items: center;
  gap: 5px;
  color: #8d958f;
  font-family: var(--font-mono);
  font-size: 10px;
}

.number-field input {
  width: 76px;
  height: 30px;
  padding: 0 6px;
  border: 0;
  outline: none;
  background: transparent;
  color: #29362e;
  font: inherit;
  font-size: 11px;
  text-align: right;
}

.select-input {
  width: 100%;
  height: 36px;
  padding: 0 9px;
  border: 1px solid #d8d9d3;
  border-radius: 8px;
  outline: none;
  background: #fff;
  color: #344139;
  font: inherit;
  font-size: 11px;
}

.select-input:focus-visible {
  border-color: #78a28d;
  box-shadow: 0 0 0 3px rgb(82 124 104 / 13%);
}

.panel-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.panel-actions--stack {
  grid-template-columns: 1fr;
}

.button {
  display: inline-flex;
  min-height: 36px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 8px;
  font: inherit;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}

.button:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}

.button--primary {
  background: #26352d;
  color: #fff;
}

.button--primary:hover:not(:disabled) {
  background: #34483c;
}

.button--secondary {
  border-color: #d8d9d3;
  background: #fff;
  color: #3d4a42;
}

.button--secondary:hover:not(:disabled) {
  border-color: #a9b6ae;
  background: #fafaf7;
}

.button--full {
  width: 100%;
}

.file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}

.inline-message {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0;
  padding: 10px 12px;
  border-radius: 8px;
  background: #eef5f1;
  color: #456b59;
  font-size: 11px;
  line-height: 1.5;
}

.inline-message--error {
  background: #fcf1ed;
  color: #a96048;
}

.inline-message svg {
  flex: 0 0 auto;
  margin-top: 1px;
}

.paste-hint {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: -4px 0 0;
  color: #939a95;
  font-size: 10px;
}

.paste-hint svg {
  color: #7f9186;
}

.image-list {
  display: flex;
  max-height: min(230px, 30svh);
  flex-direction: column;
  overflow-y: auto;
}

.list-heading {
  padding-bottom: 8px;
  border-bottom: 1px solid #e5e5df;
}

.image-row {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  min-height: 54px;
  border-bottom: 1px solid #ecece7;
}

.image-row > img {
  width: 40px;
  height: 40px;
  border-radius: 6px;
  background: #f1f1ed;
  object-fit: cover;
}

.image-row__info {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.image-row__info strong {
  overflow: hidden;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.image-row__info span {
  color: #8b938d;
  font-family: var(--font-mono);
  font-size: 9px;
}

.image-row__info .image-row__target {
  color: #557564;
}

.image-row__actions {
  display: flex;
  gap: 2px;
}

.image-row__actions button {
  display: grid;
  width: 25px;
  height: 25px;
  place-items: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #7f8882;
  cursor: pointer;
}

.image-row__actions button:hover:not(:disabled) {
  background: #f0f2ee;
  color: #37473e;
}

.image-row__actions button:disabled {
  opacity: 0.3;
  cursor: default;
}

.file-name {
  margin: 0;
  overflow: hidden;
  color: #8b938d;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.icon-button-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.preview-panel {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  padding: 18px;
}

.preview-heading {
  display: flex;
  min-height: 40px;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 12px;
}

.preview-heading h1 {
  margin: 0;
  font-size: 18px;
  font-weight: 750;
}

.preview-heading p {
  margin: 5px 0 0;
  color: #8b938d;
  font-family: var(--font-mono);
  font-size: 10px;
}

.preview-surface {
  display: grid;
  min-height: 0;
  flex: 1;
  place-items: center;
  overflow: auto;
  border: 1px solid #deded8;
  border-radius: 12px;
  background:
    repeating-conic-gradient(#f3f3ef 0 25%, #fafaf7 0 50%) 0 0 / 20px 20px;
}

.stitch-preview {
  display: grid;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  place-items: center;
  padding: 18px;
}

.stitch-preview img {
  display: block;
  max-width: 100%;
  max-height: 100%;
  background: #fff;
  object-fit: contain;
}

.crop-preview {
  display: grid;
  width: 100%;
  height: 100%;
  min-height: 0;
  place-items: center;
  padding: 18px;
}

.crop-stage {
  position: relative;
  display: inline-block;
  max-width: 100%;
  line-height: 0;
}

.crop-canvas {
  display: block;
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
}

.crop-overlay {
  position: absolute;
  inset: 0;
}

.crop-box {
  position: absolute;
  border: 1px solid #fff;
  outline: none;
  background-image:
    linear-gradient(
      to right,
      transparent 33.2%,
      rgb(255 255 255 / 36%) 33.2%,
      rgb(255 255 255 / 36%) 33.5%,
      transparent 33.5%,
      transparent 66.5%,
      rgb(255 255 255 / 36%) 66.5%,
      rgb(255 255 255 / 36%) 66.8%,
      transparent 66.8%
    ),
    linear-gradient(
      to bottom,
      transparent 33.2%,
      rgb(255 255 255 / 36%) 33.2%,
      rgb(255 255 255 / 36%) 33.5%,
      transparent 33.5%,
      transparent 66.5%,
      rgb(255 255 255 / 36%) 66.5%,
      rgb(255 255 255 / 36%) 66.8%,
      transparent 66.8%
    );
  box-shadow: 0 0 0 9999px rgb(18 25 21 / 48%);
  cursor: move;
}

.crop-box:focus-visible {
  outline: 2px solid #fff;
  outline-offset: 2px;
}

.crop-handle {
  position: absolute;
  width: 12px;
  height: 12px;
  border: 2px solid #fff;
  border-radius: 50%;
  background: #527c68;
}

.crop-handle--nw {
  top: -7px;
  left: -7px;
  cursor: nwse-resize;
}

.crop-handle--ne {
  top: -7px;
  right: -7px;
  cursor: nesw-resize;
}

.crop-handle--sw {
  bottom: -7px;
  left: -7px;
  cursor: nesw-resize;
}

.crop-handle--se {
  right: -7px;
  bottom: -7px;
  cursor: nwse-resize;
}

.empty-preview {
  display: grid;
  max-width: 360px;
  padding: 28px;
  place-items: center;
  text-align: center;
}

.empty-preview > span {
  display: grid;
  width: 52px;
  height: 52px;
  place-items: center;
  border: 1px solid #deded8;
  border-radius: 12px;
  background: #fff;
  color: #6f8578;
}

.empty-preview h2 {
  margin: 16px 0 0;
  font-size: 16px;
}

.empty-preview p {
  margin: 8px 0 0;
  color: #858d87;
  font-size: 12px;
  line-height: 1.65;
}

.spinner {
  animation: spin 900ms linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 960px) {
  .editor-shell {
    height: auto;
    overflow: visible;
    grid-template-columns: 1fr;
  }

  .editor-panel {
    overflow: visible;
    border-right: 0;
    border-bottom: 1px solid #deded8;
  }

  .preview-panel {
    overflow: visible;
  }

  .panel-content {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: start;
  }

  .panel-actions,
  .inline-message,
  .image-list {
    grid-column: 1 / -1;
  }

  .preview-surface {
    min-height: 58svh;
  }

  .stitch-preview,
  .crop-preview {
    min-height: 58svh;
  }

  .stitch-preview img,
  .crop-canvas {
    max-height: 52svh;
  }
}

@media (max-width: 640px) {
  .editor-header {
    padding-inline: 14px;
  }

  .local-note {
    display: none;
  }

  .editor-title {
    font-size: 13px;
  }

  .panel-content {
    display: flex;
    padding: 18px;
  }

  .preview-panel {
    padding: 14px;
  }

  .preview-heading {
    align-items: flex-start;
    flex-direction: column;
  }

  .preview-heading .button {
    width: 100%;
  }

  .preview-surface {
    min-height: 48svh;
  }

  .stitch-preview,
  .crop-preview {
    min-height: 48svh;
    padding: 14px;
  }

  .stitch-preview img,
  .crop-canvas {
    max-height: 44svh;
  }
}
</style>
