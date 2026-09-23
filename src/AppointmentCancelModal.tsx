import { useEffect, useState } from 'react';
import { AlertTriangle, CalendarDays, X } from 'lucide-react';
import { cancelAppointmentAsCustomer, cancelAppointmentAsWorkshop } from './api';

export function AppointmentCancelModal({
  open,onClose,onDone,appointmentId,startsAt,mode,vehicle
}:{
  open:boolean;onClose:()=>void;onDone:()=>Promise<void>|void;appointmentId?:string|null;startsAt?:string|null;
  mode:'customer'|'workshop';vehicle?:string;
}){
  const [reason,setReason]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');

  useEffect(()=>{
    if(open){setReason('');setError('')}
  },[open,appointmentId]);

  if(!open||!appointmentId)return null;

  const submit=async(event:React.FormEvent)=>{
    event.preventDefault();
    setBusy(true);setError('');
    try{
      if(mode==='customer')await cancelAppointmentAsCustomer(appointmentId,reason||undefined);
      else await cancelAppointmentAsWorkshop(appointmentId,reason||undefined);
      await onDone();
      onClose();
    }catch(err){setError(err instanceof Error?err.message:'Termin konnte nicht storniert werden.')}
    finally{setBusy(false)}
  };

  return <div className="modal-backdrop" onMouseDown={onClose}>
    <section className="workflow-modal appointment-cancel-modal" onMouseDown={event=>event.stopPropagation()}>
      <header>
        <div className="modal-icon danger"><AlertTriangle/></div>
        <div><span>TERMIN STORNIEREN</span><h2>{vehicle||'Werkstatttermin'}</h2><small>{startsAt?new Date(startsAt).toLocaleString('de-DE',{dateStyle:'full',timeStyle:'short'}):''}</small></div>
        <button onClick={onClose} aria-label="Schließen"><X/></button>
      </header>
      <form onSubmit={submit}>
        <div className="cancel-warning"><CalendarDays/><div><b>{mode==='customer'?'Termin wirklich absagen?':'Termin wirklich stornieren?'}</b><p>{mode==='customer'?'Die Werkstatt wird sofort informiert. Innerhalb von 12 Stunden vor dem Termin ist eine Online-Stornierung nicht mehr möglich.':'Die Stornierung wird dem Kunden sofort angezeigt und als Benachrichtigung gesendet.'}</p></div></div>
        <label><span>Grund <small>optional</small></span><textarea rows={3} value={reason} onChange={event=>setReason(event.target.value)} placeholder={mode==='customer'?'z. B. Fahrzeugproblem hat sich erledigt':'z. B. kurzfristiger Werkstattausfall'}/></label>
        {error&&<div className="modal-error">{error}</div>}
        <div className="modal-actions"><button type="button" className="btn secondary" onClick={onClose}>Zurück</button><button className="btn danger-button" disabled={busy}>{busy?'Storniert …':'Termin verbindlich stornieren'}</button></div>
      </form>
    </section>
  </div>;
}
