import { useState } from 'react';
import { FileCheck2, FileText, Wrench, X } from 'lucide-react';
import { completeDiagnosis, uploadOfficialDocument } from './api';

type Base={open:boolean;onClose:()=>void;onDone:()=>Promise<void>|void};

export function DiagnosisModal({open,onClose,onDone,workOrderId,vehicle}:{open:boolean;onClose:()=>void;onDone:()=>Promise<void>|void;workOrderId:string;vehicle:string}){
  const [summary,setSummary]=useState('');
  const [internal,setInternal]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  if(!open)return null;
  const submit=async(event:React.FormEvent)=>{
    event.preventDefault();if(!summary.trim()||busy)return;
    setBusy(true);setError(null);
    try{await completeDiagnosis(workOrderId,summary.trim(),internal.trim()||undefined);await onDone();setSummary('');setInternal('');onClose()}
    catch(err){setError(err instanceof Error?err.message:'Diagnose konnte nicht gespeichert werden.')}
    finally{setBusy(false)}
  };
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="workflow-modal" onMouseDown={e=>e.stopPropagation()}>
    <header><div className="modal-icon"><Wrench/></div><div><span>DIAGNOSE ABSCHLIESSEN</span><h2>{vehicle}</h2></div><button onClick={onClose} aria-label="Schließen"><X/></button></header>
    <form onSubmit={submit}>
      <label><span>Festgestellter Fehler / Diagnose</span><textarea autoFocus rows={5} value={summary} onChange={e=>setSummary(e.target.value)} placeholder="z. B. Lambdasonde Bank 1 vor Kat liefert unplausible Werte." required/></label>
      <label><span>Interne Notiz <small>nur Werkstatt</small></span><textarea rows={3} value={internal} onChange={e=>setInternal(e.target.value)} placeholder="Optional – Messwerte, Hinweise, Teileinfo …"/></label>
      {error&&<div className="modal-error">{error}</div>}
      <div className="modal-actions"><button type="button" className="btn secondary" onClick={onClose}>Abbrechen</button><button className="btn primary" disabled={busy||!summary.trim()}>{busy?'Speichert …':'Diagnose abschließen'}</button></div>
    </form>
  </section></div>;
}

export function DocumentUploadModal({
  open,onClose,onDone,workOrderId,workshopId,vehicle,type
}:Base&{workOrderId:string;workshopId:string;vehicle:string;type:'quote'|'invoice'}){
  const [number,setNumber]=useState('');
  const [amount,setAmount]=useState('');
  const [file,setFile]=useState<File|null>(null);
  const [format,setFormat]=useState<'pdf'|'zugferd'|'xrechnung'>('pdf');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  if(!open)return null;
  const label=type==='quote'?'Kostenvoranschlag':'Rechnung';
  const submit=async(event:React.FormEvent)=>{
    event.preventDefault();if(!file||!number.trim()||!amount||busy)return;
    const parsed=Number(amount.replace(',','.'));
    if(!Number.isFinite(parsed)||parsed<0){setError('Bitte einen gültigen Gesamtbetrag eingeben.');return;}
    setBusy(true);setError(null);
    try{
      await uploadOfficialDocument({
        workOrderId,workshopId,documentType:type,documentNumber:number.trim(),
        title:label+' · '+vehicle,amountTotal:parsed,file,invoiceFormat:format
      });
      await onDone();setNumber('');setAmount('');setFile(null);setFormat('pdf');onClose();
    }catch(err){setError(err instanceof Error?err.message:label+' konnte nicht veröffentlicht werden.')}
    finally{setBusy(false)}
  };
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="workflow-modal document-modal" onMouseDown={e=>e.stopPropagation()}>
    <header><div className="modal-icon">{type==='quote'?<FileCheck2/>:<FileText/>}</div><div><span>OFFIZIELLES DOKUMENT</span><h2>{label} bereitstellen</h2><small>{vehicle}</small></div><button onClick={onClose} aria-label="Schließen"><X/></button></header>
    <form onSubmit={submit}>
      <div className="form-two">
        <label><span>{label}-Nummer</span><input value={number} onChange={e=>setNumber(e.target.value)} placeholder={type==='quote'?'KV-2026-001':'RE-2026-001'} required/></label>
        <label><span>Gesamtbetrag inkl. MwSt.</span><div className="money-input"><input inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="328,40" required/><b>€</b></div></label>
      </div>
      <label><span>Dateiformat</span><select value={format} onChange={e=>setFormat(e.target.value as 'pdf'|'zugferd'|'xrechnung')}><option value="pdf">PDF</option><option value="zugferd">ZUGFeRD (PDF)</option><option value="xrechnung">XRechnung / XML</option></select></label>
      <label className="document-drop"><input type="file" accept={format==='xrechnung'?'.xml,application/xml,text/xml':'.pdf,application/pdf'} onChange={e=>setFile(e.target.files?.[0]??null)} required/><FileText/><b>{file?file.name:label+' auswählen'}</b><span>{file?Math.max(1,Math.round(file.size/1024))+' KB':'Das Originaldokument wird unverändert gespeichert und versioniert.'}</span></label>
      <div className="legal-note"><FileCheck2/> Nach Veröffentlichung bleibt diese Version unverändert erhalten. Korrekturen erfolgen über eine neue Dokumentversion bzw. Berichtigung.</div>
      {error&&<div className="modal-error">{error}</div>}
      <div className="modal-actions"><button type="button" className="btn secondary" onClick={onClose}>Abbrechen</button><button className="btn primary" disabled={busy||!file||!number.trim()||!amount}>{busy?'Wird veröffentlicht …':label+' veröffentlichen'}</button></div>
    </form>
  </section></div>;
}
