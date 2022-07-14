import { nodeResolve } from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import babel from '@rollup/plugin-babel'

let extensions = ['.ts', '.tsx']

export default args => {

  return {
    input: 'src/audio/main.ts',
    output: {
      format: 'iife',
      name: 'VSound',
      file: 'lib/vsound.min.js'
    },
    plugins: [
      nodeResolve({ extensions, browser: true }),
      commonjs(),
      babel({ extensions, babelHelpers: 'bundled' })
    ]
  }
}
