export type StitchOrientation = 'horizontal' | 'vertical'
export type StitchSizeMode = 'original' | 'width' | 'height'

export interface ImageDimensions {
  width: number
  height: number
}

export interface PlacedImage extends ImageDimensions {
  x: number
  y: number
}

export interface StitchLayout {
  width: number
  height: number
  placements: PlacedImage[]
}

export interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

export interface PixelCropRect {
  x: number
  y: number
  width: number
  height: number
}

export function scaleImagesForStitch(
  images: ImageDimensions[],
  orientation: StitchOrientation,
  fixedLength: number | null,
): ImageDimensions[] {
  return scaleImagesBySizeMode(
    images,
    orientation === 'horizontal' ? 'width' : 'height',
    fixedLength,
  )
}

export function scaleImagesBySizeMode(
  images: ImageDimensions[],
  sizeMode: StitchSizeMode,
  fixedLength: number | null,
): ImageDimensions[] {
  if (sizeMode === 'original' || fixedLength == null) {
    return images.map((image) => ({ ...image }))
  }
  const target = Math.max(1, Math.round(fixedLength))
  return images.map((image) => {
    if (sizeMode === 'width') {
      return {
        width: target,
        height: Math.max(1, Math.round((image.height * target) / image.width)),
      }
    }
    return {
      width: Math.max(1, Math.round((image.width * target) / image.height)),
      height: target,
    }
  })
}

export function computeStitchLayout(
  images: ImageDimensions[],
  orientation: StitchOrientation,
  gap = 0,
): StitchLayout {
  if (images.length === 0) {
    return { width: 0, height: 0, placements: [] }
  }

  const safeGap = Math.max(0, Math.round(gap))
  const placements: PlacedImage[] = []

  if (orientation === 'horizontal') {
    const height = Math.max(...images.map((image) => image.height))
    let x = 0
    for (const image of images) {
      placements.push({
        x,
        y: Math.round((height - image.height) / 2),
        width: image.width,
        height: image.height,
      })
      x += image.width + safeGap
    }
    return {
      width: x - safeGap,
      height,
      placements,
    }
  }

  const width = Math.max(...images.map((image) => image.width))
  let y = 0
  for (const image of images) {
    placements.push({
      x: Math.round((width - image.width) / 2),
      y,
      width: image.width,
      height: image.height,
    })
    y += image.height + safeGap
  }
  return {
    width,
    height: y - safeGap,
    placements,
  }
}

export function clampCropRect(rect: CropRect): CropRect {
  const width = clamp(rect.width, 5, 100)
  const height = clamp(rect.height, 5, 100)
  return {
    x: clamp(rect.x, 0, 100 - width),
    y: clamp(rect.y, 0, 100 - height),
    width,
    height,
  }
}

export function cropRectToPixels(
  rect: CropRect,
  imageWidth: number,
  imageHeight: number,
): PixelCropRect {
  const safe = clampCropRect(rect)
  const x = Math.round((safe.x / 100) * imageWidth)
  const y = Math.round((safe.y / 100) * imageHeight)
  const width = Math.max(
    1,
    Math.min(imageWidth - x, Math.round((safe.width / 100) * imageWidth)),
  )
  const height = Math.max(
    1,
    Math.min(imageHeight - y, Math.round((safe.height / 100) * imageHeight)),
  )
  return { x, y, width, height }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
