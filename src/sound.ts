import { onCleanup, on, createSignal, createMemo, mapArray, createEffect } from 'solid-js'
import { read, write, owrite } from './play'
import { make_ref, make_drag } from './make_sticky'
import { Vec2 } from './vec2'
import { make_position } from './make_util'
import { loop } from './play'
import { make_adsr, PlayerController } from './audio/player'
import { pianokey_pitch_octave } from './audio/piano'
import { make_note_po } from './audio/types'
import { white_c5, white_key } from './audio/piano'


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
    this.tabbar = make_tabbar(this)
    this.player = make_player(this)
    this.pitch = make_pitch(this)
    this.loop = make_loop(this)
  }
}

const make_tabbar = (sound: Sound) => {

  let _active = createSignal('list')

  return {
    set active(active: string) {
      owrite(_active, active)
    },
    get active() {
      return read(_active)
    }
  }
}

const make_player = (sound: Sound) => {

  let synth = {
    volume: 1,
    amplitude: 0.7,
    cutoff: 0.6,
    cutoff_max: 0.2,
    amp_adsr: make_adsr(2, 8, 0.2, 10),
    filter_adsr: make_adsr(0, 8, 0.2, 0)
  }

  let player = new PlayerController(synth)


  function index_to_key(index: number) {
    let pitch = index + 1
    return white_key(white_c5, pitch - 1)
  }

  return {
    set cursor(cursor: number) {
      if (cursor) {
        let duration = sound.loop.speed * 16 / 1000
        let index = Math.floor(sound.pitch.bars[cursor].y * 48)

        let key = index_to_key(index)
        let po = pianokey_pitch_octave(key)
        let note = make_note_po(po, 2)

        let i = player.attack(note, player.currentTime)
        player.release(i, player.currentTime + duration)

      }
    }
  }
}

const make_pitch_bar = (sound: Sound, edit_cursor: Signal<any>, i: number, y: number) => {

  let _y = createSignal(y)
  let _hi = createSignal(false)

  let m_style = createMemo(() => ({
    height: `${read(_y)*100}%`
  }))

  let m_klass = createMemo(() => [
    read(_hi) ? 'hi': ''
  ].join(' '))

  let m_lklass = createMemo(() => [
    edit_cursor() === i ? 'edit': ''
  ].join(' '))

  return {
    get lklass() {
      return m_lklass()
    },
    set hi(v: boolean) {
      owrite(_hi, v)
    },
    set y(y: value) {
      y = Math.floor(y * 48) / 48
      owrite(_y, y)
    },
    get y() {
      return read(_y)
    },
    get klass() {
      return m_klass()
    },
    get style() {
      return m_style()
    },
    select() {
      sound.pitch.select(i)
    }

  }
}

const make_pitch = (sound: Sound) => {

  let ref = make_ref()
  sound.refs.push(ref)
  let drag
 
 
  let _edit_cursor = createSignal()
  let m_edit_cursor = createMemo(() => read(_edit_cursor))

  createEffect(() => {
    let $ref = ref.$ref
    if ($ref) {
      if (drag) {
        sound.refs.splice(sound.refs.indexOf(drag), 1)
      }
      drag = make_drag(make_hooks(sound), $ref)
      sound.refs.push(drag)
      console.log(sound.refs)
    }
  })

  let drag_target = make_position(0, 0)

  function set_y(n: number, y: number) {
    m_bars()[n].y = y
  }

  let _bars = createSignal([...Array(32).keys()].map(_ => 0.5))

  let m_bars = createMemo(mapArray(_bars[0], (_, i) => make_pitch_bar(sound, m_edit_cursor, i(), _)))

  return {
    get edit_cursor() {
      return read(_edit_cursor)
    },
    select(i: number) {
      owrite(_edit_cursor, i)
    },
    set cursor(cursor: number | undefined) {
      m_bars().forEach((bar, i) => bar.hi = cursor === i)
    },
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

const make_loop = (sound: Sound) => {

  let _speed = createSignal(9)

  let _mode = createSignal('stop')
  let _begin = createSignal(0)
  let _end = createSignal(0)

  let _cursor = createSignal()


  let m_one_duration = createMemo(() => {
    let i = read(_speed)

    return i * 16 
  })

  createEffect(on(_mode[0], (value) => {
    if (value === 'play') {

      owrite(_cursor, read(_begin))
      let i = 0
      let cancel = loop((dt: number, dt0: number) => {
        i += dt

        let dur = m_one_duration()

        if (i > dur) {
          i -= dur
          owrite(_cursor, _ => (_ + 1) % 32)
        }
      })

      onCleanup(() => {
        owrite(_cursor, undefined)
        cancel()
      })
    }
  }))

  createEffect(() => {
    let cursor = read(_cursor)
    sound.pitch.cursor = cursor
    sound.player.cursor = cursor
  })
  return {
    set speed(speed: number) {
      if (speed < 1 || speed > 20) {
        return
      }
      owrite(_speed, speed)
    },
    get speed() {
      return read(_speed)
    },
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
