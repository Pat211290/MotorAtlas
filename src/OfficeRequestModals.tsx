import { useState } from 'react';
import { CalendarDays, Car, Mail, MapPin, Phone, UserRound, X } from 'lucide-react';
import { decideCustomerRequest, declineServiceRequest, proposeAppointment, type WorkshopServiceRequest } from './api';
import { QuarterHourDateTime } from './QuarterHourDateTime';
import { VehiclePhoto } from './VehicleModal';

function requestIntentLabel(intent:WorkshopServiceRequest['requestIntent']){
  if(intent==='direct_work')return'Direktauftrag – Leistung ausführen';
  if(intent==='diagnosis_then_quote')return'Diagnose + Kostenvoranschlag';
  if(intent==='diagnosis_only')return'Nur Diagnose / Prüfung';
  if(intent==='diagnosis_then_decide')return'Diagnose – danach entscheidet der Kunde';
  return'Kostenvoranschlag vor Arbeitsbeginn';
}

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
      <div className="admission-person"><UserRound/><div><b>{profile?.full_name||'Name wird nach Freigabe sichtbar'}</b>{profile&&<span>{profile.phone&&<><Phone size={13}/> {profile.phone}<br/></>}{profile.street}<br/>{profile.postal_code} {profile.city}</span>}</div></div>
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
      <div className="service-request-vehicle">
        <VehiclePhoto path={request.photoPath} alt={request.vehicle}/>
        <div className="service-request-vehicle-copy">
          <small>FAHRZEUG</small><h3>{request.vehicle}</h3><b>{request.plate}</b>
          <div className="vehicle-data-grid">
            <span><small>Erstzulassung</small><b>{request.firstRegistration?new Date(request.firstRegistration).toLocaleDateString('de-DE'):'—'}</b></span>
            <span><small>Kilometer</small><b>{request.mileage!=null?request.mileage.toLocaleString('de-DE')+' km':'—'}</b></span>
            <span><small>HSN / TSN</small><b>{[request.hsn,request.tsn].filter(Boolean).join(' / ')||'—'}</b></span>
            <span><small>FIN / VIN</small><b>{request.vin||'—'}</b></span>
          </div>
        </div>
      </div>
      <div className="service-customer-card">
        <UserRound/><div><small>KUNDE</small><b>{request.customerName}</b>
          <span>{request.customerPhone?<><Phone size={13}/> {request.customerPhone}</>:<>Keine Telefonnummer hinterlegt</>}</span>
          {request.customerEmail&&<span><Mail size={13}/> {request.customerEmail}</span>}
          <span><MapPin size={13}/> {[request.customerStreet,request.customerPostalCode,request.customerCity].filter(Boolean).join(', ')||'Keine Anschrift hinterlegt'}</span>
        </div>
      </div>
      <div className="service-intent-office"><small>GEWÜNSCHTER AUFTRAGSWEG</small><b>{requestIntentLabel(request.requestIntent)}</b><span>{request.requestIntent==='direct_work'?'Kein automatischer Kostenvoranschlag erforderlich. Zusatzarbeiten brauchen eine neue Freigabe.':request.requestIntent==='diagnosis_only'?'Nach der Diagnose endet der technische Auftrag ohne automatische Reparatur.':request.requestIntent==='diagnosis_then_decide'?'Nach der Diagnose wird der nächste Schritt offen festgelegt.':request.requestIntent==='quote_before_work'?'Vor der Reparatur ist ein Kostenvoranschlag vorgesehen.':'Nach der Diagnose wird ein Kostenvoranschlag erstellt und freigegeben.'}</span></div>
      <div className="service-request-summary"><Car/><div><small>KUNDENWUNSCH / BEANSTANDUNG</small><b>{request.complaint}</b><span>{request.driveable===false?'Nicht fahrbereit':request.driveable===true?'Fahrbereit':'Fahrbereitschaft unklar'} · Warnleuchte: {request.warningLevel==='red'?'rot':request.warningLevel==='yellow'?'gelb':request.warningLevel==='none'?'keine':'unklar'}</span></div></div>
      {request.desiredStart&&<div className="desired-slot"><small>WUNSCH DES KUNDEN</small><b>{new Date(request.desiredStart).toLocaleString('de-DE',{dateStyle:'medium',timeStyle:'short'})}</b></div>}
      <div className="form-two">
        <label><span>Terminvorschlag <small>15-Minuten-Takt</small></span><QuarterHourDateTime value={startsAt} onChange={setStartsAt} required/></label>
        <label><span>voraussichtliches Ende <small>optional · 15-Minuten-Takt</small></span><QuarterHourDateTime value={endsAt} onChange={setEndsAt}/></label>
      </div>
      <label><span>Hinweis zum Termin <small>optional</small></span><textarea rows={2} value={note} onChange={e=>setNote(e.target.value)} placeholder="z. B. Fahrzeug bitte morgens abstellen."/></label>
      <div className="decline-zone"><label><span>Falls nicht annehmbar: Grund <small>optional</small></span><input value={reason} onChange={e=>setReason(e.target.value)} placeholder="z. B. aktuell keine Kapazität für diese Reparatur"/></label><button type="button" className="btn secondary" disabled={busy} onClick={()=>void decline()}>Anfrage ablehnen</button></div>
      {error&&<div className="modal-error">{error}</div>}
      <div className="modal-actions"><button type="button" className="btn secondary" onClick={onClose}>Schließen</button><button className="btn primary" disabled={busy||!startsAt}>{busy?'Wird gesendet …':'Terminvorschlag senden'}</button></div>
    </form>
  </section></div>;
}
