import { make_adsr, PlayerController } from './player'
import { con_synth } from './export'

function merge_notes(a: any, b: any) {
  return a.every((_, i) => i === 0 || _ === b[i])
}

/*
 * vol, wave, note
 * []
 */
export default function VSound(data: Array<any>) {

  let player = new PlayerController()

  data = data.map(data => {
    let [speed, ...rest] = data
    let res = []
    for (let i = 0; i < rest.length; i+=2) {
      let note = rest[i],
        [wave, oct, vol] = con_synth(rest[i+1])

      let synth = {
        wave: wave,
        volume: vol/5,
        amplitude: 0.9,
        cutoff: 0.6,
        cutoff_max: 0.2,
        amp_adsr: make_adsr(2, 8, 0.2, 10),
        filter_adsr: make_adsr(0, 8, 0.2, 0)
      }

      res.push([synth, note, wave, oct, vol])
    }
    return [speed, res]
  })

  return (k: number) => {
    let [speed, res] = data[k]

    let ttt = player.currentTime
    let play_buffer = []
    for (let i = 0; i < res.length; i++) {

      let duration = speed * 16 / 1000
      if (play_buffer.includes(i)) {
        ttt += duration
        continue
      }
      let ri = res[i]

      let lookaheads = [
        [i + 1, i + 2, i + 3],
        [i + 1, i + 2],
        [i + 1]]
        .map(lookahead =>
             lookahead.filter(_ => _ < res.length)
             .map(_ => res[_]))


        let note_duration = 1

        if (lookaheads[0].length === 3 &&
            lookaheads[0].every(_ => merge_notes(ri, _))) {
            note_duration = 4
            play_buffer = [i + 1, i + 2, i + 3]
        } else if (lookaheads[1].length === 2 &&
                   lookaheads[1].every(_ => merge_notes(ri, _))) {
            note_duration = 3
            play_buffer = [i + 1, i+ 2]
        } else if (lookaheads[2].length === 1 &&
                   lookaheads[2].every(_ => merge_notes(ri, _))) {
            note_duration = 2
            play_buffer = [i + 1]
        } else {
          play_buffer = []
        }

        duration *= note_duration

        let synth = ri[0],
          note = ri[1]

        let id = player.attack(synth, note, ttt)
        player.release(id, ttt + duration)

        ttt += duration
    }
  }
}
