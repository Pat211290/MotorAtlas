import { useEffect, useState } from 'react';
import { FileCheck2, ShieldCheck, X } from 'lucide-react';
import { listWorkOrderDocuments, recordApproval } from './api';

export function ExternalApprovalModal({
  open,onClose,onDone,workOrderId,vehicle
}:{
  open:boolean;onClose:()=>void;onDone:()=>Promise<void>|void;workOrderId:string;vehicle:string;
}){
  const [decision,setDecision]=useState<'approved'|'declined'|'deferred'>('approved');
  const [channel,setChannel]=useState<'phone'|'in_person'|'email'>('phone');
  const [note,setNote]=useState('');
  const [quoteId,setQuoteId]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState<string|null>(null);

  useEffect(()=>{
    if(!open)return;
    let cancelled=false;
    setDecision('approved');setChannel('phone');setNote('');setError(null);setQuoteId(null);setLoading(true);
    listWorkOrderDocuments(workOrderId)
      .then(documents=>{
        if(cancelled)return;
        const quote=documents.find(document=>document.document_type==='quote'&&document.status==='published');
        setQuoteId(quote?.id??null);
        if(!quote)setError('Für diesen Auftrag wurde kein veröffentlichter Kostenvoranschlag gefunden.');
      })
      .catch(err=>{if(!cancelled)setError(err instanceof Error?err.message:'Kostenvoranschlag konnte nicht geladen werden.')})
      .finally(()=>{if(!cancelled)setLoading(false)});
    return()=>{cancelled=true};
  },[open,workOrderId]);

  if(!open)return null;

  const submit=async(event:React.FormEvent)=>{
    event.preventDefault();
    if(!quoteId||busy)return;
    setBusy(true);setError(null);
    try{
      const channelText=channel==='phone'?'Telefon':channel==='in_person'?'persönlich':'E-Mail';
      const resolvedNote=[`Extern durch Werkstatt dokumentiert (${channelText}).`,note.trim()].filter(Boolean).join(' ');
      await recordApproval({
        workOrderId,quoteDocumentId:quoteId,decision,method:'phone_recorded_by_workshop',note:resolvedNote
      });
      await onDone();onClose();
    }catch(err){setError(err instanceof Error?err.message:'Kundenentscheidung konnte nicht gespeichert werden.')}
    finally{setBusy(false)}
  };

  return <div className="modal-backdrop" onMouseDown={()=>{if(!busy)onClose()}}>
    <section className="workflow-modal external-approval-modal" onMouseDown={event=>event.stopPropagation()}>
      <header><div className="modal-icon"><FileCheck2/></div><div><span>KUNDENENTSCHEIDUNG</span><h2>Externe Freigabe dokumentieren</h2><small>{vehicle}</small></div><button disabled={busy} onClick={onClose}><X/></button></header>
      <form onSubmit={submit}>
        <div className="workflow-decision-note"><ShieldCheck/><p>Für Kunden ohne MotorAtlas-Konto – oder wenn die Entscheidung telefonisch, persönlich oder per E-Mail kam. MotorAtlas dokumentiert, was die Werkstatt erhalten hat.</p></div>
        <label><span>Entscheidung</span><select value={decision} onChange={e=>setDecision(e.target.value as typeof decision)}>
          <option value="approved">Reparatur freigegeben</option>
          <option value="declined">Keine Reparatur</option>
          <option value="deferred">Reparatur später</option>
        </select></label>
        <label><span>Wie kam die Entscheidung?</span><select value={channel} onChange={e=>setChannel(e.target.value as typeof channel)}>
          <option value="phone">Telefon</option>
          <option value="in_person">Persönlich</option>
          <option value="email">E-Mail</option>
        </select></label>
        <label><span>Notiz <small>optional</small></span><textarea rows={3} value={note} onChange={e=>setNote(e.target.value)} placeholder="z. B. Betrag und Arbeitsumfang bestätigt."/></label>
        {loading&&<div className="legal-note">Kostenvoranschlag wird geladen …</div>}
        {error&&<div className="modal-error">{error}</div>}
        <div className="modal-actions"><button type="button" className="btn secondary" disabled={busy} onClick={onClose}>Abbrechen</button><button className="btn primary" disabled={busy||loading||!quoteId}>{busy?'Speichert …':'Entscheidung speichern'}</button></div>
      </form>
    </section>
  </div>;
}
