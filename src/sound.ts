import { onCleanup, on, createSignal, createMemo, mapArray, createEffect } from 'solid-js'
import { read, write, owrite } from './play'
import { make_ref, make_drag } from './make_sticky'
import { Vec2 } from './vec2'
import { make_position } from './make_util'
import { loop } from './play'
import { make_adsr, PlayerController } from './audio/player'
import { pianokey_pitch_octave } from './audio/piano'
import { make_note_po } from './audio/types'
import { index_white, index_black } from './audio/piano'
import { note_uci } from './audio/uci'
import { note_octave } from './audio/types'
import { make_input } from './make_input'
import { con_synth, synth_con } from './audio/export'


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
    on_drag_update(decay: Decay) {
      sound.pitch.find_on_drag_start(decay.drag_move)
    },
    find_on_drag_start(drag) {
      return sound.pitch.find_on_drag_start(Vec2.make(...drag.move))
    }
  }
}

function make_vhooks(sound: Sound) {
  return { 
    on_hover() {
    },
    on_up(decay) {
    },
    on_click(click: [number, number]) {
      sound.pitch.find_on_volume_start(Vec2.make(...click))
    },
    find_inject_drag() {
    },
    on_drag_update(decay) {
      sound.pitch.find_on_volume_start(decay.drag_move)
    },
    find_on_drag_start(drag) {
      return sound.pitch.find_on_volume_start(Vec2.make(...drag.move))
    }
  }
}

function make_input_hooks(sound: Sound) {
  return {
    piano_bs(bs: [Key, Key, Key]) {
      let key = bs[sound.controls.octave - 3]

      sound.pitch.press(key)
    }
  }
}

export default class Sound {


  onScroll() {
    this.refs.forEach(_ => _.$clear_bounds())
  }

  get overlay() {
    return read(this._overlay)
  }

  set overlay(overlay: Overlay) {
    owrite(this._overlay, overlay)
  }

  get i() {
    return read(this._i)
  }

  set i(i: number) {
    if (i >= 0 && i < this._loops.length) {
      owrite(this._i, i)
    }
  }

  get loop() {
    return this.m_loop()
  }

  get pitch() {
    return this.m_pitch()
  }


  get export() {
    return this._loops.map(_ => _.pitch.export).filter(_ => _.length > 1)
  }

  constructor($element) {

    this._i = createSignal(0)
    this._overlay = createSignal()
    this.input = make_input(make_input_hooks(this))

    this.refs = []
    this.controls = make_controls(this)
    this.tabbar = make_tabbar(this)
    this.player = make_player(this)

    this._loops = [...Array(24).keys()].map(i => ({
      loop: make_loop(this, i),
      pitch: make_pitch(this, i)
    }))

    let m_loops = createMemo(() => this._loops[read(this._i)])

    this.m_loop = createMemo(() => m_loops().loop)
    this.m_pitch = createMemo(() => m_loops().pitch)

    createEffect(() => {
      let cursor = this.loop.cursor
      this.pitch.cursor = cursor
      this.player.cursor = cursor
    })



    let sound = this

    let vref = make_ref()
    sound.refs.push(vref)
    let vdrag

    createEffect(() => {
      let $ref = vref.$ref
      if ($ref) {
        if (vdrag) {
          sound.refs.splice(sound.refs.indexOf(vdrag), 1)
        }
        vdrag = make_drag(make_vhooks(sound), $ref)
        sound.refs.push(vdrag)
      }
    })

    let ref = make_ref()
    sound.refs.push(ref)
    let drag

    createEffect(() => {
      let $ref = ref.$ref
      if ($ref) {
        if (drag) {
          sound.refs.splice(sound.refs.indexOf(drag), 1)
        }
        drag = make_drag(make_hooks(sound), $ref)
        sound.refs.push(drag)
      }
    })



    this.pitch_ref = ref
    this.pitch_vref = vref


  }
}


const make_controls = (sound: Sound) => {

  let _octave = createSignal(4)
  let _volume = createSignal(5)
  let _wave = createSignal('sine')

  return {
    get wave() {
      return read(_wave)
    },
    set wave(wave: string) {
      owrite(_wave, wave)
      if (sound.input.btn('Shift', true)) {
        sound.pitch.set_all_waves(wave)
      }
    },
    set volume(volume: number) {
      owrite(_volume, volume)
      if (sound.input.btn('Shift', true)) {
        sound.pitch.set_all_volume(volume)
      }
    },
    get volume() {
      return read(_volume)
    },
    set octave(octave: number) {
      owrite(_octave,  octave)
    },
    get octave() {
      return read(_octave)
    }
  }
}

const make_tabbar = (sound: Sound) => {

  let _active = createSignal('graph')

  return {
    set active(active: string) {
      owrite(_active, active)
    },
    get active() {
      return read(_active)
    }
  }
}

function merge_notes(a: PitchBar, b: PitchBar) {
  return a.note_value === b.note_value && a.volume === b.volume && a.wave === b.wave
}

const make_player = (sound: Sound) => {

  let player = new PlayerController()
  let play_buffer = []

  return {
    set cursor(cursor: number) {
      if (cursor !== undefined && !play_buffer.includes(cursor)) {
        let cbar = sound.pitch.bars[cursor]
        let { synth } = sound.pitch.bars[cursor]
        let duration = sound.loop.speed * 16 / 1000
        let note = sound.pitch.bars[cursor].note_value
        let lookaheads = [
          [cursor + 1, cursor + 2, cursor + 3],
          [cursor + 1, cursor + 2],
          [cursor + 1]
        ].map(lookahead =>
              lookahead.filter(_ => _ < 32)
              .map(_ => sound.pitch.bars[_]))

        let note_duration = 1

        if (lookaheads[0].length === 3 &&
            lookaheads[0].every(_ => merge_notes(cbar, _))) {
            note_duration = 4
            play_buffer = [cursor + 1, cursor + 2, cursor + 3]
        } else if (lookaheads[1].length === 2 &&
                   lookaheads[1].every(_ => merge_notes(cbar, _))) {
            note_duration = 3
            play_buffer = [cursor + 1, cursor + 2]
        } else if (lookaheads[2].length === 1 &&
                   lookaheads[2].every(_ => merge_notes(cbar, _))) {
            note_duration = 2
            play_buffer = [cursor + 1]
        } else {
          play_buffer = []
        }

        duration *= note_duration
        let i = player.attack(synth, note, player.currentTime)
        player.release(i, player.currentTime + duration)

      }
    }
  }
}

const y_key = [...Array(4).keys()].flatMap(octave => [
  index_white(0 + octave * 7),
  index_black(0 + octave * 5),
  index_white(1 + octave * 7),
  index_black(1 + octave * 5),
  index_white(2 + octave * 7),
  index_white(3 + octave * 7),
  index_black(2 + octave * 5),
  index_white(4 + octave * 7),
  index_black(3 + octave * 5),
  index_white(5 + octave * 7),
  index_black(4 + octave * 5),
  index_white(6 + octave * 7)
])

const volume_klass = ['zero', 'one', 'two', 'three', 'four', 'five']
const make_pitch_bar = (sound: Sound, edit_cursor: Signal<any>, i: number, y: number) => {

  let _wave = createSignal('triangle')
  let _volume = createSignal(0)
  let _y = createSignal(y)
  let _hi = createSignal(false)

  let m_wave = createMemo(() => read(_wave))
  let m_volume = createMemo(() => read(_volume))
  let m_y = createMemo(() => Math.floor(read(_y) * 48))
  let m_key = createMemo(() => y_key[m_y()])

  let m_note = createMemo(() => make_note_po(pianokey_pitch_octave(m_key()), 2))

  let m_style = createMemo(() => ({
    height: `${read(_y)*100}%`
  }))

  let m_klass = createMemo(() => [
    read(_hi) ? 'hi': ''
  ].join(' '))

  let m_lklass = createMemo(() => [
    edit_cursor() === i ? 'edit': ''
  ].join(' '))


  let m_vstyle = createMemo(() => ({
    height: `${read(_volume)/5*100}%`
  }))

  let m_vklass = createMemo(() => [
    volume_klass[read(_volume)]
  ].join(' '))


  let m_synth = createMemo(() => ({
    wave: m_wave(),
    volume: m_volume()/5,
    amplitude: 0.9,
    cutoff: 0.6,
    cutoff_max: 0.2,
    amp_adsr: make_adsr(2, 8, 0.2, 10),
    filter_adsr: make_adsr(0, 8, 0.2, 0)
  }))

  return {
    get export() {
      return [this.note_value, synth_con(this.volume, this.octave, read(_wave)), this.volume]
    },
    get synth() {
      return m_synth()
    },
    set volume(volume: Volume) {
      owrite(_volume, volume)
    },
    set wave(wave: Wave) {
      owrite(_wave, wave)
    },
    get wave() {
      return read(_wave).slice(0, 3)
    },
    set piano_key(key: PianoKey) {
      owrite(_y, y_key.indexOf(key)/ 48)
      owrite(_volume, sound.controls.volume)
      owrite(_wave, sound.controls.wave)
    },
    get note_value() {
      return m_note()
    },
    get note() {
      return note_uci(m_note())
    },
    get volume() {
      return read(_volume)
    },
    get octave() {
      return note_octave(m_note())
    },
    get lklass() {
      return m_lklass()
    },
    set hi(v: boolean) {
      owrite(_hi, v)
    },
    set vy(y: value) {
      y = Math.round(y * 5)
      owrite(_volume, y)
    },
    set y(y: value) {
      y = Math.floor(y * 48) / 48
      owrite(_y, y)
      owrite(_volume, sound.controls.volume)
      owrite(_wave, sound.controls.wave)
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
    get vklass() {
      return m_vklass()
    },
    get vstyle() {
      return m_vstyle()
    },
    select() {
      sound.pitch.select(i)
    }

  }
}

function trim_end_export(e: Array<BarExport>) {
  let res = []

  let i = e.length - 1
  for (; i >= 0; i--) {
    if (e[i][2] !== 0) {
      break
    }
  }

  for (; i >= 0; i--) {
    res.unshift(e[i].slice(0, 2))
  }

  return res
}

const make_pitch = (sound: Sound) => {

  let drag_target = make_position(0, 0)

  let _edit_cursor = createSignal()
  let m_edit_cursor = createMemo(() => read(_edit_cursor))

  function set_y(n: number, y: number) {
    m_bars()[n].y = y
  }

  function set_vy(n: number, y: number) {
    m_bars()[n].vy = y
  }

  let _bars = createSignal([...Array(32).keys()].map(_ => 0.5))

  let m_bars = createMemo(mapArray(_bars[0], (_, i) => make_pitch_bar(sound, m_edit_cursor, i(), _)))

  return {
    get export() {
      let begin = sound.loop.begin
      let end = sound.loop.end
      if (begin === end) {
        begin = 0
        end = 32
      }
      let bars = m_bars().slice(begin, end+1).map(_ => _.export)

      bars = trim_end_export(bars)
      return [sound.loop.speed, ...bars.flat()]
    },
    set_all_waves(wave: string) {
      m_bars().forEach(_ => _.wave = wave)
    },
    set_all_volume(volume: string) {
      m_bars().forEach(_ => _.volume = volume)
    },
    press(key: PianoKey) {

      if (!m_edit_cursor()) {
        owrite(_edit_cursor, 0)
      }

      m_bars()[m_edit_cursor()].piano_key = key
      owrite(_edit_cursor, (m_edit_cursor() + 1) % 32)
    },
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
    find_on_volume_start(drag: Vec2) {
      let res = sound.pitch_vref.get_normal_at_abs_pos(drag)
      if (0 <= res.x && res.x <= 1 && 0 <= res.y && res.y <= 1.0) {
        let i = res.x * 32
        set_vy(Math.floor(i), 1-res.y)
        return drag_target
      }
    },
    find_on_drag_start(drag: Vec2) {
      let res = sound.pitch_ref.get_normal_at_abs_pos(drag)
      if (0 <= res.x && res.x <= 1 && 0 <= res.y && res.y <= 1.0) {
        let i = res.x * 32
        set_y(Math.floor(i), 1-res.y)
        return drag_target
      }
    }
  }

}

const make_loop = (sound: Sound, i: number) => {

  let _speed = createSignal(9)

  let _mode = createSignal('stop')
  let _begin = createSignal(0)
  let _end = createSignal(0)

  let _cursor = createSignal()


  let m_one_duration = createMemo(() => {
    let i = read(_speed)

    return i * 16 
  })

  createEffect(on(() => [sound.i, _mode[0]()], ([_i, value]) => {
    if (i === _i && value === 'play') {

      owrite(_cursor, read(_begin))
      let i = 0
      let cancel = loop((dt: number, dt0: number) => {
        i += dt

        let begin = read(_begin)
        let end = read(_end)
        let dur = m_one_duration()

        if (i > dur) {
          i -= dur
          owrite(_cursor, _ => {
            let res = (_ + 1) % 32
            if (begin !== end && res > end || (res === 31 && end === 31)) {
              res = begin
            }
            return res
          })
        }
      })

      onCleanup(() => {
        owrite(_cursor, undefined)
        cancel()
      })
    }
  }))

  return {
    set speed(speed: number) {
      if (speed < 1 || speed > 20) {
        return
      }
      owrite(_speed, speed)
    },
    get cursor() {
      return read(_cursor)
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
      owrite(_begin, (v + 32) % 32)
    },
    get end() {
      return read(_end)
    },
    set end(v: number) {
      owrite(_end, (v + 32) % 32)
    }
  }
}
