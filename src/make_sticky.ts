import { on, createEffect, createSignal, createMemo, mapArray } from 'solid-js'
import { Vec2 } from './vec2'

import { read, write, owrite } from './play'
import Mouse from './mouse'
import { loop, DragDecay } from './play'


export function make_ref() {

  let _$ref = createSignal()

  let _$clear_bounds = createSignal(undefined, { equals: false })

  let m_rect = createMemo(() => {
    read(_$clear_bounds)
    return read(_$ref)?.getBoundingClientRect()
  })

  let m_orig = createMemo(() => {
    let rect = m_rect()
    if (rect) {
      return Vec2.make(rect.x, rect.y)
    }
  })

  let m_size = createMemo(() => {
    let rect = m_rect()
    if (rect) {
      return Vec2.make(rect.width, rect.height)
    }
  })

  return {
    $clear_bounds() {
      owrite(_$clear_bounds)
    },
    get $ref() {
      return read(_$ref)
    },
    set $ref($ref: HTMLElement) {
      owrite(_$ref, $ref)
    },
    get rect() {
      return m_rect()
    },
    get_normal_at_abs_pos(vs: Vec2) {
      let size = m_size(),
        orig = m_orig()

      if (size && orig) {
        return vs.sub(orig).div(size)
      }
    }
  }

}


export function make_drag(hooks: DragHooks, $ref: HTMLElement) {

  let { 
    on_hover,
    on_up,
    on_click,
    find_inject_drag,
    on_drag_update,
    find_on_drag_start
  } = hooks



  let _drag_decay = createSignal()
  let m_drag_decay = createMemo(() => read(_drag_decay))

  let _update = createSignal([16, 16], { equals: false })
  let update = createMemo(() => read(_update))


  let mouse = new Mouse($ref).init()


  loop((dt, dt0) => {

    mouse.update(dt, dt0)
    owrite(_update, [dt, dt0])

    let { click, hover, drag, up } = mouse

    if (click) {
      on_click(click)
    }

    if (hover) {
      on_hover(hover)
    }

    if (up) {
      on_up()
    }


    if (drag && !!drag.move0) {
      if (!read(_drag_decay)) {
        let inject_drag = find_inject_drag()
        if (inject_drag) {
          owrite(_drag_decay, new DragDecay(drag, inject_drag.abs_pos, inject_drag))
        }
      }
    }

    if (drag && !drag.move0) {
      let res = find_on_drag_start(drag)
      if (res) {
        owrite(_drag_decay, new DragDecay(drag, res.vs, res))
      }
    }
  })

  createEffect(on(update, (dt, dt0) => {
    let decay = m_drag_decay()
    if (decay) {
      on_drag_update(decay)
      decay.target.lerp_vs(decay.move)
      if (decay.drop) {
        owrite(_drag_decay, undefined)
      }
    }
  }))


  return {
    $clear_bounds() {
      mouse.$clear_bounds()
    },
    get decay() {
      return m_drag_decay()
    }
  }
}
