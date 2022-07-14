const waves = ['sine', 'sawtooth', 'triangle', 'square']

const vol_mask =  0x00000f00
const oct_mask =  0x000000f0
const wave_mask = 0x0000000f
export function synth_con(vol: number, octave: number, wave: string) {
  return waves.indexOf(wave) | (octave << 4) | (vol << 8)
}

export function con_synth(synth: number) {
  let wave = synth & wave_mask
  let octave = (synth & oct_mask) >> 4
  let vol = (synth & vol_mask) >> 8
  return [waves[wave], octave, vol]
}
