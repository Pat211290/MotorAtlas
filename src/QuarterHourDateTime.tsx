import { useEffect, useMemo, useState } from 'react';

function localDateValue(date:Date){
  const year=date.getFullYear();
  const month=String(date.getMonth()+1).padStart(2,'0');
  const day=String(date.getDate()).padStart(2,'0');
  return `${year}-${month}-${day}`;
}

export function QuarterHourDateTime({
  value,onChange,required=false,disallowPast=true
}:{
  value:string;
  onChange:(value:string)=>void;
  required?:boolean;
  disallowPast?:boolean;
}){
  const [date,setDate]=useState(value?.slice(0,10)??'');
  const [time,setTime]=useState(value?.slice(11,16)??'');
  const [now,setNow]=useState(()=>new Date());

  useEffect(()=>{
    setDate(value?.slice(0,10)??'');
    setTime(value?.slice(11,16)??'');
  },[value]);

  useEffect(()=>{
    if(!disallowPast)return;
    const timer=window.setInterval(()=>setNow(new Date()),30_000);
    return()=>window.clearInterval(timer);
  },[disallowPast]);

  const today=localDateValue(now);
  const times=useMemo(()=>{
    const result:string[]=[];
    for(let hour=0;hour<24;hour++){
      for(const minute of [0,15,30,45]){
        const slot=String(hour).padStart(2,'0')+':'+String(minute).padStart(2,'0');
        if(disallowPast&&date===today){
          const slotDate=new Date(`${date}T${slot}:00`);
          if(slotDate.getTime()<=now.getTime())continue;
        }
        result.push(slot);
      }
    }
    return result;
  },[date,disallowPast,now,today]);

  const update=(nextDate:string,nextTime:string)=>{
    let safeTime=nextTime;
    if(disallowPast&&nextDate){
      const candidate=nextTime?new Date(`${nextDate}T${nextTime}:00`):null;
      if(nextDate<today||(candidate&&candidate.getTime()<=now.getTime()))safeTime='';
    }
    setDate(nextDate);
    setTime(safeTime);
    onChange(nextDate&&safeTime?`${nextDate}T${safeTime}`:'');
  };

  return <div className="quarter-datetime">
    <input
      type="date"
      min={disallowPast?today:undefined}
      value={date}
      onChange={event=>update(event.target.value,time)}
      required={required}
      aria-label="Datum"
    />
    <select
      value={times.includes(time)?time:''}
      onChange={event=>update(date,event.target.value)}
      required={required}
      aria-label="Uhrzeit"
      disabled={!date||Boolean(disallowPast&&date<today)}
    >
      <option value="">{date===today&&disallowPast?'Nächste Uhrzeit wählen …':'Uhrzeit …'}</option>
      {times.map(slot=><option key={slot} value={slot}>{slot} Uhr</option>)}
    </select>
  </div>;
}
