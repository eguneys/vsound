import { createSignal } from 'solid-js'
import { read, write, owrite } from './play'


export default class Sound {

  constructor() {

    this.speed = make_value(9, 0, 13)
    this.loop = make_loop()
  }
}

const make_loop = () => {

  let _begin = createSignal(0)
  let _end = createSignal(0)

  return {
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
