import { useState } from 'react';
import { CalendarDays, Car, UserRound, X } from 'lucide-react';
import { decideCustomerRequest, declineServiceRequest, proposeAppointment, type WorkshopServiceRequest } from './api';

export function CustomerAdmissionModal({
  open,onClose,onDone,request
}:{
  open:boolean;onClose:()=>void;onDone:()=>Promise<void>|void;request:any|null;
}){
  const [busy,setBusy]=useState(false);const [error,setError]=useState<string|null>(null);
  if(!open||!request)return null;
  const decide=async(decision:'accepted'|'rejected')=>{
    if(busy)return;setBusy(true);setError(null);
    try{await decideCustomerRequest(request.id,decision);await onDone();onClose()}
    catch(err){setError(err instanceof Error?err.message:'Kundenanfrage konnte nicht bearbeitet werden.')}
    finally{setBusy(false)}
  };
  const profile=request.profile;
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="workflow-modal admission-modal" onMouseDown={e=>e.stopPropagation()}>
    <header><div className="modal-icon"><UserRound/></div><div><span>NEUE KUNDENANFRAGE</span><h2>{profile?.full_name||'Neuer Kunde'}</h2></div><button onClick={onClose}><X/></button></header>
    <div className="admission-body">
      <div className="admission-person"><UserRound/><div><b>{profile?.full_name||'Name wird nach Freigabe sichtbar'}</b>{profile&&<span>{profile.street}<br/>{profile.postal_code} {profile.city}</span>}</div></div>
      {request.message&&<div className="customer-message"><small>NACHRICHT DES KUNDEN</small><p>{request.message}</p></div>}
      <div className="legal-note">Die Aufnahme bestätigt nur die Werkstattbeziehung. Einen Reparaturauftrag kann der Kunde erst danach für ein hinterlegtes Fahrzeug erstellen.</div>
      {error&&<div className="modal-error">{error}</div>}
      <div className="modal-actions"><button className="btn secondary" disabled={busy} onClick={()=>void decide('rejected')}>Leider keine Kapazität</button><button className="btn primary" disabled={busy} onClick={()=>void decide('accepted')}>{busy?'Speichert …':'Als Kunden annehmen'}</button></div>
    </div>
  </section></div>;
}

export function ServiceRequestOfficeModal({
  open,onClose,onDone,request
}:{
  open:boolean;onClose:()=>void;onDone:()=>Promise<void>|void;request:WorkshopServiceRequest|null;
}){
  const [startsAt,setStartsAt]=useState('');
  const [endsAt,setEndsAt]=useState('');
  const [note,setNote]=useState('');
  const [reason,setReason]=useState('');
  const [busy,setBusy]=useState(false);const [error,setError]=useState<string|null>(null);
  if(!open||!request)return null;

  const propose=async(event:React.FormEvent)=>{
    event.preventDefault();
    if(!startsAt){setError('Bitte einen Terminvorschlag auswählen.');return}
    setBusy(true);setError(null);
    try{
      await proposeAppointment({
        serviceRequestId:request.id,
        startsAt:new Date(startsAt).toISOString(),
        endsAt:endsAt?new Date(endsAt).toISOString():undefined,
        note:note.trim()||undefined
      });
      await onDone();onClose();
    }catch(err){setError(err instanceof Error?err.message:'Terminvorschlag konnte nicht gesendet werden.')}
    finally{setBusy(false)}
  };

  const decline=async()=>{
    if(busy)return;setBusy(true);setError(null);
    try{await declineServiceRequest(request.id,reason.trim()||undefined);await onDone();onClose()}
    catch(err){setError(err instanceof Error?err.message:'Anfrage konnte nicht abgelehnt werden.')}
    finally{setBusy(false)}
  };

  return <div className="modal-backdrop" onMouseDown={onClose}><section className="workflow-modal service-office-modal" onMouseDown={e=>e.stopPropagation()}>
    <header><div className="modal-icon"><CalendarDays/></div><div><span>WERKSTATTANFRAGE</span><h2>{request.vehicle}</h2><small>{request.plate} · {request.customerName}</small></div><button onClick={onClose}><X/></button></header>
    <form onSubmit={propose}>
      <div className="service-request-summary"><Car/><div><small>KUNDENBEANSTANDUNG</small><b>{request.complaint}</b><span>{request.driveable===false?'Nicht fahrbereit':request.driveable===true?'Fahrbereit':'Fahrbereitschaft unklar'} · Warnleuchte: {request.warningLevel==='red'?'rot':request.warningLevel==='yellow'?'gelb':request.warningLevel==='none'?'keine':'unklar'}</span></div></div>
      {request.desiredStart&&<div className="desired-slot"><small>WUNSCH DES KUNDEN</small><b>{new Date(request.desiredStart).toLocaleString('de-DE',{dateStyle:'medium',timeStyle:'short'})}</b></div>}
      <div className="form-two"><label><span>Terminvorschlag</span><input type="datetime-local" value={startsAt} onChange={e=>setStartsAt(e.target.value)} required/></label><label><span>voraussichtliches Ende <small>optional</small></span><input type="datetime-local" value={endsAt} onChange={e=>setEndsAt(e.target.value)}/></label></div>
      <label><span>Hinweis zum Termin <small>optional</small></span><textarea rows={2} value={note} onChange={e=>setNote(e.target.value)} placeholder="z. B. Fahrzeug bitte morgens abstellen."/></label>
      <div className="decline-zone"><label><span>Falls nicht annehmbar: Grund <small>optional</small></span><input value={reason} onChange={e=>setReason(e.target.value)} placeholder="z. B. aktuell keine Kapazität für diese Reparatur"/></label><button type="button" className="btn secondary" disabled={busy} onClick={()=>void decline()}>Anfrage ablehnen</button></div>
      {error&&<div className="modal-error">{error}</div>}
      <div className="modal-actions"><button type="button" className="btn secondary" onClick={onClose}>Schließen</button><button className="btn primary" disabled={busy||!startsAt}>{busy?'Wird gesendet …':'Terminvorschlag senden'}</button></div>
    </form>
  </section></div>;
}
