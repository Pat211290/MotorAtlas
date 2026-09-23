import { useMemo, useState } from 'react';

export function QuarterHourDateTime({
  value,onChange,required=false
}:{
  value:string;
  onChange:(value:string)=>void;
  required?:boolean;
}){
  const initialDate=value?.slice(0,10)??'';
  const initialTime=value?.slice(11,16)??'';
  const [date,setDate]=useState(initialDate);
  const [time,setTime]=useState(initialTime);

  const times=useMemo(()=>{
    const result:string[]=[];
    for(let hour=0;hour<24;hour++){
      for(const minute of [0,15,30,45]){
        result.push(String(hour).padStart(2,'0')+':'+String(minute).padStart(2,'0'));
      }
    }
    return result;
  },[]);

  const update=(nextDate:string,nextTime:string)=>{
    setDate(nextDate);setTime(nextTime);
    onChange(nextDate&&nextTime?`${nextDate}T${nextTime}`:'');
  };

  return <div className="quarter-datetime">
    <input
      type="date"
      value={date}
      onChange={event=>update(event.target.value,time)}
      required={required}
      aria-label="Datum"
    />
    <select
      value={time}
      onChange={event=>update(date,event.target.value)}
      required={required}
      aria-label="Uhrzeit"
    >
      <option value="">Uhrzeit …</option>
      {times.map(slot=><option key={slot} value={slot}>{slot} Uhr</option>)}
    </select>
  </div>;
}
