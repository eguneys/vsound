import { createSignal, createMemo, mapArray, createEffect } from 'solid-js'
import { read, write, owrite } from './play'
import { make_ref, make_drag } from './make_sticky'
import { Vec2 } from './vec2'
import { make_position } from './make_util'


function make_hooks(sound: Sound) {
  return { 
    on_hover() {
    },
    on_up(decay) {
    },
    on_click(click: [number, number]) {
      sound.pitch.find_on_drag_start(Vec2.make(...click))
    },
    find_inject_drag() {
    },
    on_drag_update(decay) {
      sound.pitch.find_on_drag_start(decay.drag_move)
    },
    find_on_drag_start(drag) {
      return sound.pitch.find_on_drag_start(Vec2.make(...drag.move))
    }
  }
}


export default class Sound {


  onScroll() {
    this.refs.forEach(_ => _.$clear_bounds())
  }


  constructor($element) {

    this.refs = []
    this.speed = make_value(9, 0, 13)
    this.loop = make_loop()

    this.pitch = make_pitch(this)
  }
}

const make_pitch_bar = (sound: Sound, y: number) => {

  let _y = createSignal(y)

  let m_style = createMemo(() => ({
    height: `${read(_y)*100}%`
  }))

  return {
    set y(y: value) {
      owrite(_y, y)
    },

    get style() {
      return m_style()
    }

  }
}

const make_pitch = (sound: Sound) => {

  let ref = make_ref()
  sound.refs.push(ref)
  let drag
 
 
  createEffect(() => {
    let $ref = ref.$ref
    if (!drag && $ref) {
      drag = make_drag(make_hooks(sound), $ref)
      sound.refs.push(drag)
    }
  })

  let drag_target = make_position(0, 0)

  function set_y(n: number, y: number) {
    m_bars()[n].y = y
  }

  let _bars = createSignal([...Array(32).keys()].map(_ => 0.5))

  let m_bars = createMemo(mapArray(_bars[0], _ => make_pitch_bar(sound, _)))

  return {
    get bars() {
      return m_bars()
    },
    find_on_drag_start(drag: Vec2) {
      let res = ref.get_normal_at_abs_pos(drag)
      if (0 <= res.x && res.x <= 1 && 0 <= res.y && res.y <= 1.0) {
        let i = res.x * 32
        set_y(Math.floor(i), 1-res.y)
        return drag_target
      }
    },
    ref
  }

}

const make_loop = () => {

  let _mode = createSignal('stop')
  let _begin = createSignal(0)
  let _end = createSignal(0)

  return {
    change_mode() {
      owrite(_mode, this.mode)
    },
    get mode() {
      return read(_mode) === 'play' ? 'stop': 'play'
    },
    get begin() {
      return read(_begin)
    },
    set begin(v: number) {
      owrite(_begin, (v + 33) % 33)
    },
    get end() {
      return read(_end)
    },
    set end(v: number) {
      owrite(_end, (v + 33) % 33)
    }
  }
}


const make_value = (n: any, min: any, max: any) => {
  let _v = createSignal(n)
  return {
    get value() {
      return read(_v)
    },
    set value(v: any) {
      if (v === min || v === max) {
        return
      }
      owrite(_v, v)
    }
  }
}
