/**
 * Lightweight Charts 박스 오버레이. 주문/자동 인식과 무관하다.
 */

class AnnotationBoxRenderer {
  /**
   * @param {() => { chart?: object, series?: object, boxes: object[] }} source
   */
  constructor(source) {
    this._source = source
  }

  /**
   * @param {{ useMediaCoordinateSpace: Function }} target
   */
  draw(target) {
    const { chart, series, boxes } = this._source()
    if (!chart || !series || !Array.isArray(boxes) || boxes.length === 0) return

    target.useMediaCoordinateSpace((scope) => {
      const ctx = scope.context
      const timeScale = chart.timeScale()
      for (const box of boxes) {
        const x1 = timeScale.timeToCoordinate(box.startTime)
        const x2 = timeScale.timeToCoordinate(box.endTime)
        const y1 = series.priceToCoordinate(box.topPrice)
        const y2 = series.priceToCoordinate(box.bottomPrice)
        if (x1 == null || x2 == null || y1 == null || y2 == null) continue
        const left = Math.min(x1, x2)
        const width = Math.max(Math.abs(x2 - x1), 4)
        const top = Math.min(y1, y2)
        const height = Math.max(Math.abs(y2 - y1), 4)
        ctx.fillStyle = box.color
        ctx.strokeStyle = box.borderColor
        ctx.lineWidth = 1
        ctx.fillRect(left, top, width, height)
        ctx.strokeRect(left, top, width, height)
        if (box.label) {
          ctx.fillStyle = box.borderColor
          ctx.font = '11px sans-serif'
          ctx.fillText(box.label, left + 4, top + 12)
        }
      }
    })
  }
}

class AnnotationBoxPaneView {
  /**
   * @param {() => { chart?: object, series?: object, boxes: object[] }} source
   */
  constructor(source) {
    this._renderer = new AnnotationBoxRenderer(source)
  }

  renderer() {
    return this._renderer
  }
}

export class ChartAnnotationPrimitive {
  constructor() {
    this._chart = null
    this._series = null
    this._requestUpdate = null
    this._boxes = []
    this._paneViews = [new AnnotationBoxPaneView(() => this._state())]
  }

  /**
   * @param {{ chart: object, series: object, requestUpdate: () => void }} param
   */
  attached(param) {
    this._chart = param.chart
    this._series = param.series
    this._requestUpdate = param.requestUpdate
  }

  detached() {
    this._chart = null
    this._series = null
    this._requestUpdate = null
  }

  /**
   * @param {object[]} boxes
   */
  setBoxes(boxes) {
    this._boxes = Array.isArray(boxes) ? boxes : []
    this._requestUpdate?.()
  }

  paneViews() {
    return this._paneViews
  }

  _state() {
    return {
      chart: this._chart,
      series: this._series,
      boxes: this._boxes,
    }
  }
}
