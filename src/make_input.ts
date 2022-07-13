import Input from './input'
import { loop } from './play'
import { keys_by_button0, keys_by_button1, keys_by_button2 } from './audio/buttons'


export function make_input(hooks: InputHooks) {

  let input = new Input().init()

  loop((dt: number, dt0: number) => {
    input.update(dt, dt0);


    [...keys_by_button0.keys()].forEach(key => {
      if (input.btnp(key)) {
        let bs = [keys_by_button0.get(key),
          keys_by_button1.get(key),
        keys_by_button2.get(key)]
        hooks.piano_bs(bs)
      }
    })


  })

}
