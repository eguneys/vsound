import './index.css'
import './theme.css'
import { render } from 'solid-js/web'

import Sound from './sound'
import { App } from './view'

export default function VSound(element: HTMLElement, options = {}) {

  let sound = new Sound(element)

  render(App(sound), element)

  return {
  }
}
