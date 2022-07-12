export const App = sound => props => {


  return (<vsound>
    <div class='box'>
      <label>Speed</label> <UpDownControl value={sound.speed.value} setValue={_ => sound.speed.value = _}/>

      <label>Loop</label> 
      <UpDownControl value={sound.loop.begin} setValue={_ => sound.loop.begin = _}/>
      <UpDownControl value={sound.loop.end} setValue={_ => sound.loop.end = _}/>
    </div>
      </vsound>)
}

const dformat = v => v < 10 ? `0${v}` : `${v}`

const UpDownControl = props => {


  const value = (value: number) => {
    props.setValue(props.value + value)
  }
  

  return (<div class='up-down'>
      <span onClick={_ => value(-1) } class='value-down'>{"<"}</span><span class='value'> {dformat(props.value)} </span> <span onClick={_ => value(+1) } class='value-up'>{">"}</span>
      </div>)
}
