
/*

V Sound v1.0.0 

MIT License

Copyright (c) 2022 eguneys

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
    
var VSound = (function () {
  'use strict';

  const pitch_mask = 0x0000000f;
  const octave_mask = 0x000000f0;
  const accidental_mask = 0x0000f000;
  function note_pitch(note) {
    return note & pitch_mask;
  }
  function note_octave(note) {
    return (note & octave_mask) >> 4;
  }
  function note_accidental(note) {
    return (note & accidental_mask) >> 12;
  }

  function make_adsr(a, d, s, r) {
    return {
      a,
      d,
      s,
      r
    };
  }
  /* C C# D D# E F F# G G# A A# B */

  const pitch_to_freq_index = [1, 1.5, 2, 2.5, 3, 4, 4.5, 5, 5.5, 6, 6.5, 7];
  /* https://github.com/jergason/notes-to-frequencies/blob/master/index.js */

  /* http://techlib.com/reference/musical_note_frequencies.htm#:~:text=Starting%20at%20any%20note%20the,be%20positive%2C%20negative%20or%20zero. */

  /* https://newt.phys.unsw.edu.au/jw/notes.html */

  function note_freq(note) {
    let octave = note_octave(note);
    let pitch = note_pitch(note);
    let accidental = note_accidental(note);

    if (accidental === 1) {
      pitch += 0.5;
    }

    let n = pitch_to_freq_index.indexOf(pitch);
    n += octave * 12;
    return 440 * Math.pow(2, (n - 57) / 12);
  }

  function ads(param, now, {
    a,
    d,
    s,
    r
  }, start, max) {
    a /= 1000;
    d /= 1000;
    r /= 1000;
    param.setValueAtTime(start, now);
    param.linearRampToValueAtTime(max, now + a);
    param.linearRampToValueAtTime(s, now + a + d);
    /* not needed ? */
    //param.setValueAtTime(s, now + a + d)
  }

  function r(param, now, {
    r
  }, min) {
    r /= 1000;
    param.cancelScheduledValues(now);
    param.linearRampToValueAtTime(min, now + (r || 0));
  }

  class PlayerController {
    get context() {
      if (!this._context) {
        this._context = new AudioContext();
      }

      return this._context;
    }

    get currentTime() {
      return this.context.currentTime;
    }

    _gen_id = 0;

    get next_id() {
      return ++this._gen_id;
    }

    players = new Map();

    attack(synth, note, time = 0) {
      let {
        next_id
      } = this;
      this.players.set(next_id, new MidiPlayer(this.context)._set_data({
        synth,
        freq: note_freq(note)
      }).attack(time));
      return next_id;
    }

    release(id, time = 0) {
      let player = this.players.get(id);

      if (player) {
        player.release(time);
      }

      this.players.delete(id);
    }

  }

  class HasAudioAnalyser {
    get maxFilterFreq() {
      return this.context.sampleRate / 2;
    }

    constructor(context) {
      this.context = context;
    }

    attack(time = this.context.currentTime) {
      let {
        context
      } = this;
      this.gain = context.createGain();
      this.analyser = context.createAnalyser();
      this.gain.gain.setValueAtTime(1, time);
      this.gain.connect(this.analyser);
      this.analyser.connect(context.destination);

      this._attack(time);

      return this;
    }

    release(time = this.context.currentTime) {
      this._release(time);

      return this;
    }

  }

  function getOscillator(context, type) {
    return new OscillatorNode(context, {
      type
    });
  }

  class MidiPlayer extends HasAudioAnalyser {
    _set_data(data) {
      this.data = data;
      return this;
    }

    _attack(now) {
      let {
        context,
        maxFilterFreq
      } = this;
      let out_gain = this.gain;
      let {
        freq,
        synth
      } = this.data;
      let {
        wave,
        volume,
        cutoff,
        cutoff_max,
        amplitude,
        filter_adsr,
        amp_adsr
      } = synth;
      let osc1 = getOscillator(context, wave);
      this.osc1 = osc1;
      let osc2 = getOscillator(context, wave);
      this.osc2 = osc2;
      let osc1_mix = new GainNode(context);
      osc1.connect(osc1_mix);
      let osc2_mix = new GainNode(context);
      osc2.connect(osc2_mix);
      osc1_mix.gain.setValueAtTime(0.5, now);
      osc2_mix.gain.setValueAtTime(0.5, now);
      osc2.detune.setValueAtTime(700, now);
      let filter = new BiquadFilterNode(context, {
        type: 'lowpass'
      });
      this.filter = filter;
      osc1_mix.connect(filter);
      osc2_mix.connect(filter);
      out_gain.gain.setValueAtTime(volume, now);
      let envelope = new GainNode(context);
      this.envelope = envelope;
      filter.connect(envelope);
      envelope.connect(out_gain);
      osc1.frequency.setValueAtTime(freq, now);
      osc2.frequency.setValueAtTime(freq, now);
      /* Syntorial */

      let _filter_adsr = { ...filter_adsr,
        s: cutoff * maxFilterFreq * 0.4 + filter_adsr.s * cutoff_max * maxFilterFreq * 0.6
      };
      ads(filter.frequency, now, _filter_adsr, cutoff * maxFilterFreq * 0.4, cutoff * maxFilterFreq * 0.4 + cutoff_max * maxFilterFreq * 0.6);
      ads(envelope.gain, now, amp_adsr, 0, amplitude * 0.5);
      osc1.start(now);
      osc2.start(now);
    }

    _release(now) {
      let {
        synth: {
          cutoff,
          amp_adsr,
          filter_adsr
        }
      } = this.data;
      let {
        a,
        d,
        r: _r
      } = amp_adsr;
      a /= 1000;
      d /= 1000;
      _r /= 1000;
      r(this.envelope.gain, now, amp_adsr, 0);
      r(this.filter.frequency, now, filter_adsr, cutoff * this.maxFilterFreq * 0.4);
      this.osc1.stop(now + a + d + _r);
      this.osc2.stop(now + a + d + _r);
    }

  }

  const waves = ['sine', 'sawtooth', 'triangle', 'square'];
  const vol_mask = 0x00000f00;
  const oct_mask = 0x000000f0;
  const wave_mask = 0x0000000f;
  function con_synth(synth) {
    let wave = synth & wave_mask;
    let octave = (synth & oct_mask) >> 4;
    let vol = (synth & vol_mask) >> 8;
    return [waves[wave], octave, vol];
  }

  function merge_notes(a, b) {
    return a.every((_, i) => i === 0 || _ === b[i]);
  }
  /*
   * vol, wave, note
   * []
   */


  function VSound(data) {
    let player = new PlayerController();
    data = data.map(data => {
      let [speed, ...rest] = data;
      let res = [];

      for (let i = 0; i < rest.length; i += 2) {
        let note = rest[i],
            [wave, oct, vol] = con_synth(rest[i + 1]);
        let synth = {
          wave: wave,
          volume: vol / 5,
          amplitude: 0.9,
          cutoff: 0.6,
          cutoff_max: 0.2,
          amp_adsr: make_adsr(2, 8, 0.2, 10),
          filter_adsr: make_adsr(0, 8, 0.2, 0)
        };
        res.push([synth, note, wave, oct, vol]);
      }

      return [speed, res];
    });
    return k => {
      let [speed, res] = data[k];
      let ttt = player.currentTime;
      let play_buffer = [];

      for (let i = 0; i < res.length; i++) {
        let duration = speed * 16 / 1000;

        if (play_buffer.includes(i)) {
          ttt += duration;
          continue;
        }

        let ri = res[i];
        let lookaheads = [[i + 1, i + 2, i + 3], [i + 1, i + 2], [i + 1]].map(lookahead => lookahead.filter(_ => _ < res.length).map(_ => res[_]));
        let note_duration = 1;

        if (lookaheads[0].length === 3 && lookaheads[0].every(_ => merge_notes(ri, _))) {
          note_duration = 4;
          play_buffer = [i + 1, i + 2, i + 3];
        } else if (lookaheads[1].length === 2 && lookaheads[1].every(_ => merge_notes(ri, _))) {
          note_duration = 3;
          play_buffer = [i + 1, i + 2];
        } else if (lookaheads[2].length === 1 && lookaheads[2].every(_ => merge_notes(ri, _))) {
          note_duration = 2;
          play_buffer = [i + 1];
        } else {
          play_buffer = [];
        }

        duration *= note_duration;
        let synth = ri[0],
            note = ri[1];
        let id = player.attack(synth, note, ttt);
        player.release(id, ttt + duration);
        ttt += duration;
      }
    };
  }

  return VSound;

})();