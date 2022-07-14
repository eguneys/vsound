import { createSignal, onCleanup } from 'solid-js'
import audiolib_code from '../lib/vsound.js'

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

  return (<vsound onClick={_ => sound.overlay = undefined}>
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
    <box>
      <label  onClick={_ => { _.stopPropagation(); sound.overlay=sound.overlay === 'export' ? undefined : 'export'}} class='export'>export</label>
      <label onClick={_ => { _.stopPropagation(); sound.overlay=sound.overlay === 'help' ? undefined : 'help' }} class='help'>help</label>
    </box>
    <box class='wave'>
      <label>wave</label>
      <For each={['sine','square','triangle','sawtooth']}>{ i =>
         <span onClick={_ => sound.controls.wave = i} class={sound.controls.wave===i ? 'active':''}>{i.slice(0, 3)}</span>
      }</For>
    </box>
    </toolbar>
    <Dynamic sound={sound} component={comps[sound.tabbar.active]}/>
    <statusbar>
      <span>&nbsp</span>
    </statusbar>
    <Show when={sound.overlay}>{value => 
    <overlay onClick={e => e.stopPropagation()}>
      <Dynamic sound={sound} component={overlays[value]}/>
    </overlay>
    }</Show>
    </vsound>)
}


const Export = props => {
  let data_res = `let data = ${JSON.stringify(props.sound.pitch.export)}`
  return (<export>
   <h2> Export</h2>

    <p>
    <span> Data </span>
    <CopyCode>
    {data_res}
    </CopyCode>
    </p>

    <h3> Usage </h3>
    <p>
    <span>// Include Player Library</span><br/>
    <span>// Include Data</span><br/>
    <span>// Then use it like</span><br/>
      <CopyCode>
      let p = VSound(data); p(0) // play a sound by index
        </CopyCode>
    </p>
    <p>
    <span> Player Library </span>
    <CopyCode>
     {audiolib_code} 
    </CopyCode>
    </p>
      </export>)
}

const CopyCode = props => {
  let text = createSignal('copy')


  function copy() {

    navigator.clipboard.writeText(props.children).then(function() {

        text[1]('copied')

        setTimeout(() => {

            text[1]('copy')
            }, 1000)

        }, function(err) {
        console.error('Async: Could not copy text: ', err);
        }); 

  }

  return (<copycode>
  <span onClick={_ => copy() }>{text[0]()}</span>
  <code>
   {props.children}
   </code>
   </copycode>)
}

const Help = props => {
  return (<help>
   <h2> V Sound v{`${"__VERSION__"}`}</h2>
   <small>Designed to export sound effects with small size for use in JS13k.</small>
   <p>
     <span> Inspired by PICO-8 </span>
   </p>
   <h3> Shortcuts </h3>
   <p> 
     <span>Black keys:  i  o  p  [  ]</span>
     <span>White keys:  Space  j  k  l  ;  '  \</span>
     
     <span>Octave higher:</span>
     <span>Black keys:  w  e  r  t  y</span>
     <span>White keys:  a  s  d  f  g  h</span>
     <span> Hold shift and select a waveform or volume will set all notes </span>
   </p>
   <p>
     <small> Search "PICO 8 Sound Editor" if you get confused on how to use this. </small>
   </p>
   <footer>
     <i><small> Music tracker feature is planned to be made in future release.</small> </i>
   </footer>
      </help>)
}

const overlays = {
  'help': Help,
  'export': Export
}

const PitchBar = props => {
let { sound } = props
  return (<>
    <label class='pitch'>:pitch</label>
    <pitch-bar ref={_ => setTimeout(() => sound.pitch.ref.$ref = _)}>
       <For each={sound.pitch.bars}>{ item =>
         <Bar item={item}/>
       }</For>
    </pitch-bar>
    <label class='volume'>:volume</label>
    <volume-bar ref={_ => setTimeout(() => sound.pitch.vref.$ref = _)}>
       <For each={sound.pitch.bars}>{ item =>
         <VolumeBar item={item}/>
       }</For>
    </volume-bar>
  </>)
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

const VolumeBar = props => {
  return <vbar class={props.item.vklass} style={props.item.vstyle}></vbar>
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
