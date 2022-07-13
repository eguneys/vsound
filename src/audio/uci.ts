import { note_pitch, note_octave, note_duration, note_accidental } from './types'
let pitch_ucis = ['', 'c', 'd', 'e', 'f', 'g', 'a', 'b']

export function note_uci(note: Note) {
  let pitch = note_pitch(note),
    octave = note_octave(note),
    duration = note_duration(note),
    accidental = note_accidental(note)

  return [pitch_ucis[pitch], 
    !!accidental ? '#' : ''].join('')
}

