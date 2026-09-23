import { useEffect, useState } from 'react';
import { Clock3, FileCheck2, Mail, Phone, ShieldCheck, X } from 'lucide-react';
import { resolveWorkOrderNextStep, type AgreementMethod, type WorkNextStepDecision } from './api';

const titles:Record<WorkNextStepDecision,string>={
  motoratlas_quote:'Kostenvoranschlag in MotorAtlas',
  external_approved:'Bereits extern vereinbart',
  external_waiting:'Extern abgestimmt – Entscheidung offen',
  no_repair:'Keine Reparatur',
  deferred:'Reparatur später'
};

export function WorkDecisionModal({
  open,onClose,onDone,workOrderId,vehicle,decision
}:{
  open:boolean;onClose:()=>void;onDone:()=>Promise<void>|void;workOrderId:string;vehicle:string;
  decision:WorkNextStepDecision|null;
}){
  const [method,setMethod]=useState<AgreementMethod>('email');
  const [note,setNote]=useState('');
  const [invoiceRequired,setInvoiceRequired]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);

  useEffect(()=>{if(open){setMethod('email');setNote('');setInvoiceRequired(true);setError(null)}},[open,decision]);
  if(!open||!decision)return null;

  const submit=async(event:React.FormEvent)=>{
    event.preventDefault();if(busy)return;
    setBusy(true);setError(null);
    try{
      await resolveWorkOrderNextStep({
        workOrderId,decision,
        method:decision==='motoratlas_quote'?undefined:method,
        note:note.trim()||undefined,
        invoiceRequired
      });
      await onDone();onClose();
    }catch(err){setError(err instanceof Error?err.message:'Nächster Schritt konnte nicht gespeichert werden.')}
    finally{setBusy(false)}
  };

  const text=decision==='external_approved'
    ?'Die Reparatur bzw. Leistung wurde bereits außerhalb von MotorAtlas mit dem Kunden vereinbart. Danach kann die Arbeit direkt einem Mitarbeiter zugeordnet werden.'
    :decision==='external_waiting'
      ?'Ein Angebot oder eine Abstimmung erfolgte bereits außerhalb von MotorAtlas, aber die Entscheidung des Kunden steht noch aus.'
      :decision==='no_repair'
        ?'Der aktuelle Auftrag endet nach Diagnose/Prüfung ohne Reparatur.'
        :decision==='deferred'
          ?'Die Reparatur wird nicht in diesem Auftrag durchgeführt. Eine spätere Reparatur kann als neuer Auftrag geplant werden.'
          :'MotorAtlas erwartet danach einen Kostenvoranschlag und eine Kundenfreigabe.';

  return <div className="modal-backdrop" onMouseDown={onClose}>
    <section className="workflow-modal work-decision-modal" onMouseDown={event=>event.stopPropagation()}>
      <header><div className="modal-icon"><FileCheck2/></div><div><span>NÄCHSTER AUFTRAGSSCHRITT</span><h2>{titles[decision]}</h2><small>{vehicle}</small></div><button onClick={onClose} aria-label="Schließen"><X/></button></header>
      <form onSubmit={submit}>
        <div className="workflow-decision-note"><ShieldCheck/><p>{text}</p></div>
        {decision!=='motoratlas_quote'&&<label><span>Wie wurde das abgestimmt?</span><select value={method} onChange={event=>setMethod(event.target.value as AgreementMethod)}>
          <option value="email">E-Mail</option><option value="phone">Telefon</option><option value="in_person">Persönlich</option><option value="portal">MotorAtlas / Portal</option><option value="customer_order">Bereits durch Kundenauftrag</option><option value="other">Sonstiger Weg</option>
        </select></label>}
        {decision!=='motoratlas_quote'&&<label><span>Dokumentation <small>optional</small></span><textarea rows={3} value={note} onChange={event=>setNote(event.target.value)} placeholder="z. B. Preis und Arbeitsumfang am 23.09. per E-Mail bestätigt."/></label>}
        {(decision==='external_approved'||decision==='no_repair'||decision==='deferred')&&<label className="toggle-row"><input type="checkbox" checked={invoiceRequired} onChange={event=>setInvoiceRequired(event.target.checked)}/><span><b>Rechnung soll in MotorAtlas bereitgestellt werden</b><small>Deaktivieren, wenn die Abrechnung extern erfolgt oder keine Rechnung erforderlich ist.</small></span></label>}
        {decision==='external_waiting'&&<div className="legal-note"><Clock3/> Der Auftrag bleibt auf „Entscheidung offen“, bis die Werkstatt den nächsten Schritt dokumentiert.</div>}
        {decision==='external_approved'&&<div className="legal-note"><Mail/> MotorAtlas dokumentiert nur, dass eine externe Freigabe vorliegt. Die eigentliche E-Mail bzw. Vereinbarung bleibt außerhalb des Systems.</div>}
        {error&&<div className="modal-error">{error}</div>}
        <div className="modal-actions"><button type="button" className="btn secondary" onClick={onClose}>Abbrechen</button><button className="btn primary" disabled={busy}>{busy?'Speichert …':'Nächsten Schritt speichern'}</button></div>
      </form>
    </section>
  </div>;
}
