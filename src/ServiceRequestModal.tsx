import { useEffect, useMemo, useState } from 'react';
import { Camera, CalendarDays, Car, FileSearch, FileText, SearchCheck, ShieldAlert, Wrench, X } from 'lucide-react';
import { createServiceRequestDraft, submitServiceRequest, uploadRequestImage, type CustomerVehicle, type CustomerWorkshop, type ServiceRequestIntent } from './api';
import { QuarterHourDateTime } from './QuarterHourDateTime';

export function ServiceRequestModal({
  open,onClose,onDone,vehicles,workshops,initialVehicleId
}:{
  open:boolean;onClose:()=>void;onDone:()=>Promise<void>|void;vehicles:CustomerVehicle[];workshops:CustomerWorkshop[];initialVehicleId?:string|null;
}){
  const primary=workshops.find(w=>w.isPrimary)??workshops[0];
  const [vehicleId,setVehicleId]=useState('');
  const [workshopId,setWorkshopId]=useState(primary?.workshopId??'');
  const [complaint,setComplaint]=useState('');
  const [notes,setNotes]=useState('');
  const [desired,setDesired]=useState('');
  const [requestIntent,setRequestIntent]=useState<ServiceRequestIntent>('diagnosis_then_quote');
  const [driveable,setDriveable]=useState<'yes'|'no'|'unknown'>('yes');
  const [warning,setWarning]=useState<'none'|'yellow'|'red'|'unknown'>('unknown');
  const [image,setImage]=useState<File|null>(null);
  const [busy,setBusy]=useState(false);const [error,setError]=useState<string|null>(null);
  const preview=useMemo(()=>image?URL.createObjectURL(image):null,[image]);

  useEffect(()=>{
    if(!open)return;
    const nextPrimary=workshops.find(w=>w.isPrimary)??workshops[0];
    if(!workshopId&&nextPrimary)setWorkshopId(nextPrimary.workshopId);
    setVehicleId(initialVehicleId&&vehicles.some(vehicle=>vehicle.id===initialVehicleId)?initialVehicleId:'');
  },[open,workshops,workshopId,initialVehicleId,vehicles]);

  if(!open)return null;
  const reset=()=>{setVehicleId('');setComplaint('');setNotes('');setDesired('');setRequestIntent('diagnosis_then_quote');setDriveable('yes');setWarning('unknown');setImage(null);setError(null)};

  const submit=async(event:React.FormEvent)=>{
    event.preventDefault();
    if(!vehicleId){setError('Bitte zuerst ein Fahrzeug auswählen.');return}
    if(!workshopId){setError('Du benötigst zuerst eine freigegebene Werkstatt.');return}
    setBusy(true);setError(null);
    try{
      const request=await createServiceRequestDraft({
        workshopId,vehicleId,complaint:complaint.trim(),customerNotes:notes.trim()||undefined,
        desiredStart:desired?new Date(desired).toISOString():undefined,
        driveable:driveable==='unknown'?undefined:driveable==='yes',
        warningLevel:warning,requestIntent
      });
      if(image)await uploadRequestImage(request.id,image);
      await submitServiceRequest(request.id);
      await onDone();reset();onClose();
    }catch(err){setError(err instanceof Error?err.message:'Anfrage konnte nicht gesendet werden.')}
    finally{setBusy(false)}
  };

  const selectedVehicle=vehicles.find(v=>v.id===vehicleId);
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="workflow-modal request-modal" onMouseDown={e=>e.stopPropagation()}>
    <header><div className="modal-icon"><ShieldAlert/></div><div><span>NEUE WERKSTATTANFRAGE</span><h2>Was ist mit deinem Auto?</h2></div><button onClick={onClose} aria-label="Schließen"><X/></button></header>
    <form onSubmit={submit}>
      {!vehicles.length?<div className="request-blocker"><Car/><b>Noch kein Fahrzeug vorhanden.</b><span>Lege zuerst einen PKW in „Meine Garage“ an.</span></div>:<>
        <div className="form-two">
          <label><span>Fahrzeug <small>Pflicht</small></span><select value={vehicleId} onChange={e=>setVehicleId(e.target.value)} required><option value="" disabled>Bitte Fahrzeug auswählen …</option>{vehicles.map(v=><option key={v.id} value={v.id}>{[v.make,v.model,v.variant].filter(Boolean).join(' ')} · {v.licensePlate}</option>)}</select></label>
          <label><span>Werkstatt</span><select value={workshopId} onChange={e=>setWorkshopId(e.target.value)}>{workshops.map(w=><option key={w.workshopId} value={w.workshopId}>{w.name}{w.isPrimary?' · Stammwerkstatt':''}</option>)}</select></label>
        </div>
        {!workshops.length&&<div className="request-blocker"><ShieldAlert/><b>Noch keine freigegebene Werkstatt.</b><span>Wähle zuerst eine Werkstatt und lass deine Kundenanfrage bestätigen.</span></div>}
        <div className="request-intent-block">
          <div className="request-intent-head"><span>Was soll die Werkstatt für dich tun? <small>Pflicht</small></span><p>Damit weiß die Werkstatt schon vor dem Termin, ob sie direkt arbeiten darf oder erst prüfen bzw. ein Angebot erstellen soll.</p></div>
          <div className="request-intent-grid">
            <button type="button" className={requestIntent==='direct_work'?'request-intent active':''} onClick={()=>setRequestIntent('direct_work')}><Wrench/><span><b>Leistung direkt beauftragen</b><small>Für bekannte Arbeiten wie Öl- und Filterwechsel. Die beschriebene Leistung darf ausgeführt werden; Zusatzarbeiten brauchen eine neue Freigabe.</small></span></button>
            <button type="button" className={requestIntent==='diagnosis_then_quote'?'request-intent active':''} onClick={()=>setRequestIntent('diagnosis_then_quote')}><FileSearch/><span><b>Diagnose + Kostenvoranschlag</b><small>Erst prüfen, danach Angebot. Reparatur beginnt erst nach deiner Freigabe.</small></span></button>
            <button type="button" className={requestIntent==='diagnosis_only'?'request-intent active':''} onClick={()=>setRequestIntent('diagnosis_only')}><SearchCheck/><span><b>Nur Diagnose / Prüfung</b><small>Fehler oder Zustand feststellen. Keine Reparatur wird automatisch beauftragt.</small></span></button>
            <button type="button" className={requestIntent==='diagnosis_then_decide'?'request-intent active':''} onClick={()=>setRequestIntent('diagnosis_then_decide')}><ShieldAlert/><span><b>Diagnose, danach entscheide ich</b><small>Nach der Diagnose bleibt offen, ob repariert, ein Angebot erstellt oder die Reparatur verschoben wird.</small></span></button>
            <button type="button" className={requestIntent==='quote_before_work'?'request-intent active':''} onClick={()=>setRequestIntent('quote_before_work')}><FileText/><span><b>Nur Preis / Kostenvoranschlag</b><small>Für eine bekannte Leistung zuerst ein Angebot einholen, bevor Arbeiten freigegeben werden.</small></span></button>
          </div>
        </div>
        <label><span>Warum möchtest du die Werkstatt kontaktieren? <small>optional</small></span><textarea rows={4} value={complaint} onChange={e=>setComplaint(e.target.value)} placeholder="z. B. Motorkontrollleuchte, Ölwechsel, Geräusch beim Bremsen – oder einfach leer lassen."/></label>
        <label><span>Weitere Hinweise <small>optional</small></span><textarea rows={2} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Seit wann? Unter welchen Bedingungen? Wurde schon etwas geprüft?"/></label>
        <div className="request-state-grid">
          <label><span>Fahrzeug fahrbereit?</span><div className="segment">{(['yes','no','unknown'] as const).map(value=><button key={value} type="button" className={driveable===value?'active':''} onClick={()=>setDriveable(value)}>{value==='yes'?'Ja':value==='no'?'Nein':'Unklar'}</button>)}</div></label>
          <label><span>Warnleuchte</span><div className="segment warning-segment">{(['none','yellow','red','unknown'] as const).map(value=><button key={value} type="button" className={warning===value?'active '+value:''} onClick={()=>setWarning(value)}>{value==='none'?'Keine':value==='yellow'?'Gelb':value==='red'?'Rot':'Unklar'}</button>)}</div></label>
        </div>
        <label><span><CalendarDays size={14}/> Wunschtermin <small>optional · 15-Minuten-Takt</small></span><QuarterHourDateTime value={desired} onChange={setDesired}/></label>
        <label className="problem-photo">
          <input type="file" accept="image/png,image/jpeg,image/webp" capture="environment" onChange={e=>setImage(e.target.files?.[0]??null)}/>
          {preview?<img src={preview} alt="Problemfoto"/>:<><Camera/><b>Bild zum Problem hinzufügen</b><span>Optional · direkt fotografieren oder auswählen</span></>}
        </label>
        <div className="request-summary"><Car/><div><b>{selectedVehicle?[selectedVehicle.make,selectedVehicle.model,selectedVehicle.variant].filter(Boolean).join(' '):'Fahrzeug'}</b><span>{selectedVehicle?.licensePlate} · Die Werkstatt erhält alle hinterlegten Fahrzeugdaten automatisch.</span></div></div>
      </>}
      {error&&<div className="modal-error">{error}</div>}
      <div className="modal-actions"><button type="button" className="btn secondary" onClick={onClose}>Abbrechen</button><button className="btn primary" disabled={busy||!vehicles.length||!workshops.length||!vehicleId}>{busy?'Wird gesendet …':'Anfrage senden'}</button></div>
    </form>
  </section></div>;
}
