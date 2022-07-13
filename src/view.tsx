import { onCleanup } from 'solid-js'

function unbindable(
  el: EventTarget,
  eventName: string,
  callback: EventListener,
  options?: AddEventListenerOptions
): Unbind {
  el.addEventListener(eventName, callback, options);
  return () => el.removeEventListener(eventName, callback, options);
}

export const App = sound => props => {

  let unbinds = [];

  unbinds.push(unbindable(document, 'scroll', () => sound.onScroll(), { capture: true, passive: true }));
  unbinds.push(unbindable(window, 'resize', () => sound.onScroll(), { passive: true }));

  onCleanup(() => unbinds.forEach(_ => _()));

  return (<vsound>
    <tabbar>
      <label onClick={_ => sound.tabbar.active = 'graph' } class={sound.tabbar.active === 'graph' ? 'active': ''}>graph</label>
      <label onClick={_ => sound.tabbar.active = 'list' } class={sound.tabbar.active === 'list' ? 'active' : ''}>list</label>
    </tabbar>
    <toolbar>
    <box>
      <label>speed</label> <UpDownControl value={sound.loop.speed} setValue={_ => sound.loop.speed = _}/>
      </box>
   <box>
      <label>loop</label> 
      <UpDownControl value={sound.loop.begin} setValue={_ => sound.loop.begin = _}/>
      <UpDownControl value={sound.loop.end} setValue={_ => sound.loop.end = _}/>
      <label onClick={_ => sound.loop.change_mode()} class='play'>{sound.loop.mode}</label>
    </box>
    </toolbar>
    <Dynamic sound={sound} component={comps[sound.tabbar.active]}/>
    </vsound>)
}

const PitchBar = props => {
let { sound } = props
  return (<pitch-bar ref={_ => setTimeout(() => sound.pitch.ref.$ref = _)}>
    <For each={sound.pitch.bars}>{ item =>
      <Bar item={item}/>
    }</For>
  </pitch-bar>)
}

const ListBar = props => {
  let { sound } = props
  return (<list-list>
    <div>
      <div class='group'>
      <label>octave</label><octave>
       <For each={[3,4,5]}>{ i =>
         <span onClick={_ => sound.controls.octave = i} class={sound.controls.octave===i ? 'active':''}>{i}</span>
       }</For>
      </octave>
      </div>
      <div class='group'>
      <label>volume</label>
      <volume>
       <For each={[0,1,2,3,4,5]}>{ i =>
         <span onClick={_ => sound.controls.volume = i} class={sound.controls.volume ===i ? 'active':''}>{i}</span>
       }</For>
      </volume>
      </div>
    </div>
    <list-bar>
    <For each={sound.pitch.bars}>{ item =>
      <LBar item={item}/>
    }</For>
    </list-bar>
  </list-list>)
}

const comps = {
  graph: PitchBar,
  list: ListBar
}

const LBar = props => {

 const or_dot = (_) => !!_ ? _ : '.'

  return <bar onClick={_ => props.item.select()} class={[props.item.klass, props.item.lklass].join(' ')}>
    <span>{or_dot(props.item.note)}</span>
    <span>{or_dot(props.item.octave)}</span>
    <span>{or_dot(props.item.wave)}</span>
    <span>{or_dot(props.item.volume)}</span>
    </bar>
}

const Bar = props => {

  return <bar class={props.item.klass} style={props.item.style}></bar>
}

const dformat = v => v < 10 ? `0${v}` : `${v}`

const UpDownControl = props => {


  const value = (value: number) => {
    props.setValue(props.value + value)
  }
  

  return (<div class='up-down'>
      <span onClick={_ => value(-1) } class='value-down'>{"<"}</span><span onClick={_ => value(+1) } class='value'> {dformat(props.value)} </span> <span onClick={_ => value(+1) } class='value-up'>{">"}</span>
      </div>)
}
