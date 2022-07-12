import { nodeResolve } from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'

//import typescript from '@rollup/plugin-typescript'
import babel from '@rollup/plugin-babel'
import css from 'rollup-plugin-import-css'
import copy from 'rollup-plugin-copy'

import htmlTemplate from 'rollup-plugin-generate-html-template'
import serve from 'rollup-plugin-serve'
import livereload from 'rollup-plugin-livereload'

import { string } from 'rollup-plugin-string'

let extensions = ['.ts', '.tsx']

export default args => {
  let prod = args['config-prod']

  return {
    input: 'src/main.ts',
    output: {
      format: 'iife',
      name: 'VSound',
      dir: 'dist',
      ...(prod ? {
       // format: 'es'
      } : { sourcemap: true })
    },
    watch: {
      clearScreen: true
    },
    plugins: [
      nodeResolve({ extensions, browser: true }),
      commonjs(),
      babel({ extensions, babelHelpers: 'bundled' }),
      css({minify: prod }),
      copy({ targets: [{ src: 'assets', dest: 'dist' }], copyOnce: true}),
      string({
        include: 'src/pls/*.pl'
      }),
      htmlTemplate({
        template: 'src/index.html',
        target: 'index.html',
        /* https://github.com/bengsfort/rollup-plugin-generate-html-template/issues/12 */
        //prefix: '/'
      }),
      ...(prod? [] : [
        serve({ contentBase: 'dist', port: 3000, historyApiFallback: true }),
        livereload({ watch: 'dist', port: 8080 })
      ])
    ]

  }
}
