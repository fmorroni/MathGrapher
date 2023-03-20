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
    not_function: new Error('Object must be of type Function'),
    not_drawing: new Error('Object must be of type Drawing'),
  },
  Methods: {
    bisection_bolzano: (f, a, b) => new Error(`Can't confirm root in interval [${a}, ${b}]: f(a)*f(b) = ${f.eval(a) * f.eval(b)}`)
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

    .stroke-color {
      display: inline-block;
      height: 2px;
      width: 15px;
      margin-inline: .5rem;
      pointer-events: none;
    }
  
    .fill-color {
      display: inline-block;
      height: 10px;
      width: 10px;
      margin-inline: .5rem;
      pointer-events: none;
    }
  
    .info-box {
      position: fixed;
      top: 1rem;
      right: 1rem;
      background-color: #e4e4e4;
      overflow-y: auto;
      max-height: 200px;
      padding: .5rem;
      border-radius: .5rem;
    }

    /* Scrollbar */
    ::-webkit-scrollbar {
      width: 4px;
      height: 4px;
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
  static dId = 0

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
    this.drawings = new Map()

    this.dropDownMenu = document.getElementById('dropdown-menu')

    this.canvas.addEventListener('mousemove', ev => {
      if (ev.buttons === 1 && !ev.ctrlKey) {
        this.pan({ i: ev.movementX, j: ev.movementY })
      } else if (ev.buttons === 1 && ev.ctrlKey) {

      }
    })

    const movement = { i: 0, j: 0, step: 20 }
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
          case 'w': movement.j = movement.step; break;
          case 'a': movement.i = movement.step; break;
          case 's': movement.j = -movement.step; break;
          case 'd': movement.i = -movement.step; break;
        }
      }
    })

    window.addEventListener('keyup', ev => {
      switch (ev.key) {
        case 'w': movement.j = 0; break;
        case 'a': movement.i = 0; break;
        case 's': movement.j = 0; break;
        case 'd': movement.i = 0; break;
      }
    })

    setInterval(() => {
      if (movement.i || movement.j) this.pan(movement)
    }, 20)
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
      f.draw()
    }
    for (const drawing of this.drawings.values()) {
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

  setInDocument() {
    const existingCanvas = document.body.querySelector('canvas')
    if (existingCanvas) document.body.removeChild(existingCanvas)
    document.body.appendChild(this.canvas)
  }

  pan({ i = 0, j = 0 }) {
    this.axes.moveBy(i, j)
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

  zoomH(interval) {
    const width = this.canvas.width - 20
    const factor = Math.round(Math.log2(width / ((interval.max - interval.min) * this.defaults.scale.x.val)))
    const val = width / ((interval.max - interval.min) * (2 ** factor))
    Object.assign(this.scale.x, { val, factor })
    this.axes.moveBy(-this.figureToCanvas1d({ x: interval.min }) + 10, 0)
    this.draw()
  }

  zoomWindow(point1, point2) {

  }

  resetZoom() {
    deepCopy({ srcObj: this.defaults.scale, destObj: this.scale })
    this.draw()
  }

  center() {
    this.axes.center()
    this.draw()
  }

  addOption(optionKey, obj) {
    const option = document.createElement('div')
    option.classList.add('option')
    option.key = optionKey
    option.id = optionKey
    option.selected = false

    if (obj.styling.strokeStyle) {
      const strokeColor = document.createElement('div')
      strokeColor.classList.add('stroke-color')
      option.appendChild(strokeColor)
    }
    if (obj.styling.fillStyle) {
      const fillColor = document.createElement('div')
      fillColor.classList.add('fill-color')
      option.appendChild(fillColor)
    }

    const objName = document.createElement('p')
    objName.textContent = optionKey
    objName.classList.add('name')
    option.appendChild(objName)

    const deleteBtn = document.createElement('button')
    deleteBtn.textContent = 'X'
    deleteBtn.addEventListener('click', ev => {
      const key = ev.target.parentElement.key
      if (this.functions.has(key)) this.removeFunction(key)
      else if (this.drawings.has(key)) this.removeDrawing(key)
    })
    option.appendChild(deleteBtn)

    this.dropDownMenu.appendChild(option)
    this.setOptionObject(optionKey, obj)

    option.addEventListener('click', ev => {
      ev.target.selected = !ev.target.selected
      if (ev.target.selected) {
        option.setAttribute('selected', '')
        option.object.visible = false
      } else {
        option.removeAttribute('selected')
        option.object.visible = true
      }
      this.draw()
    })

    option.addEventListener('mouseover', ev => {
      option.object.highlight()
      this.draw()
    })

    option.addEventListener('mouseleave', ev => {
      option.object.unhighlight()
      this.draw()
    })
  }

  setOptionObject(optionKey, obj) {
    const option = this.getOption(optionKey)
    if (option.selected) obj.visible = false
    option.object = obj
    if (obj.styling.strokeStyle) option.querySelector('.stroke-color').style.backgroundColor = obj.styling.strokeStyle
    if (obj.styling.fillStyle) option.querySelector('.fill-color').style.backgroundColor = obj.styling.fillStyle
  }

  getOption(key) {
    return this.dropDownMenu.children[key]
  }

  addFunction(f, key = '') {
    if (!(f instanceof Function)) throw Errors.Figure.not_function
    if (!key) key = 'F' + Figure.fId++
    if (!this.getOption(key)) this.addOption(key, f)
    else this.setOptionObject(key, f)
    this.functions.set(key, f)
    this.draw()
    return key
  }

  removeFunction(key) {
    this.getOption(key).remove()
    this.functions.delete(key)
    this.draw()
  }

  clearFunctions() {
    for (const key of fig.functions.keys()) this.removeFunction(key)
    Figure.fId = 0
    this.draw()
  }

  addDrawing(drawing, key = '') {
    if (!(drawing instanceof Drawing)) throw Errors.Figure.not_drawing
    if (!key) key = 'D' + Figure.dId++
    if (!this.getOption(key)) this.addOption(key, drawing)
    else this.setOptionObject(key, drawing)
    this.drawings.set(key, drawing)
    this.draw()
    return key
  }

  removeDrawing(key) {
    this.getOption(key).remove()
    this.drawings.delete(key)
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
    this.visible = true
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

    this.ctx.beginPath()
    const vLines = this.origin.i / this.scale.x.val
    const xGridSep = 2 ** this.scale.x.factor
    this.ctx.textAlign = 'center'
    const labelsJpos = this.origin.j + 2.5 * gridLineLen
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
        const ni = (n !== 0 ? i : i - fontSize / 1.2)

        if (fontSize < labelsJpos && labelsJpos < this.figure.canvas.height) this.ctx.fillText(nStr, ni, labelsJpos)
        else if (labelsJpos <= fontSize) this.ctx.fillText(nStr, ni, fontSize)
        else this.ctx.fillText(nStr, ni, this.figure.canvas.height)
      }
    }
    const hLines = this.origin.j / this.scale.y.val
    const yGridSep = 2 ** this.scale.y.factor
    const labelsIpos = this.origin.i + 2.5 * gridLineLen
    this.ctx.textAlign = labelsIpos < this.figure.canvas.width - fontSize ? 'left' : 'right'
    for (
      let j = hLines % 1 * this.scale.y.val, n = parseInt(hLines) / yGridSep;
      j < this.ctx.canvas.height;
      j += this.scale.y.val, n -= 1 / yGridSep
    ) {
      this.ctx.moveTo(gridLineLen ? this.origin.i - gridLineLen / 2 : 0, j)
      this.ctx.lineTo(gridLineLen ? this.origin.i + gridLineLen / 2 : this.ctx.canvas.width, j)
      if (gridLineLen) {
        const nToPrec = n.toPrecision(3).replace(/(\.[1-9]*)0+$/, '$1').replace(/\.$/, '')
        const nStr = (n !== 0 ? nToPrec.length <= n.toExponential(2).length ? nToPrec : n.toExponential(2) : '')
        const nj = j

        if (fontSize < labelsIpos && labelsIpos < this.figure.canvas.width) this.ctx.fillText(nStr, labelsIpos, nj)
        else if (labelsIpos <= fontSize) this.ctx.fillText(nStr, fontSize, nj)
        else this.ctx.fillText(nStr, this.figure.canvas.width, nj)
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

  moveBy(i, j) {
    this.origin.i += i
    this.origin.j += j
  }

  moveTo(i, j) {
    this.origin.i = i
    this.origin.j = j
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
  constructor(figure, funOrPiecewiseArr, color = 'red') {
    this.figure = figure
    this.ctx = figure.ctx
    this.canvas = figure.canvas
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
      const valuePattern = /([+-]?(?:\d*\.\d+|\d+|\d+e[+-]?\d+|inf|infinity))/
      const intervalPattern = new RegExp(/[[(]\s*/.source + valuePattern.source + /\s*,\s*/.source + valuePattern.source + /\s*[\])]/.source, 'i')
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

  draw() {
    if (!this.visible) return
    this.ctx.save()

    for (const key in this.styling) {
      this.ctx[key] = this.styling[key]
    }

    this.ctx.beginPath()

    // let dynamicPrecision = this.precision, prevPrecision = this.precision, prevAngle = 0, prevPieceIdx = null
    // const prevPoint = { x: 0, y: 0 }
    let prevPieceIdx = null
    for (let i = 0; i <= this.canvas.width; i += this.figure.precision/* dynamicPrecision */) {
      const x = this.figure.canvasToFigure1d({ i })
      const pieceIdx = this.pieceIdx(x)
      if (pieceIdx !== null) {
        const y = this.eval(x)
        const j = this.figure.figureToCanvas1d({ y })
        // if (0 <= j && j <= this.canvas.height) {
        if (prevPieceIdx !== pieceIdx) {
          if (prevPieceIdx !== null) {
            const prevPieceRightLim = this.figure.figureToCanvasCoords(this.getPieceLimits(prevPieceIdx).right)
            this.ctx.lineTo(prevPieceRightLim.i, prevPieceRightLim.j)
          }
          const pieceLeftLim = this.figure.figureToCanvasCoords(this.getPieceLimits(pieceIdx).left)
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
      } //else {
      // this.ctx.moveTo(i, j)
      // }
      // }
    }
    if (prevPieceIdx !== null) {
      const prevPieceRightLim = this.figure.figureToCanvasCoords(this.getPieceLimits(prevPieceIdx).right)
      this.ctx.lineTo(prevPieceRightLim.i, prevPieceRightLim.j)
    }
    this.ctx.stroke()

    if (prevPieceIdx !== null) {
      for (let i = 0; i < this.pieces.length; ++i) {
        const piece = this.pieces[i], prevPiece = this.pieces[i - 1], nextPiece = this.pieces[i + 1]
        const centerMin = {
          x: piece.interval.min.val,
          y: piece.f(piece.interval.min.val)
        }
        if (!piece.interval.min.included && centerMin.y !== prevPiece?.f(prevPiece.interval.max.val)) {
          this.figure.plotEmptyDot(centerMin)
        }

        const centerMax = {
          x: piece.interval.max.val,
          y: piece.f(piece.interval.max.val)
        }
        if (!piece.interval.max.included && centerMax.y !== nextPiece?.f(nextPiece.interval.min.val)) {
          this.figure.plotEmptyDot(centerMax)
        }
      }
    }

    this.ctx.restore()
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

  highlight() {
    this.styling.lineWidth = 2.5
  }
  unhighlight() {
    this.styling.lineWidth = 1
  }
}

class Drawing {
  constructor({ figure, points, text = [], styling = {}, stroke = true, fill = false, dots = false, dotRadius = 4 }) {
    this.figure = figure
    this.ctx = figure.ctx
    this.origin = figure.axes.origin
    this.points = points // In figure coords
    this.text = text
    this.styling = styling
    this.stroke = stroke
    this.fill = fill
    this.dots = dots
    this.dotRadius = dotRadius
    this.visible = true
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

  draw() {
    if (!this.visible) return
    this.ctx.save()

    for (const key in this.styling) {
      if (typeof this.ctx[key] === 'function') this.ctx[key](this.styling[key])
      else this.ctx[key] = this.styling[key]
    }

    for (const subDrawingPoints of this.points) {
      if (this.stroke || this.fill) {
        this.ctx.beginPath()
        const canvasPoint = this.getCavnasPoint(subDrawingPoints[0])
        this.ctx.moveTo(canvasPoint.i, canvasPoint.j)
        for (let i = 1; i < subDrawingPoints.length; ++i) {
          const canvasPoint = this.getCavnasPoint(subDrawingPoints[i])
          if (!canvasPoint) console.warn(`Point ${i} in subdrawing`, subDrawingPoints, 'has incorrect format')
          else this.ctx.lineTo(canvasPoint.i, canvasPoint.j)
        }
        if (this.stroke) this.ctx.stroke()
        if (this.fill) this.ctx.fill()
      }
      if (this.dots) {
        this.ctx.beginPath()
        for (let i = 0; i < subDrawingPoints.length; ++i) {
          const canvasPoint = this.getCavnasPoint(subDrawingPoints[i])
          this.ctx.moveTo(canvasPoint.i, canvasPoint.j)
          if (!canvasPoint) console.warn(`Point ${i} in subdrawing`, subDrawingPoints, 'has incorrect format')
          else this.ctx.arc(canvasPoint.i, canvasPoint.j, this.dotRadius, 0, 2 * Math.PI)
        }
        this.ctx.fill()
      }
    }
    for (const textElem of this.text) {
      const position = this.getCavnasPoint(textElem.position)
      this.ctx.fillText(textElem.string, position.i, position.j)
    }

    this.ctx.restore()
  }

  highlight() {
    this.styling.lineWidth = 2.5
  }
  unhighlight() {
    this.styling.lineWidth = 1
  }
}

class Methods {
  constructor(figure) {
    this.figure = figure
    this.ctx = figure.ctx
    this.scale = figure.scale

    this.infoBox = {
      container: document.createElement('div'),
      title: document.createElement('h3'),
      entries: document.createElement('ul'),
    }
    this.infoBox.container.classList.add('info-box')
    this.infoBox.title.classList.add('info-box-title')
    this.infoBox.container.appendChild(this.infoBox.title)
    this.infoBox.container.appendChild(this.infoBox.entries)
    this.setInfoBoxTitle('Info Box')
    document.body.appendChild(this.infoBox.container)

    this.intervalIds = []
  }

  toggleInfoBox() {
    this.infoBox.container.hidden = !this.infoBox.container.hidden
  }

  clearInfoBox() {
    this.setInfoBoxTitle('Info Box')
    this.clearInfoBoxEntries()
  }

  clearInfoBoxEntries() {
    this.infoBox.entries.replaceChildren()
  }

  popInfoBoxEntry() {
    const li = this.infoBox.entries.lastChild
    li?.remove()
    return li
  }

  setInfoBoxTitle(title) {
    this.infoBox.title.textContent = title
  }

  addInfoBoxEntry(entry) {
    const li = document.createElement('li')
    li.textContent = entry
    this.infoBox.entries.appendChild(li)
    return li
  }

  updateInfoBoxEntry(li, newEntry) {
    li.textContent = newEntry
  }

  plotVertialLine(x, label = '', color = 'blue', drawingKey = '') {
    const fontSize = 14
    const styling = {
      lineWidth: 1,
      strokeStyle: color,
      textAlign: 'center',
      font: fontSize + 'px sans-serif',
      fillStyle: color,
    }

    const size = { v: 30, h: 10 }
    const points = [
      [
        { x, j: 0 },
        { x, j: 50 },
      ],
      [
        { x, j: 50 + 2 * fontSize },
        { x, j: this.ctx.canvas.height },
      ],
    ]

    const text = [
      {
        position: { x, j: 50 + 1.3 * fontSize },
        string: label
      },
    ]

    return this.figure.addDrawing(new Drawing({ figure: this.figure, points, text, styling }), drawingKey)
  }

  plotBrackets(interval, label = { min: '', max: '' }, color = 'blue') {
    const styling = {
      lineWidth: 2,
      strokeStyle: color,
      textAlign: 'center',
      font: '14px sans-serif',
      fillStyle: color,
    }

    const size = { v: 30, h: 10 }
    const points = [
      [
        { k: { x: interval.min, k: size.h }, l: -size.v / 2 },
        { x: interval.min, l: -size.v / 2 },
        { x: interval.min, l: size.v / 2 },
        { k: { x: interval.min, k: size.h }, l: size.v / 2 },
      ],
      [
        { k: { x: interval.max, k: -size.h }, l: -size.v / 2 },
        { x: interval.max, l: -size.v / 2 },
        { x: interval.max, l: size.v / 2 },
        { k: { x: interval.max, k: -size.h }, l: size.v / 2 },
      ]
    ]

    const text = [
      {
        position: { x: interval.min, l: size.v },
        string: label.min
      },
      {
        position: { x: interval.max, l: size.v },
        string: label.max
      }
    ]

    return this.figure.addDrawing(new Drawing({ figure: this.figure, points, text, styling }))
  }

  haltAllMethods() {
    this.intervalIds.forEach(iid => clearInterval(iid))
    this.intervalIds.length = 0
  }

  semiCheckMonotonic(df, interval, steps = 50) {
    let [a, b] = interval.min ? [interval.min, interval.max] : interval.sort((prev, current) => (prev > current) ? 1 : -1)
    const stepWidth = (b - a) / steps
    let prev = Math.sign(df.eval(a))
    for (let x = a + stepWidth; x <= b; x += stepWidth) {
      const current = df.eval(x)
      if (prev * current < 0) return false
      prev = current
    }
    return true
  }

  bisection(f, interval, { precision, iterations, iterDelay = 1000 } = {}) {
    this.clearInfoBox()
    if (!precision && !iterations) precision = 0.001
    this.setInfoBoxTitle('Bisection')
    let [a, b] = interval.min ? [interval.min, interval.max] : interval.sort((prev, current) => (prev > current) ? 1 : -1)
    let c = (a + b) / 2
    let delta = (c - a)
    let steps = 0

    const stepsLi = this.addInfoBoxEntry()
    const cLi = this.addInfoBoxEntry()
    const precisionLi = precision ? this.addInfoBoxEntry('precision = ' + precision) : null
    const deltaLi = this.addInfoBoxEntry()
    const statusLi = this.addInfoBoxEntry('Status: Ongoing')

    const visuals = () => {
      this.updateInfoBoxEntry(stepsLi, 'steps = ' + steps++)
      this.updateInfoBoxEntry(cLi, 'c = ' + c.toPrecision(5))
      this.updateInfoBoxEntry(deltaLi, '|E| <= ' + delta.toPrecision(5))
      this.plotVertialLine(a, 'a = ' + a.toPrecision(3), 'green', 'a')
      this.plotVertialLine(b, 'b = ' + b.toPrecision(3), 'green', 'b')
      this.plotVertialLine(c, 'c = ' + c.toPrecision(3), 'magenta', 'c')
    }

    let mult = f.eval(a) * f.eval(b)
    if (mult > 0) {
      this.clearInfoBox()
      throw Errors.Methods.bisection_bolzano(f, a, b)
    } else if (mult === 0) {
      c = f.eval(a) === 0 ? a : b
      delta = 0
      visuals()
      this.figure.removeDrawing('a')
      this.figure.removeDrawing('b')
    } else {
      visuals()

      return new Promise((res, rej) => {
        const intId = setInterval(() => {
          if (delta <= precision || steps > iterations) {
            clearInterval(intId)
            this.figure.removeDrawing('a')
            this.figure.removeDrawing('b')
            this.updateInfoBoxEntry(statusLi, 'Status: Finished')
            res({ c, delta, steps })
          } else {
            mult = f.eval(a) * f.eval(c)
            if (mult === 0) {
              delta = 0
              --steps
            }
            else {
              if (mult < 0) b = c
              else if (mult > 0) a = c
              else {
                clearInterval(intId)
                this.updateInfoBoxEntry(statusLi, 'Status: Error')
                rej()
                throw Errors.Methods.bisection_bolzano(f, a, c)
              }
              c = (a + b) / 2
              delta = (c - a)
            }
            visuals()
          }
        }, iterDelay)
        this.intervalIds.push(intId)
      })
    }
  }

  // bisection(f, interval, {precision, iterations, iterDelay = 1000} = {}) {
  newton({ interval, f, df, ddf, precision, iterations, iterDelay = 1000 }) {
    this.clearInfoBox()
    if (!precision && !iterations) precision = 0.001
    this.setInfoBoxTitle('Newton')
    let [a, b] = interval.min ? [interval.min, interval.max] : interval.sort((prev, current) => (prev > current) ? 1 : -1)
    let delta = b - a
    let steps = 0
    let xn, xnPrev

    const stepsLi = this.addInfoBoxEntry()
    const xnLi = this.addInfoBoxEntry()
    const precisionLi = precision ? this.addInfoBoxEntry('precision = ' + precision) : null
    const deltaLi = this.addInfoBoxEntry()
    const statusLi = this.addInfoBoxEntry('Status: Ongoing')
    this.plotVertialLine(a, 'a = ' + a.toPrecision(3), 'green', 'a')
    this.plotVertialLine(b, 'b = ' + b.toPrecision(3), 'green', 'b')

    const visuals = () => {
      this.updateInfoBoxEntry(stepsLi, 'steps = ' + steps)
      this.updateInfoBoxEntry(xnLi, `x${steps} = ${xn.toPrecision(5)}`)
      this.updateInfoBoxEntry(deltaLi, '|E| ≈ ' + delta.toPrecision(5))
      this.plotVertialLine(xn, `x${steps} = ${xn.toPrecision(3)}`, 'magenta', 'xn')
      if (xnPrev) {
        this.plotVertialLine(xnPrev, `x${steps - 1} = ${xnPrev.toPrecision(3)}`, 'grey', 'xn-1')
        const slopeFunction = new Function(x => df.eval(xnPrev) * (x - xnPrev) + f.eval(xnPrev), 'magenta')
        this.figure.addFunction(slopeFunction, 'slope')
      }
    }

    let bolzanoMult = f.eval(a) * f.eval(b)
    if (bolzanoMult > 0) {
      this.clearInfoBox()
      throw Errors.Methods.bisection_bolzano(f, a, b)
    } else if (bolzanoMult === 0) {
      xn = f.eval(a) === 0 ? a : b
      delta = 0
      visuals()
    } else {
      if (!this.semiCheckMonotonic(df, interval)) console.warn('Function is not monotonic, can\'t confirm single root. Method may diverge.')
      if (ddf) {
        if (f.eval(a) * ddf.eval(a) > 0) xn = a
        else if (f.eval(b) * ddf.eval(b) > 0) xn = b
        else {
          console.warn("Doesn't verify that f(a)*f''(a) > 0 or f(b)*f''(b) > 0. Choosing x0 = a, but method may diverge.")
          xn = a
        }
      } else {
        console.warn("Couldn't verify if f(a)*f''(a) > 0 or f(b)*f''(b) > 0. Choosing x0 = a")
        console.warn('Remeber checking that f is monotonic (df > 0 or df < 0) for all x in', interval)
        xn = a
      }
      visuals()
      return new Promise(res => {
        const intId = setInterval(() => {
          if (delta <= precision || steps > iterations) {
            clearInterval(intId)
            this.figure.removeFunction('slope')
            this.figure.removeDrawing('xn-1')
            this.updateInfoBoxEntry(statusLi, 'Status: Finished')
            res({ xn, delta, steps })
          } else {
            xnPrev = xn
            xn -= f.eval(xn) / df.eval(xn)
            delta = Math.abs(xn - xnPrev)
            ++steps
            visuals()
          }
        }, iterDelay)
        this.intervalIds.push(intId)
      })
    }
  }

  triangleThingies(sideLen, dotRadius, iterations, iterDelay = 100) {
    this.clearInfoBox()
    this.setInfoBoxTitle('Triangle thingy')

    const iterationsLi = this.addInfoBoxEntry()

    const visuals = () => {
      this.updateInfoBoxEntry(iterationsLi, `dots: ${i}/${iterations}`)
    }

    const initDots = [{ x: 0, y: 0 }, { x: sideLen, y: 0 }, { x: sideLen / 2, y: Math.sin(60 * Math.PI / 180) * sideLen }]
    this.figure.addDrawing(new Drawing({
      figure: this.figure,
      points: [initDots],
      styling: { fillStyle: 'red' },
      dots: true,
      dotRadius: 2 * dotRadius,
      stroke: false
    }), 'Initial Dots')

    let prevPoint = { x: sideLen / 2, y: 0 }
    const dots = new Drawing({
      figure: this.figure,
      points: [[prevPoint]],
      styling: { fillStyle: 'green' },
      dots: true,
      dotRadius,
      stroke: false
    })
    this.figure.addDrawing(dots, 'Dots')

    function randInt(min, max) {
      return Math.floor((Math.random() * (max - min + 1))) + min
    }

    function min(a, b) {
      return (a < b) ? a : b;
    }

    let i = 0
    const intId = setInterval(() => {
      if (i >= iterations) {
        clearInterval(intId)
      } else {
        ++i
        const chosenInitDot = initDots[randInt(0, 2)]
        const newPoint = {
          x: min(chosenInitDot.x, prevPoint.x) + Math.abs(chosenInitDot.x - prevPoint.x) / 2,
          y: min(chosenInitDot.y, prevPoint.y) + Math.abs(chosenInitDot.y - prevPoint.y) / 2,
        }
        dots.points[0].push(newPoint)
        this.figure.draw()

        prevPoint = newPoint
        visuals()
      }
    }, iterDelay)
    this.intervalIds.push(intId)
  }
}
