import { describe, expect, it } from 'vitest'
import {
  clampCropRect,
  computeStitchLayout,
  cropRectToPixels,
  scaleImagesBySizeMode,
  scaleImagesForStitch,
} from './image-layout'

describe('image layout helpers', () => {
  it('places images horizontally and centers shorter images', () => {
    expect(
      computeStitchLayout(
        [
          { width: 400, height: 300 },
          { width: 200, height: 500 },
        ],
        'horizontal',
        20,
      ),
    ).toEqual({
      width: 620,
      height: 500,
      placements: [
        { x: 0, y: 100, width: 400, height: 300 },
        { x: 420, y: 0, width: 200, height: 500 },
      ],
    })
  })

  it('places images vertically and centers narrower images', () => {
    expect(
      computeStitchLayout(
        [
          { width: 400, height: 300 },
          { width: 200, height: 500 },
        ],
        'vertical',
        16,
      ),
    ).toEqual({
      width: 400,
      height: 816,
      placements: [
        { x: 0, y: 0, width: 400, height: 300 },
        { x: 100, y: 316, width: 200, height: 500 },
      ],
    })
  })

  it('clamps crop percentages inside the image', () => {
    expect(clampCropRect({ x: 95, y: -10, width: 30, height: 120 })).toEqual({
      x: 70,
      y: 0,
      width: 30,
      height: 100,
    })
  })

  it('converts crop percentages to bounded pixels', () => {
    expect(
      cropRectToPixels(
        { x: 25, y: 10, width: 50, height: 40 },
        800,
        400,
      ),
    ).toEqual({ x: 200, y: 40, width: 400, height: 160 })
  })

  it('scales image widths for fixed horizontal stitching', () => {
    expect(
      scaleImagesForStitch(
        [
          { width: 400, height: 300 },
          { width: 200, height: 500 },
        ],
        'horizontal',
        800,
      ),
    ).toEqual([
      { width: 800, height: 600 },
      { width: 800, height: 2000 },
    ])
  })

  it('scales image heights for fixed vertical stitching', () => {
    expect(
      scaleImagesForStitch(
        [
          { width: 400, height: 300 },
          { width: 200, height: 500 },
        ],
        'vertical',
        300,
      ),
    ).toEqual([
      { width: 400, height: 300 },
      { width: 120, height: 300 },
    ])
  })

  it('supports fixed width independently of stitch direction', () => {
    expect(
      scaleImagesBySizeMode([{ width: 300, height: 600 }], 'width', 900),
    ).toEqual([{ width: 900, height: 1800 }])
  })

  it('supports fixed height independently of stitch direction', () => {
    expect(
      scaleImagesBySizeMode([{ width: 600, height: 300 }], 'height', 900),
    ).toEqual([{ width: 1800, height: 900 }])
  })
})
