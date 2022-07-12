import './index.css'
import './theme.css'
import { render } from 'solid-js/web'

import Sound from './sound'
import { App } from './view'

export default function VCardTable(element: HTMLElement, options = {}) {

  let sound = new Sound()

  render(App(sound), element)

  return {
  }
}
