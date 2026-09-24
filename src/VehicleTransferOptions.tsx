import { useMemo, useState } from 'react';
import { Building2, FileCheck2, KeyRound, QrCode, ShieldCheck } from 'lucide-react';
import {
  claimVehicleWithToken, createSupportVehicleClaim, uploadSupportVehicleClaimEvidence, type VehicleClaimLookup
} from './api';

function extractToken(value:string){
  const raw=value.trim();
  if(!raw)return'';
  try{
    const url=new URL(raw);
    const direct=url.searchParams.get('claim');
    if(direct)return direct.trim();
    const queryIndex=url.hash.indexOf('?');
    if(queryIndex>=0){
      const hashToken=new URLSearchParams(url.hash.slice(queryIndex+1)).get('claim');
      if(hashToken)return hashToken.trim();
    }
  }catch{}
  return raw.replace(/^claim:/i,'').trim();
}

export function VehicleTransferOptions({
  vin,lookup,onDone,onFindWorkshop
}:{
  vin:string;lookup:VehicleClaimLookup;onDone:()=>Promise<void>|void;onFindWorkshop?:()=>void;
}){
  const [mode,setMode]=useState<'qr'|'workshop'|'support'|null>(null);
  const [token,setToken]=useState('');
  const [evidence,setEvidence]=useState<File|null>(null);
  const [note,setNote]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [submitted,setSubmitted]=useState(false);

  const vehicleLabel=useMemo(()=>[lookup.make,lookup.model,lookup.variant].filter(Boolean).join(' ')||'Fahrzeug',[lookup]);

  const useCode=async()=>{
    const resolved=extractToken(token);
    if(!resolved){setError('Bitte QR-Link oder Übernahmecode eingeben.');return}
    setBusy(true);setError(null);
    try{
      await claimVehicleWithToken(resolved);
      await onDone();
    }catch(err){setError(err instanceof Error?err.message:'Fahrzeug konnte nicht übernommen werden.')}
    finally{setBusy(false)}
  };

  const sendSupport=async()=>{
    if(!evidence){setError('Bitte den Kaufvertrag oder einen anderen Eigentumsnachweis hochladen.');return}
    setBusy(true);setError(null);
    try{
      const request=await createSupportVehicleClaim(vin,note);
      await uploadSupportVehicleClaimEvidence(request.claimId,evidence);
      setSubmitted(true);
    }catch(err){setError(err instanceof Error?err.message:'Supportprüfung konnte nicht eingereicht werden.')}
    finally{setBusy(false)}
  };

  return <section className="vehicle-transfer-options">
    <div className="vehicle-existing-head">
      <ShieldCheck/>
      <div><small>FAHRZEUG BEREITS IN MOTORATLAS</small><h3>{vehicleLabel}</h3><p>{lookup.licensePlate||'Kennzeichen nicht angezeigt'} · FIN erkannt</p></div>
    </div>
    <p className="vehicle-transfer-intro">Dieses Fahrzeug wird nicht doppelt angelegt. Wähle selbst, wie du die bestehende Fahrzeugakte sicher übernehmen möchtest.</p>

    <div className="vehicle-transfer-choice-grid">
      <button type="button" className={mode==='qr'?'active':''} onClick={()=>{setMode('qr');setError(null)}}>
        <QrCode/><span><b>QR-Code / Übernahmecode</b><small>Vom bisherigen Besitzer oder von einer prüfenden MotorAtlas-Werkstatt.</small></span>
      </button>
      <button type="button" className={mode==='workshop'?'active':''} onClick={()=>{setMode('workshop');setError(null)}}>
        <Building2/><span><b>Bei MotorAtlas-Werkstatt prüfen lassen</b><small>Jede teilnehmende Werkstatt kann das Fahrzeug vor Ort prüfen – unabhängig davon, wo es früher betreut wurde.</small></span>
      </button>
      <button type="button" className={mode==='support'?'active':''} onClick={()=>{setMode('support');setError(null)}}>
        <FileCheck2/><span><b>Kaufvertrag an MotorAtlas Support</b><small>Manuelle Prüfung durch MotorAtlas, wenn QR-Code oder Werkstattprüfung nicht passen.</small></span>
      </button>
    </div>

    {mode==='qr'&&<div className="vehicle-transfer-step">
      <div className="vehicle-transfer-note"><KeyRound/><p>Scanne den QR-Code mit dem Handy oder füge den darin enthaltenen Link bzw. Übernahmecode hier ein.</p></div>
      <label><span>Übernahmecode / QR-Link</span><input value={token} onChange={e=>setToken(e.target.value)} placeholder="Code oder https://…"/></label>
      <button type="button" className="btn primary" disabled={busy} onClick={()=>void useCode()}>{busy?'Wird übernommen …':'Fahrzeug übernehmen'}</button>
    </div>}

    {mode==='workshop'&&<div className="vehicle-transfer-step">
      <div className="vehicle-transfer-note"><Building2/><p>{lookup.previousOwnerReleased?'Das Fahrzeug kann von einer beliebigen MotorAtlas-Werkstatt vor Ort anhand FIN und Unterlagen geprüft werden. Danach erzeugt die Werkstatt einen Einmal-QR-Code.':'Das Fahrzeug ist noch einem aktiven MotorAtlas-Konto zugeordnet. Eine Werkstatt darf es deshalb nicht einfach umschreiben. Nutze die Freigabe des bisherigen Nutzers oder die Supportprüfung mit Kaufvertrag.'}</p></div>
      {lookup.previousOwnerReleased&&onFindWorkshop&&<button type="button" className="btn primary" onClick={onFindWorkshop}>MotorAtlas-Werkstatt suchen</button>}
    </div>}

    {mode==='support'&&<div className="vehicle-transfer-step">
      {submitted?<div className="vehicle-support-submitted"><ShieldCheck/><div><b>Prüfung eingereicht</b><span>MotorAtlas Support prüft den Nachweis. Nach der Freigabe erscheint das Fahrzeug automatisch in deiner Garage.</span></div></div>:<>
        <div className="vehicle-transfer-note"><FileCheck2/><p>Der Kaufvertrag wird ausschließlich zur Prüfung der MotorAtlas-Fahrzeugzuordnung verwendet. Alte Kundendaten, Rechnungen und Chats des Vorbesitzers werden nicht auf dich übertragen.</p></div>
        <label><span>Kaufvertrag / Eigentumsnachweis</span><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={e=>setEvidence(e.target.files?.[0]??null)}/><small className="field-help">PDF, JPG, PNG oder WebP · maximal 15 MB.</small></label>
        <label><span>Hinweis an Support <small>optional</small></span><textarea rows={3} value={note} onChange={e=>setNote(e.target.value)} placeholder="z. B. Fahrzeug am 20.09.2026 gekauft; Verkäufer nutzt MotorAtlas nicht."/></label>
        <button type="button" className="btn primary" disabled={busy||!evidence} onClick={()=>void sendSupport()}>{busy?'Wird eingereicht …':'Zur manuellen Prüfung senden'}</button>
      </>}
    </div>}

    {error&&<div className="modal-error">{error}</div>}
  </section>;
}
