const Errors = {
  Function: {
    interval_format: piece => new Error('Bad interval format: ' + JSON.stringify(piece, (key, ele) => {
      if (typeof ele === 'function') {
        return ele.toString()
      } else {
        return ele
      }
    }, 2)),
    overlapping_intervals: new Error('Overlapping intervals'),
    incorrect_interval_range: new Error('Interval min can\'t be larger than max'),
    bad_initialization: new Error('Bad initialization')
  },
  Figure: {
    not_drawing: new Error('Object must be of type Drawing')
  }
}

function floatAdjacent(n, prevOrNext) {
  const f64 = new Float64Array(1);
  const b64 = new BigInt64Array(f64.buffer);
  if (prevOrNext === 'prev') {
    if (n !== 0) {
      f64[0] = n;
      const transducer = b64[0];
      b64[0] = transducer + (transducer > 0n ? -1n : 1n);
      return f64[0];
    } else {
      return -Number.MIN_VALUE;
    }
  } else if (prevOrNext === 'next') {
    f64[0] = n + 0;
    const transducer = b64[0];
    b64[0] = transducer + (transducer >= 0n ? 1n : -1n);
    return f64[0];
  }
}

function deepFreeze(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj
  }

  Object.freeze(obj)
  Object.getOwnPropertyNames(obj).forEach(prop => {
    if (obj[prop] !== null
      && (typeof obj[prop] === "object" || typeof obj[prop] === "function")
      && !Object.isFrozen(obj[prop])) {
      deepFreeze(obj[prop])
    }
  })

  return obj
}

function deepCopy({ destObj, srcObj }) {
  if (srcObj === null || typeof srcObj !== 'object') {
    return srcObj
  }
  if (!destObj) destObj = {}
  function deepCopyRec(destObj, srcObj) {
    Object.getOwnPropertyNames(srcObj).forEach(prop => {
      if (typeof srcObj[prop] === 'object' && srcObj[prop] !== null) {
        if (srcObj[prop] instanceof Array) {
          destObj[prop] = srcObj[prop].map(ele => {
            if (typeof ele === 'object') {
              return deepCopy({ srcObj: ele })
            } else {
              return ele
            }
          })
        } else {
          destObj[prop] = {}
          deepCopyRec(destObj[prop], srcObj[prop])
        }
      }
      else destObj[prop] = srcObj[prop]
    })
  }
  deepCopyRec(destObj, srcObj)
  return destObj
}

function prepareSite() {
  document.head.replaceChildren()
  document.body.replaceChildren()
  document.body.style.width = '100vw'
  document.body.style.height = '100vh'
  document.body.style.margin = '0'
  const style = document.createElement('style')
  style.textContent = `
    .menu {
      position: fixed;
      top: 1rem;
      left: 1rem;
      background-color: #e4e4e4;
      overflow-y: auto;
      max-height: 200px;
      padding: .5rem;
      border-radius: .5rem;
    }
  
    .option {
      background-color: white;
      margin-bottom: .5rem;
      border-radius: .3rem;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
      user-select: none;
    }
  
    .menu div[selected=''] {
      background-color: gray;
    }
  
    .name {
      display: inline-block;
      margin: 0;
      margin-inline: .5rem;
      pointer-events: none;
    }
  
    .color {
      display: inline-block;
      height: 10px;
      width: 10px;
      margin-inline: .5rem;
      pointer-events: none;
    }
  
    /* Scrollbar */
    ::-webkit-scrollbar {
      width: 4px;
    }
    ::-webkit-scrollbar-track {
      box-shadow: inset 0 0 5px grey; 
      border-radius: 10px;
    }
    ::-webkit-scrollbar-thumb {
      background: gray; 
      border-radius: 10px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: #3a3a3a; 
    }
  `
  document.body.appendChild(style)

  const dropDownMenu = document.createElement('div')
  dropDownMenu.classList.add('menu')
  dropDownMenu.id = 'dropdown-menu'
  document.body.appendChild(dropDownMenu)
}

prepareSite()

class Figure {
  static idx = 0
  static fId = 0

  constructor() {
    this.canvas = document.createElement('canvas')
    this.canvas.id = 'Figure ' + Figure.idx++
    this.ctx = this.canvas.getContext('2d')
    const defaultScale = 100, rescaler = 35
    this.defaults = deepFreeze({
      canvasWidth: document.body.clientWidth - 10,
      canvasHeight: document.body.clientHeight - 10,
      backgroundColor: 'white',
      scale: {
        x: {
          val: defaultScale,
          factor: 0
        },
        y: {
          val: defaultScale,
          factor: 0
        },
        rescaler,
        min: defaultScale - rescaler,
        max: defaultScale + rescaler,
        zoomFactor: 1.1,
      },
      precision: 3, // In pixels
    })
    this.canvas.width = this.defaults.canvasWidth
    this.canvas.height = this.defaults.canvasHeight
    this.backgroundColor = this.defaults.backgroundColor
    this.scale = {}
    deepCopy({ srcObj: this.defaults.scale, destObj: this.scale })
    this.axes = new Axes(this)
    this.axes.plot()
    // this.methods = new Methods(this)

    this.precision = this.defaults.precision
    this.functions = new Map()
    this.drawings = []

    this.dropDownMenu = document.getElementById('dropdown-menu')

    this.canvas.addEventListener('mousemove', ev => {
      if (ev.buttons === 1) {
        this.pan({ x: ev.movementX, y: ev.movementY })
      }
    })

    const movement = { x: 0, y: 0, step: 20 }
    window.addEventListener('keydown', ev => {
      if (ev.ctrlKey && ev.key !== 'Control') {
        let preventDefault = true
        if (!ev.shiftKey) {
          switch (ev.key) {
            case '-': this.zoomIn('all'); break;
            case 'x': this.zoomIn('x'); break;
            case 'y': this.zoomIn('y'); break;
            case ' ': this.center(); break;
            case 'l': this.resetZoom(); break;
            default: preventDefault = false
          }
        } else if (ev.shiftKey && ev.key !== 'Shift') {
          switch (ev.key) {
            case '_': this.zoomOut('all'); break;
            case 'X': this.zoomOut('x'); break;
            case 'Y': this.zoomOut('y'); break;
            default: preventDefault = false
          }
        }
        if (preventDefault) ev.preventDefault()
      } else {
        switch (ev.key) {
          case 'w': movement.y = movement.step; break;
          case 'a': movement.x = movement.step; break;
          case 's': movement.y = -movement.step; break;
          case 'd': movement.x = -movement.step; break;
        }
      }
    })

    window.addEventListener('keyup', ev => {
      switch (ev.key) {
        case 'w': movement.y = 0; break;
        case 'a': movement.x = 0; break;
        case 's': movement.y = 0; break;
        case 'd': movement.x = 0; break;
      }
    })

    setInterval(() => {
      if (movement.x || movement.y) this.pan(movement)
    }, 20)
  }

  addFunction(f) {
    const option = document.createElement('div')
    option.classList.add('option')
    option.fKey = 'f' + Figure.fId++
    option.id = option.fKey
    option.selected = false

    const color = document.createElement('div')
    color.classList.add('color')
    color.style.backgroundColor = f.styling.strokeStyle

    const functionName = document.createElement('p')
    functionName.textContent = option.fKey
    functionName.classList.add('name')

    const deleteBtn = document.createElement('button')
    deleteBtn.textContent = 'X'
    deleteBtn.addEventListener('click', ev => {
      this.removeFunction(ev.target.parentElement.fKey)
    })

    option.appendChild(color)
    option.appendChild(functionName)
    option.appendChild(deleteBtn)

    option.addEventListener('click', ev => {
      ev.target.selected = !ev.target.selected
      if (ev.target.selected) {
        option.setAttribute('selected', '')
        f.visible = false
      } else {
        option.removeAttribute('selected')
        f.visible = true
      }
      this.draw()
    })

    option.addEventListener('mouseover', ev => {
      f.highlight()
      this.draw()
    })

    option.addEventListener('mouseleave', ev => {
      f.unhighlight()
      this.draw()
    })

    this.dropDownMenu.appendChild(option)

    this.functions.set(option.fKey, f)
    this.draw()
  }

  removeFunction(fKey) {
    document.getElementById(fKey).remove()
    this.functions.delete(fKey)
    this.draw()
  }

  clearFunctions() {
    this.dropDownMenu.replaceChildren()
    this.functions.clear()
    this.draw()
  }

  clear() {
    this.ctx.save()
    this.ctx.resetTransform()
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    this.ctx.restore()
  }

  draw() {
    this.clear()
    this.axes.plot()
    for (const f of this.functions.values()) {
      if (f.visible) this.plotFunction(f)
    }
    for (const drawing of this.drawings) {
      drawing.draw()
    }
  }

  figureToCanvas1d({ x, y }) {
    if (x != null) return this.axes.origin.i + x * this.scale.x.val * 2 ** this.scale.x.factor
    if (y != null) return this.axes.origin.j - y * this.scale.y.val * 2 ** this.scale.y.factor
  }

  figureToCanvasCoords({ x, y }) {
    return {
      i: this.figureToCanvas1d({ x }),
      j: this.figureToCanvas1d({ y }),
    }
  }

  canvasToFigure1d({ i, j }) {
    if (i != null) return (i - this.axes.origin.i) / (this.scale.x.val * 2 ** this.scale.x.factor)
    if (j != null) return (j - this.axes.origin.j) / (this.scale.y.val * 2 ** this.scale.y.factor)
  }

  canvasToFigureCoords({ i, j }) {
    return {
      x: this.canvasToFigure1d({ i }),
      y: this.canvasToFigure1d({ j }),
    }
  }

  plotEmptyDot({ x, y }) {
    const center = this.figureToCanvasCoords({ x, y })
    this.ctx.save()
    const radius = 3
    this.ctx.beginPath()
    this.ctx.moveTo(center.i, center.j)
    this.ctx.arc(center.i, center.j, radius < 2 ? 2 : radius, 0, 2 * Math.PI)
    this.ctx.strokeStyle = 'black'
    this.ctx.lineWidth = 2
    this.ctx.stroke()
    this.ctx.fillStyle = this.backgroundColor
    this.ctx.fill()
    this.ctx.restore()
  }

  plotFunction(f) {
    this.ctx.save()

    for (const key in f.styling) {
      this.ctx[key] = f.styling[key]
    }

    this.ctx.beginPath()

    // let dynamicPrecision = this.precision, prevPrecision = this.precision, prevAngle = 0, prevPieceIdx = null
    // const prevPoint = { x: 0, y: 0 }
    let prevPieceIdx = null
    for (let i = 0; i <= this.canvas.width; i += this.precision/* dynamicPrecision */) {
      const x = this.canvasToFigure1d({ i })
      const pieceIdx = f.pieceIdx(x)
      if (pieceIdx !== null) {
        const y = f.eval(x)
        const j = this.figureToCanvas1d({ y })
        if (prevPieceIdx !== pieceIdx) {
          if (prevPieceIdx !== null) {
            const prevPieceRightLim = this.figureToCanvasCoords(f.getPieceLimits(prevPieceIdx).right)
            this.ctx.lineTo(prevPieceRightLim.i, prevPieceRightLim.j)
          }
          const pieceLeftLim = this.figureToCanvasCoords(f.getPieceLimits(pieceIdx).left)
          this.ctx.moveTo(pieceLeftLim.i, pieceLeftLim.j)
          this.ctx.lineTo(i, j)
          prevPieceIdx = pieceIdx
          // prevPoint.x = x
          // prevPoint.y = y
        } else {
          this.ctx.lineTo(i, j)
          // const currentAngle = Math.atan((y - prevPoint.y) / (x - prevPoint.x))
          // const deltaAngle = Math.abs(currentAngle - prevAngle)
          // dynamicPrecision = (prevPrecision + this.precision / (deltaAngle > 1 ? deltaAngle : 1)) / 2
          // prevPrecision = dynamicPrecision
          // prevPoint.x = x
          // prevPoint.y = y
          // prevAngle = currentAngle
        }
      }
    }
    if (prevPieceIdx !== null) {
      const prevPieceRightLim = this.figureToCanvasCoords(f.getPieceLimits(prevPieceIdx).right)
      this.ctx.lineTo(prevPieceRightLim.i, prevPieceRightLim.j)
    }
    this.ctx.stroke()

    if (prevPieceIdx !== null) {
      for (let i = 0; i < f.pieces.length; ++i) {
        const piece = f.pieces[i], prevPiece = f.pieces[i - 1], nextPiece = f.pieces[i + 1]
        const centerMin = {
          x: piece.interval.min.val,
          y: piece.f(piece.interval.min.val)
        }
        if (!piece.interval.min.included && centerMin.y !== prevPiece?.f(prevPiece.interval.max.val)) {
          this.plotEmptyDot(centerMin)
        }

        const centerMax = {
          x: piece.interval.max.val,
          y: piece.f(piece.interval.max.val)
        }
        if (!piece.interval.max.included && centerMax.y !== nextPiece?.f(nextPiece.interval.min.val)) {
          this.plotEmptyDot(centerMax)
        }
      }
    }

    this.ctx.restore()
  }

  setInDocument() {
    const existingCanvas = document.body.querySelector('canvas')
    if (existingCanvas) document.body.removeChild(existingCanvas)
    document.body.appendChild(this.canvas)
  }

  pan({ x = 0, y = 0 }) {
    this.axes.moveBy(x, y)
    this.draw()
  }

  zoomIn(dir) {
    if (dir === 'x' || dir === 'all') {
      this.scale.x.val *= this.defaults.scale.zoomFactor
      if (this.scale.x.val > this.defaults.scale.max) {
        this.scale.x.val -= this.defaults.scale.rescaler
        ++this.scale.x.factor
      }
    }
    if (dir === 'y' || dir === 'all') {
      this.scale.y.val *= this.defaults.scale.zoomFactor
      if (this.scale.y.val > this.defaults.scale.max) {
        this.scale.y.val -= this.defaults.scale.rescaler
        ++this.scale.y.factor
      }
    }
    this.draw()
  }

  zoomOut(dir) {
    if (dir === 'x' || dir === 'all') {
      this.scale.x.val /= this.defaults.scale.zoomFactor
      if (this.scale.x.val < this.defaults.scale.min) {
        this.scale.x.val += this.defaults.scale.rescaler
        --this.scale.x.factor
      }
    }
    if (dir === 'y' || dir === 'all') {
      this.scale.y.val /= this.defaults.scale.zoomFactor
      if (this.scale.y.val < this.defaults.scale.min) {
        this.scale.y.val += this.defaults.scale.rescaler
        --this.scale.y.factor
      }
    }
    this.draw()
  }

  resetZoom() {
    deepCopy({ srcObj: this.defaults.scale, destObj: this.scale })
    this.draw()
  }

  center() {
    this.axes.center()
    this.draw()
  }

  addDrawing(drawing) {
    if (!drawing instanceof Drawing) throw Errors.Figure.not_drawing
    this.drawings.push(drawing)
    this.draw()
  }
}

class Axes {
  constructor(figure) {
    this.figure = figure
    this.scale = figure.scale
    this.origin = {
      i: this.ctx.canvas.width / 2,
      j: this.ctx.canvas.height / 2
    }
  }

  get ctx() {
    return this.figure.ctx
  }

  gridLines(gridLineLen = undefined) {
    this.ctx.save()
    this.ctx.resetTransform()
    this.ctx.fillStyle = 'black'
    const fontSize = 11
    this.ctx.font = fontSize + 'px sans-serif'
    this.ctx.textAlign = 'center'

    this.ctx.beginPath()
    const vLines = this.origin.i / this.scale.x.val
    const xGridSep = 2 ** this.scale.x.factor
    for (
      let i = vLines % 1 * this.scale.x.val, n = -parseInt(vLines) / xGridSep;
      i < this.ctx.canvas.width;
      i += this.scale.x.val, n += 1 / xGridSep
    ) {
      this.ctx.moveTo(i, gridLineLen ? this.origin.j - gridLineLen / 2 : 0)
      this.ctx.lineTo(i, gridLineLen ? this.origin.j + gridLineLen / 2 : this.ctx.canvas.height)
      if (gridLineLen) {
        const nToPrec = n.toPrecision(3).replace(/(\.[1-9]*)0+$/, '$1').replace(/\.$/, '')
        const nStr = nToPrec.length <= n.toExponential(2).length ? nToPrec : n.toExponential(2)
        this.ctx.fillText(nStr, n !== 0 ? i : i - fontSize / 2, this.origin.j + 2.5 * gridLineLen)
      }
    }
    const hLines = this.origin.j / this.scale.y.val
    const yGridSep = 2 ** this.scale.y.factor
    for (
      let i = hLines % 1 * this.scale.y.val, n = parseInt(hLines) / yGridSep;
      i < this.ctx.canvas.height;
      i += this.scale.y.val, n -= 1 / yGridSep
    ) {
      this.ctx.moveTo(gridLineLen ? this.origin.i - gridLineLen / 2 : 0, i)
      this.ctx.lineTo(gridLineLen ? this.origin.i + gridLineLen / 2 : this.ctx.canvas.width, i)
      if (gridLineLen) {
        const nToPrec = n.toPrecision(3).replace(/(\.[1-9]*)0+$/, '$1').replace(/\.$/, '')
        const nStr = nToPrec.length <= n.toExponential(2).length ? nToPrec : n.toExponential(2)
        this.ctx.fillText(n !== 0 ? nStr : '', this.origin.i + 2.5 * gridLineLen, i)
      }
    }
    this.ctx.stroke()

    this.ctx.restore()
  }

  plot() {
    this.ctx.save()
    this.ctx.resetTransform()
    this.ctx.lineWidth = 2
    this.ctx.strokeStyle = 'black'
    this.ctx.beginPath()
    this.ctx.moveTo(this.origin.i, 0)
    this.ctx.lineTo(this.origin.i, this.ctx.canvas.height)
    this.ctx.moveTo(0, this.origin.j)
    this.ctx.lineTo(this.ctx.canvas.width, this.origin.j)
    this.ctx.stroke()

    this.ctx.lineWidth = 1
    this.gridLines(6)

    this.ctx.lineWidth = 0.5
    this.ctx.strokeStyle = 'rgba(0,0,0,0.3)'
    this.gridLines()

    this.ctx.restore()
  }

  moveBy(x, y) {
    this.origin.i += x
    this.origin.j += y
  }

  moveTo(x, y) {
    this.origin.i = x
    this.origin.j = y
  }

  center() {
    this.origin.i = this.ctx.canvas.width / 2
    this.origin.j = this.ctx.canvas.height / 2
  }
}

class Function {
  // Initialize with either a function or an array of the form:
  // [{f: functionPiece1, interval: '[min, max]'||'[min, max)'||etc}, ...]
  // where an undefined interval is equivalent to (-Infinity, Infinity).
  constructor(funOrPiecewiseArr, color = 'red') {
    this.styling = {
      strokeStyle: color,
      lineWidth: 1,
    }
    this.visible = true
    if (typeof funOrPiecewiseArr === 'function') {
      this.pieces = [{
        f: funOrPiecewiseArr,
        interval: {
          min: { val: -Infinity, included: false },
          max: { val: Infinity, included: false }
        }
      }]
    } else if (funOrPiecewiseArr instanceof Array) {
      const intervalPattern = /[[(]\s*([+-]?(?:\d*\.\d+|\d+|inf|infinity))\s*,\s*([+-]?(?:\d*\.\d+|\d+|inf|infinity))\s*[\])]/i
      for (const piece of funOrPiecewiseArr) {
        if (!piece.interval) {
          piece.interval = {
            min: { val: -Infinity, included: false },
            max: { val: Infinity, included: false }
          }
        }
        else {
          if (typeof piece.interval !== 'string') {
            throw Errors.Function.interval_format(piece)
          }
          piece.interval = piece.interval.trim()
          const intMatch = piece.interval.match(intervalPattern)
          if (!intMatch) throw Errors.Function.interval_format(piece)
          if (/inf/i.test(intMatch[1])) intMatch[1] = intMatch[1].replace(/inf.*/i, 'Infinity')
          if (/inf/i.test(intMatch[2])) intMatch[2] = intMatch[2].replace(/inf.*/i, 'Infinity')
          const intVals = {
            min: { val: parseFloat(intMatch[1]), included: true },
            max: { val: parseFloat(intMatch[2]), included: true }
          }
          if (intVals.min.val > intVals.max.val) throw Errors.Function.incorrect_interval_range
          if (piece.interval[0] === '(') intVals.min.included = false
          if (piece.interval[piece.interval.length - 1] === ')') intVals.max.included = false
          piece.interval = intVals
        }
      }
      for (const piece of funOrPiecewiseArr) {
        for (const otherPiece of funOrPiecewiseArr) {
          if (piece === otherPiece) continue
          if (
            (this.isInInterval(otherPiece.interval, piece.interval.min.included ?
              piece.interval.min.val : floatAdjacent(piece.interval.min.val, 'next'))) ||
            (this.isInInterval(otherPiece.interval, piece.interval.max.included ?
              piece.interval.max.val : floatAdjacent(piece.interval.max.val, 'prev')))
          ) throw Errors.Function.overlapping_intervals
        }
      }
      funOrPiecewiseArr.sort((current, prev) => {
        if (current.interval.max.val <= prev.interval.min.val) return -1
      })
      this.pieces = funOrPiecewiseArr
    } else {
      throw Errors.Function.bad_initialization
    }
  }

  eval(x) {
    for (const piece of this.pieces) {
      if (this.isInInterval(piece.interval, x)) return piece.f(x)
    }
    return undefined
  }

  pieceIdx(x) {
    const leftInterval = {
      min: { val: -Infinity, included: false },
      max: { val: this.pieces[0].interval.min.val, included: !this.pieces[0].interval.min.included },
    }
    const rightInterval = {
      min: {
        val: this.pieces[this.pieces.length - 1].interval.max.val,
        included: !this.pieces[this.pieces.length - 1].interval.max.included
      },
      max: { val: Infinity, included: false },
    }
    if (this.isInInterval(leftInterval, x) || this.isInInterval(rightInterval, x)) return null
    for (let i = 0; i < this.pieces.length; ++i) {
      if (this.isInInterval(this.pieces[i].interval, x)) return i
      else if (this.isInInterval({
        min: { val: this.pieces[i].interval.max.val, included: !this.pieces[i].interval.max.included },
        max: { val: this.pieces[i + 1].interval.min.val, included: !this.pieces[i + 1].interval.min.included }
      }, x)) return null
    }
    return null
  }

  isInInterval(interval, x) {
    if ((interval.min.included ? interval.min.val <= x : interval.min.val < x) &&
      (interval.max.included ? x <= interval.max.val : x < interval.max.val))
      return true
    else return false
  }

  getPieceLimits(pieceIdx) {
    const limits = {
      left: { x: null, y: null },
      right: { x: null, y: null },
    }
    limits.left.x = this.pieces[pieceIdx].interval.min.val
    limits.left.y = this.pieces[pieceIdx].f(limits.left.x)
    limits.right.x = this.pieces[pieceIdx].interval.max.val
    limits.right.y = this.pieces[pieceIdx].f(limits.right.x)
    return limits
  }

  toggleVisibility() {
    this.visible = !this.visible
  }

  highlight() {
    this.styling.lineWidth = 2.5
  }
  unhighlight() {
    this.styling.lineWidth = 1
  }
}

class Drawing {
  constructor({ figure, points, text, styling, stroke = true, fill = false }) {
    this.figure = figure
    this.ctx = figure.ctx
    this.origin = figure.axes.origin
    this.points = points // In figure coords
    this.text = text
    this.styling = styling
    this.stroke = stroke
    this.fill = fill
  }

  getCavnasPoint(point) {
    if (point.x != null && point.y != null) return this.figure.figureToCanvasCoords(point)
    else if (point.i != null && point.j != null) return point
    else if (point.k != null && point.l != null) return {
      i: typeof point.k === 'number' ? this.origin.i + point.k : this.figure.figureToCanvas1d({ x: point.k.x }) + point.k.k,
      j: typeof point.l === 'number' ? this.origin.j + point.l : this.figure.figureToCanvas1d({ y: point.k.y }) + point.l.l,
    }
    else if (point.x != null && point.j != null) return { i: this.figure.figureToCanvas1d({ x: point.x }), j: point.j }
    else if (point.x != null && point.l != null) return {
      i: this.figure.figureToCanvas1d({ x: point.x }),
      j: typeof point.l === 'number' ? this.origin.j + point.l : this.figure.figureToCanvas1d({ y: point.k.y }) + point.l.l,
    }
    else if (point.i != null && point.y != null) return { i: point.i, j: this.figure.figureToCanvas1d({ y: point.y }) }
    else if (point.k != null && point.y != null) return {
      i: typeof point.k === 'number' ? this.origin.i + point.k : this.figure.figureToCanvas1d({ x: point.k.x }) + point.k.k,
      j: this.figure.figureToCanvas1d({ y: point.y })
    }
    else return undefined
  }

  canvasPoints() {
    const canvasPoints = []
    let canvasPoint
    for (const point of this.points) {
      canvasPoint = this.getCavnasPoint(point)
      if (canvasPoint) canvasPoints.push(canvasPoint)
      else console.warn('A point in the drawing had incorrect format')
    }
    return canvasPoints
  }

  draw() {
    this.ctx.save()

    for (const key in this.styling) {
      this.ctx[key] = this.styling[key]
    }

    this.ctx.beginPath()
    const canvasPoints = this.canvasPoints()
    this.ctx.moveTo(canvasPoints[0].i, canvasPoints[0].j)
    for (let i = 1; i < canvasPoints.length; ++i) {
      this.ctx.lineTo(canvasPoints[i].i, canvasPoints[i].j)
    }
    for (const textElem of this.text) {
      const position = this.getCavnasPoint(textElem.position)
      this.ctx.fillText(textElem.string, position.i, position.j)
    }
    if (this.stroke) this.ctx.stroke()
    if (this.fill) this.ctx.fill()

    this.ctx.restore()
  }
}

class Methods {
  constructor(figure) {
    this.figure = figure
    this.ctx = figure.ctx
    this.scale = figure.scale
  }

  plotBrackets(interval, label, color = 'blue') {
    const styling = {
      lineWidth: 2,
      strokeStyle: color,
      textAlign: 'center',
      fontSize: '13px sans-serif',
    }

    const size = { v: 30, h: 10 }
    const points = [
      { k: { x: interval.min, k: size.h }, l: -size.v / 2 },
      { x: interval.min, l: -size.v / 2 },
      { x: interval.min, l: size.v / 2 },
      { k: { x: interval.min, k: size.h }, l: size.v / 2 },
    ]

    const text = [{
      position: { x: interval.min, l: size.v },
      string: label
    }]

    this.figure.addDrawing(new Drawing({ figure: this.figure, points, text, styling }))
  }
}

const fig = new Figure()
const f = x => 0.0000000068 * x ** 3 - 0.0000045 * x ** 2 + 0.0023 * x + 0.43
fig.addFunction(new Function([
  { f, interval: '(0, 1000]' },
  { f: x => f(1000), interval: '(1000, inf)' },
], 'blue'))
fig.addFunction(new Function([
  { f: x => Math.sin(x ** 2), interval: '[1, 3]' },
  { f: x => x - 3 + Math.sin(3 ** 2), interval: '(3, 5)' },
  { f: x => 4, interval: '[6, 8)' },
], 'red'))
fig.addFunction(new Function(x => x ** 2, 'green'))
fig.setInDocument()

const M = new Methods(fig)
M.plotBrackets({ min: 3, max: 5 }, 'a = 4', 'purple')
