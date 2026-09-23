import { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, FileCheck2, FileSearch, LoaderCircle, ShieldCheck, Upload, Wrench } from 'lucide-react';
import {
  getWorkshopVerificationDocumentUrl,
  listWorkshopVerificationDocuments,
  requestWorkshopVerification,
  uploadWorkshopVerificationDocument,
  type WorkshopVerificationDocument
} from './api';
import {
  qualificationScopesForServices,
  recognizeQualificationFile,
  type QualificationRecognition
} from './verification';

type VerificationStatus='not_requested'|'pending'|'needs_info'|'verified'|'rejected';

const statusText:Record<VerificationStatus,string>={
  not_requested:'Noch nicht beantragt',
  pending:'Prüfung läuft',
  needs_info:'Weitere Nachweise erforderlich',
  verified:'Verifizierte Werkstatt',
  rejected:'Verifizierung abgelehnt'
};

export function VerificationPanel({
  workshopId,services,initialStatus='not_requested',reviewNote,onBeforeSubmit
}:{
  workshopId:string;
  services:string[];
  initialStatus?:VerificationStatus|string|null;
  reviewNote?:string|null;
  onBeforeSubmit?:()=>Promise<void>;
}){
  const scopes=useMemo(()=>qualificationScopesForServices(services),[services]);
  const regulated=scopes.includes('kfz_trade')||scopes.includes('tire_trade');
  const climateRequired=scopes.includes('climate_cert');
  const reviewRequired=scopes.includes('review');
  const [documents,setDocuments]=useState<WorkshopVerificationDocument[]>([]);
  const [status,setStatus]=useState<VerificationStatus>((initialStatus as VerificationStatus)||'not_requested');
  const [busy,setBusy]=useState(false);
  const [ocrBusy,setOcrBusy]=useState(false);
  const [ocrProgress,setOcrProgress]=useState(0);
  const [recognition,setRecognition]=useState<QualificationRecognition|null>(null);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');

  const reload=async()=>{
    try{
      const docs=await listWorkshopVerificationDocuments(workshopId);
      setDocuments(docs);
      setError('');
    }catch(err){
      setError(err instanceof Error?err.message:'Nachweise konnten nicht geladen werden.');
    }
  };

  useEffect(()=>{void reload()},[workshopId]);
  useEffect(()=>setStatus(((initialStatus as VerificationStatus)||'not_requested')),[initialStatus]);

  const businessDoc=documents.find(item=>item.document_type==='business_registration');
  const tradeDoc=documents.find(item=>item.document_type==='handwerksrolle');
  const qualificationDoc=documents.find(item=>['meisterbrief','industriemeister','techniker','other'].includes(item.document_type));
  const climateDoc=documents.find(item=>item.document_type==='climate_certificate');
  const ready=Boolean(
    businessDoc
    &&(!regulated||(tradeDoc&&qualificationDoc))
    &&(!climateRequired||climateDoc)
  );

  const uploadPlain=async(kind:'business_registration'|'handwerksrolle'|'climate_certificate',file?:File)=>{
    if(!file||busy)return;
    setBusy(true);setError('');setMessage('');
    try{
      await uploadWorkshopVerificationDocument({workshopId,file,documentType:kind});
      await reload();
      setMessage(
        kind==='business_registration'?'Betriebsnachweis gespeichert.'
        :kind==='climate_certificate'?'Kfz-Klimasachkundenachweis gespeichert.'
        :'Handwerksrollen-/Betriebsleiter-Nachweis gespeichert.'
      );
    }catch(err){setError(err instanceof Error?err.message:'Nachweis konnte nicht gespeichert werden.')}
    finally{setBusy(false)}
  };

  const uploadQualification=async(file?:File)=>{
    if(!file||ocrBusy||busy)return;
    setOcrBusy(true);setOcrProgress(0);setRecognition(null);setError('');setMessage('');
    try{
      const result=await recognizeQualificationFile(file,setOcrProgress);
      setRecognition(result);
      await uploadWorkshopVerificationDocument({
        workshopId,file,documentType:result.documentType,
        analysis:{
          detectedTitle:result.detectedTitle,
          detectedField:result.detectedField,
          detectedHolderName:result.detectedHolderName,
          detectedIssuer:result.detectedIssuer,
          detectedAwardedAt:result.detectedAwardedAt,
          recognitionClass:result.recognitionClass,
          note:result.note,
          confidence:result.confidence,
          tradeScopes:result.tradeScopes
        }
      });
      await reload();
      setMessage('Qualifikationsnachweis wurde ausgelesen und sicher gespeichert.');
    }catch(err){setError(err instanceof Error?err.message:'Qualifikationsnachweis konnte nicht verarbeitet werden.')}
    finally{setOcrBusy(false)}
  };

  const openDocument=async(document:WorkshopVerificationDocument)=>{
    try{
      const url=await getWorkshopVerificationDocumentUrl(document.storage_path);
      window.open(url,'_blank','noopener,noreferrer');
    }catch(err){setError(err instanceof Error?err.message:'Nachweis konnte nicht geöffnet werden.')}
  };

  const submit=async()=>{
    if(!ready||busy)return;
    setBusy(true);setError('');setMessage('');
    try{
      if(onBeforeSubmit)await onBeforeSubmit();
      const result:any=await requestWorkshopVerification(workshopId);
      setStatus((result?.verification_status as VerificationStatus)||'pending');
      setMessage('Verifizierung wurde eingereicht. MotorAtlas prüft jetzt Betrieb, Tätigkeit und Nachweise.');
    }catch(err){
      const raw=err instanceof Error?err.message:'Verifizierung konnte nicht beantragt werden.';
      const translated=raw.includes('business registration evidence required')
        ?'Bitte zuerst einen Gewerbe-/Betriebsnachweis hochladen.'
        :raw.includes('qualification evidence required')
          ?'Für die gewählten Tätigkeiten ist ein Qualifikationsnachweis erforderlich.'
          :raw.includes('handwerksrolle evidence required')
            ?'Für die gewählten Tätigkeiten ist zusätzlich der Handwerksrollen-/Betriebsleiter-Nachweis erforderlich.'
            :raw.includes('climate certificate required')
              ?'Für Klimaservice ist ein Kfz-Klimasachkundenachweis erforderlich.'
              :raw;
      setError(translated);
    }finally{setBusy(false)}
  };

  return <section id="verification-panel" className="panel verification-panel">
    <div className="verification-head">
      <div>
        <span className="overline">MOTORATLAS VERIFIZIERUNG</span>
        <h3>Betrieb und fachliche Berechtigung prüfen</h3>
        <p>MotorAtlas trennt Betriebsnachweis, Qualifikation und die Berechtigung für den angebotenen Leistungsumfang.</p>
      </div>
      <span className={'verification-status '+status}><ShieldCheck size={16}/>{statusText[status]}</span>
    </div>

    {reviewNote&&<div className="verification-note">{reviewNote}</div>}
    {message&&<div className="verification-message success">{message}</div>}
    {error&&<div className="verification-message error">{error}</div>}

    <div className="verification-grid">
      <article className={businessDoc?'done':''}>
        <div className="verification-step-icon">{businessDoc?<FileCheck2/>:<Upload/>}</div>
        <div><span>SCHRITT 1</span><b>Betriebsnachweis</b><p>Gewerbeanmeldung oder vergleichbarer offizieller Unternehmensnachweis.</p></div>
        {businessDoc
          ?<button className="btn secondary" onClick={()=>void openDocument(businessDoc)}>Ansehen</button>
          :<label className="btn secondary verification-upload">Hochladen<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e=>void uploadPlain('business_registration',e.target.files?.[0])}/></label>}
      </article>

      {reviewRequired&&<article className="optional review">
        <div className="verification-step-icon"><FileSearch/></div>
        <div>
          <span>HANDWERKSRECHTLICHE EINORDNUNG</span>
          <b>Service-/Diagnoseumfang wird im Gesamtbild geprüft</b>
          <p>Einfache Einzelarbeiten oder reines Auslesen lösen nicht automatisch einen Meister-/Handwerksrollen-Nachweis aus. Sobald Umfang und Tiefe aber eine wesentliche Tätigkeit des Kfz-Handwerks bilden, kann eine Eintragung erforderlich sein. MotorAtlas behandelt diese Auswahl deshalb nicht pauschal als meisterpflichtig.</p>
        </div>
      </article>}

      {climateRequired&&<article className={climateDoc?'done':''}>
        <div className="verification-step-icon">{climateDoc?<FileCheck2/>:<ShieldCheck/>}</div>
        <div>
          <span>KFZ-KLIMASERVICE</span>
          <b>Sachkundenachweis für Fahrzeug-Klimaanlagen</b>
          <p>Für Arbeiten mit Kältemittel an Kfz-Klimaanlagen wird ein eigener Sachkundenachweis geprüft. Das ist ein separater Fachnachweis und nicht automatisch ein Meisterbrief.</p>
        </div>
        {climateDoc
          ?<button className="btn secondary" onClick={()=>void openDocument(climateDoc)}>Ansehen</button>
          :<label className="btn secondary verification-upload">Hochladen<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e=>void uploadPlain('climate_certificate',e.target.files?.[0])}/></label>}
      </article>}

      {regulated?<article className={qualificationDoc?'done':''}>
        <div className="verification-step-icon">{ocrBusy?<LoaderCircle className="spin"/>:qualificationDoc?<BadgeCheck/>:<FileSearch/>}</div>
        <div>
          <span>FACHQUALIFIKATION · AUTOMATISCHE ERKENNUNG</span>
          <b>Meister-, Industriemeister- oder Technikernachweis</b>
          <p>
            {scopes.includes('kfz_trade')&&'Wesentliche Kfz-Tätigkeiten erkannt. '}
            {scopes.includes('tire_trade')&&'Reifen-/Vulkanisationstätigkeit erkannt. '}
            Foto oder PDF wird direkt im Browser ausgelesen.
          </p>
          {ocrBusy&&<small>Dokument wird erkannt … {ocrProgress}%</small>}
          {recognition&&!ocrBusy&&<div className={'recognition-result '+recognition.recognitionClass}>
            <strong>{recognition.detectedTitle}</strong>
            {recognition.detectedField&&<small>Fachrichtung: {recognition.detectedField}</small>}
            {recognition.detectedIssuer&&<small>Aussteller: {recognition.detectedIssuer}</small>}
            <p>{recognition.note}</p>
          </div>}
          {!recognition&&qualificationDoc&&<div className={'recognition-result '+qualificationDoc.recognition_class}>
            <strong>{qualificationDoc.detected_title||'Qualifikationsnachweis'}</strong>
            {qualificationDoc.detected_field&&<small>Fachrichtung: {qualificationDoc.detected_field}</small>}
            <p>{qualificationDoc.recognition_note||'Zur Prüfung gespeichert.'}</p>
          </div>}
        </div>
        {qualificationDoc
          ?<button className="btn secondary" onClick={()=>void openDocument(qualificationDoc)}>Ansehen</button>
          :<label className={'btn secondary verification-upload '+(ocrBusy?'disabled':'')}>Scannen<input disabled={ocrBusy} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e=>void uploadQualification(e.target.files?.[0])}/></label>}
      </article>:!reviewRequired&&!climateRequired&&<article className="done optional">
        <div className="verification-step-icon"><BadgeCheck/></div>
        <div><span>FACHNACHWEIS</span><b>Für den gewählten Leistungsumfang nicht erforderlich</b><p>Für reine Aufbereitung, Wäsche oder einfachen Rad-/Reifenservice fordert MotorAtlas keinen Meister- oder Technikernachweis.</p></div>
      </article>}

      {regulated&&<article className={tradeDoc?'done':''}>
        <div className="verification-step-icon">{tradeDoc?<FileCheck2/>:<Wrench/>}</div>
        <div><span>BETRIEBLICHE BERECHTIGUNG</span><b>Handwerksrolle / Betriebsleiter</b><p>Der Nachweis bestätigt, dass die Qualifikation für den konkreten Betrieb und das angebotene zulassungspflichtige Handwerk genutzt werden darf.</p></div>
        {tradeDoc
          ?<button className="btn secondary" onClick={()=>void openDocument(tradeDoc)}>Ansehen</button>
          :<label className="btn secondary verification-upload">Hochladen<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e=>void uploadPlain('handwerksrolle',e.target.files?.[0])}/></label>}
      </article>}
    </div>

    <div className="verification-submit">
      <div>
        <b>{ready?'Alle erforderlichen Nachweise liegen vor.':'Noch nicht vollständig.'}</b>
        <span>{regulated
          ?'Bei zulassungspflichtigem Leistungsumfang werden Qualifikation und betriebliche Berechtigung gemeinsam geprüft.'
          :climateRequired
            ?'Für Klimaservice wird zusätzlich der Kfz-Klimasachkundenachweis geprüft.'
            :reviewRequired
              ?'Diese Service-/Diagnoseleistungen werden nach ihrem konkreten Umfang beurteilt; ein Meisterbrief wird nicht pauschal verlangt.'
              :'Für diesen Leistungsumfang genügt der Betriebsnachweis.'}</span>
      </div>
      <button className="btn primary" disabled={!ready||busy||status==='pending'||status==='verified'} onClick={()=>void submit()}>
        {status==='verified'?'Verifiziert':status==='pending'?'Prüfung läuft':busy?'Wird eingereicht …':'Verifizierung beantragen'}
      </button>
    </div>
  </section>;
}
