# Math Grapher

Draw functions and programatically generated drawings on a cartesian canvas.

## Example
```
const fig = new Figure()
fig.addFunction(new Function([
  { f: x => Math.sin(x ** 2), interval: '[1, 3]' },
  { f: x => x - 3 + Math.sin(3 ** 2), interval: '(3, 5)' },
  { f: x => 4, interval: '[6, 8)' },
], 'red'))
fig.setInDocument()

const M = new Methods(fig)
M.bisection(fig.functions.get('F0'), [1.8, 3.8], 0.001)

const f = new Function(x => Math.sin(x)+0.8, 'red')
const df = new Function(x => Math.cos(x), 'orange')
const ddf = new Function(x => -Math.sin(x), 'blue')
fig.addFunction(f, 'f')
fig.addFunction(df, 'df')
fig.addFunction(ddf, 'ddf')
M.newton([3.25, 4.5], f, df, ddf, {precision: 1e-12, iterDelay: 2000})
```
