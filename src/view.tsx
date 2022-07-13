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
    <toolbar>
    <box>
      <label>speed</label> <UpDownControl value={sound.speed.value} setValue={_ => sound.speed.value = _}/>
      </box>
   <box>
      <label>loop</label> 
      <UpDownControl value={sound.loop.begin} setValue={_ => sound.loop.begin = _}/>
      <UpDownControl value={sound.loop.end} setValue={_ => sound.loop.end = _}/>
      <label onClick={_ => sound.loop.change_mode()} class='play'>{sound.loop.mode}</label>
    </box>
    </toolbar>
    <pitch-bar ref={_ => setTimeout(() => sound.pitch.ref.$ref = _)}>
      <For each={sound.pitch.bars}>{ item =>
        <Bar style={item.style}/>
      }</For>
    </pitch-bar>
      </vsound>)
}


const Bar = props => {

  return <bar style={props.style}></bar>
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
