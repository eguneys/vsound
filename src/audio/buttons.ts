import { pianokey_pitch_octave, black_key, white_key, black_c4, black_c5, white_c4, white_c5 } from './piano'
import { white_c3, black_c3, white_c6, black_c6 } from './piano'

let btn_accidentals = ['i', 'o', 'p','[',']']
let btn_accidentals_octave_up = ['w', 'e', 'r','t','y']
let btn_pitches = [' ', 'j', 'k', 'l', ';', '\'', '\\']
let btn_pitches_octave_up = ['a', 's', 'd', 'f', 'g', 'h']
let btn_rest = 'Backspace'

export let btn_pitches_all = [...btn_accidentals, ...btn_accidentals_octave_up, ...btn_pitches, ...btn_pitches_octave_up]

let btn_reset = 'Enter'
let btn_play = '*'

let btn_tie = 't'

export const octaves_for_buttons = [
  [white_c3, white_c4, black_c3, black_c4],
  [white_c4, white_c5, black_c4, black_c5],
  [white_c5, white_c6, black_c5, black_c6]]


export const keys_by_button0: Map<string, PianoKey> = new Map(btn_pitches_all.map(_ => [_, btn_pianokey(_, 0)!]))
export const keys_by_button1: Map<string, PianoKey> = new Map(btn_pitches_all.map(_ => [_, btn_pianokey(_, 1)!]))
export const keys_by_button2: Map<string, PianoKey> = new Map(btn_pitches_all.map(_ => [_, btn_pianokey(_, 2)!]))

export function btn_pianokey(key: string, octave_ref: number = 1): PianoKey | undefined {

  let [white_c4, white_c5, black_c4, black_c5] = octaves_for_buttons[octave_ref]

  let pitch = btn_pitches.indexOf(key) + 1
  if (pitch > 0) {
    return white_key(white_c4, pitch - 1)
  }
  pitch = btn_pitches_octave_up.indexOf(key) + 1
  if (pitch > 0) {
    return white_key(white_c5, pitch - 1)
  }

  pitch = btn_accidentals.indexOf(key) + 1
  if (pitch > 0) {
    return black_key(black_c4, pitch - 1)
  }
  pitch = btn_accidentals_octave_up.indexOf(key) + 1
  if (pitch > 0) {
    return black_key(black_c5, pitch - 1)
  }
}


