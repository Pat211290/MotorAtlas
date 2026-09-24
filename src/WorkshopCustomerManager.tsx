import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import {
  CalendarClock, Car, FileClock, History, Mail, MapPin, Phone, Plus, QrCode, Search, ShieldCheck, UserRound, X
} from 'lucide-react';
import {
  addVehicleHistoryEntry, createVehicleClaimToken, createVerifiedVehicleTransferToken, createWalkInWorkOrder, createWorkshopCustomerVehicle, getVehicleHistory,
  listWorkshopCustomerDirectory, type ServiceRequestIntent, type VehicleHistoryEntry, type WorkshopCustomerDirectoryItem
} from './api';

function claimUrl(token:string){
  const configured=(import.meta.env.VITE_PUBLIC_APP_URL as string|undefined)?.trim()||'https://motoratlas.de/';
  const url=new URL(configured);
  url.search='';
  url.hash='/fahrzeug-uebernehmen?claim='+encodeURIComponent(token);
  return url.toString();
}

function parseNumber(value:string){
  if(!value.trim())return null;
  const n=Number(value);
  return Number.isFinite(n)?Math.round(n):null;
}

export function WorkshopCustomerManager({workshopId,onChanged,onOpenOrder}:{workshopId:string;onChanged:()=>Promise<void>|void;onOpenOrder?:(workOrderId:string)=>void}){
  const [search,setSearch]=useState('');
  const [items,setItems]=useState<WorkshopCustomerDirectoryItem[]>([]);
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const [createOpen,setCreateOpen]=useState(false);
  const [transferVerifyOpen,setTransferVerifyOpen]=useState(false);
  const [autoQrVehicleId,setAutoQrVehicleId]=useState<string|null>(null);

  const load=async(query=search)=>{
    setLoading(true);
    try{setItems(await listWorkshopCustomerDirectory(workshopId,query));setError(null)}
    catch(err){setError(err instanceof Error?err.message:'Kunden konnten nicht geladen werden.')}
    finally{setLoading(false)}
  };

  useEffect(()=>{void load('')},[workshopId]);
  useEffect(()=>{
    const id=window.setTimeout(()=>void load(search),220);
    return()=>window.clearTimeout(id);
  },[search]);

  const selected=useMemo(()=>items.find(item=>item.vehicleId===selectedId)??null,[items,selectedId]);

  return <div className="workshop-customer-manager">
    <section className="panel workshop-customer-toolbar">
      <div className="workshop-customer-search"><Search/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Name, Fahrzeug, Kennzeichen oder FIN suchen …"/></div>
      <div className="workshop-customer-toolbar-actions">
        <button className="btn secondary" onClick={()=>setTransferVerifyOpen(true)}><ShieldCheck size={16}/> Besitzerwechsel prüfen</button>
        <button className="btn primary" onClick={()=>setCreateOpen(true)}><Plus size={16}/> Kunde + Fahrzeug anlegen</button>
      </div>
    </section>

    {error&&<div className="modal-error">{error}</div>}

    <div className="workshop-customer-layout">
      <section className="panel workshop-customer-list">
        <header><div><span className="overline">KUNDEN & FAHRZEUGE</span><h3>{loading?'Wird geladen …':items.length+' Treffer'}</h3></div></header>
        <div>
          {!loading&&items.map(item=><button key={item.vehicleId} className={'workshop-customer-row '+(selectedId===item.vehicleId?'active':'')} onClick={()=>setSelectedId(selectedId===item.vehicleId?null:item.vehicleId)}>
            <span className="inbox-icon"><Car/></span>
            <span className="workshop-customer-row-main">
              <b>{item.customerName}</b>
              <small>{[item.make,item.model,item.variant].filter(Boolean).join(' ')} · {item.licensePlate}</small>
              <p>{item.vin?'FIN '+item.vin:'FIN nicht hinterlegt'}{item.phone?' · '+item.phone:''}</p>
            </span>
            <span className="workshop-customer-row-meta">
              <strong>{item.ownerUserId?'MotorAtlas-Konto':'Werkstattkunde'}</strong>
              <small>{item.historyCount} Historieneinträge</small>
            </span>
          </button>)}
          {!loading&&!items.length&&<div className="inbox-empty">Kein Kunde oder Fahrzeug passt zur Suche.</div>}
        </div>
      </section>

      {selected?<WorkshopCustomerVehicleDetail item={selected} workshopId={workshopId} onChanged={async()=>{await load(search);await onChanged()}} onOpenOrder={onOpenOrder} autoOpenQr={autoQrVehicleId===selected.vehicleId} onQrOpened={()=>setAutoQrVehicleId(null)}/>:
        <section className="panel workshop-customer-placeholder"><Car/><h3>Fahrzeug auswählen</h3><p>Links suchen oder auswählen. Hier erscheinen Fahrzeugdaten, Kontakt, Historie und der sichere QR-Code zur Kontoübernahme.</p></section>}
    </div>

    <WorkshopCustomerCreateModal open={createOpen} onClose={()=>setCreateOpen(false)} workshopId={workshopId} onDone={async(vehicleId)=>{setCreateOpen(false);await load(search);setSelectedId(vehicleId);setAutoQrVehicleId(vehicleId);await onChanged()}}/>
    <WorkshopTransferVerificationModal open={transferVerifyOpen} onClose={()=>setTransferVerifyOpen(false)} workshopId={workshopId}/>
  </div>;
}

function WorkshopCustomerVehicleDetail({item,workshopId,onChanged,onOpenOrder,autoOpenQr,onQrOpened}:{item:WorkshopCustomerDirectoryItem;workshopId:string;onChanged:()=>Promise<void>|void;onOpenOrder?:(workOrderId:string)=>void;autoOpenQr?:boolean;onQrOpened?:()=>void}){
  const [history,setHistory]=useState<VehicleHistoryEntry[]>([]);
  const [historyBusy,setHistoryBusy]=useState(false);
  const [historyOpen,setHistoryOpen]=useState(false);
  const [qrOpen,setQrOpen]=useState(false);
  const [orderOpen,setOrderOpen]=useState(false);

  useEffect(()=>{
    if(!autoOpenQr)return;
    setQrOpen(true);
    onQrOpened?.();
  },[autoOpenQr,item.vehicleId]);

  useEffect(()=>{
    let cancelled=false;
    setHistoryBusy(true);
    getVehicleHistory(item.vehicleId).then(rows=>{if(!cancelled)setHistory(rows)}).catch(()=>{if(!cancelled)setHistory([])}).finally(()=>{if(!cancelled)setHistoryBusy(false)});
    return()=>{cancelled=true};
  },[item.vehicleId]);

  return <section className="panel workshop-customer-detail">
    <header className="workshop-customer-detail-head">
      <div><span className="overline">FAHRZEUGAKTE</span><h2>{[item.make,item.model,item.variant].filter(Boolean).join(' ')}</h2><p>{item.licensePlate}</p></div>
      <div><button className="btn primary" onClick={()=>setOrderOpen(true)}><Plus size={15}/> Neuer Auftrag</button><button className="btn secondary" onClick={()=>setHistoryOpen(true)}><FileClock size={15}/> Historie ergänzen</button><button className="btn secondary" onClick={()=>setQrOpen(true)}><QrCode size={16}/> QR-Code</button></div>
    </header>

    <div className="workshop-customer-contact">
      <div><UserRound/><span><small>KUNDE</small><b>{item.customerName}</b></span></div>
      <div><Phone/><span><small>TELEFON</small><b>{item.phone||'Nicht hinterlegt'}</b></span></div>
      <div><Mail/><span><small>E-MAIL</small><b>{item.email||'Nicht hinterlegt'}</b></span></div>
      <div><MapPin/><span><small>ANSCHRIFT</small><b>{[item.street,[item.postalCode,item.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')||'Nicht hinterlegt'}</b></span></div>
    </div>

    <div className="workshop-customer-vehicle-data">
      <div><small>KENNZEICHEN</small><b>{item.licensePlate}</b></div>
      <div><small>FIN / VIN</small><b>{item.vin||'Nicht hinterlegt'}</b></div>
      <div><small>KILOMETER</small><b>{item.mileage!=null?item.mileage.toLocaleString('de-DE')+' km':'Nicht hinterlegt'}</b></div>
      <div><small>STATUS</small><b>{item.ownerUserId?'Mit MotorAtlas-Konto verknüpft':'Nur in der Werkstatt geführt'}</b></div>
    </div>

    <div className="vehicle-history">
      <header><div><History/><span><small>FAHRZEUGHISTORIE</small><b>Was wurde wann gemacht?</b></span></div><strong>{history.length}</strong></header>
      {historyBusy?<div className="inbox-empty">Historie wird geladen …</div>:history.length?<div className="vehicle-history-list">
        {history.map(entry=><article key={entry.id}>
          <i/>
          <div><small>{new Date(entry.occurredAt).toLocaleDateString('de-DE')} · {entry.workshopName}{entry.orderNumber?' · #'+entry.orderNumber:''}</small><b>{entry.title}</b>{entry.summary&&<p>{entry.summary}</p>}<span>{entry.mileage!=null?entry.mileage.toLocaleString('de-DE')+' km':''}</span></div>
        </article>)}
      </div>:<div className="inbox-empty">Noch keine Historieneinträge vorhanden.</div>}
    </div>

    <WalkInOrderModal open={orderOpen} onClose={()=>setOrderOpen(false)} item={item} workshopId={workshopId} onDone={async orderId=>{setOrderOpen(false);await onChanged();onOpenOrder?.(orderId)}}/>
    <VehicleClaimQrModal open={qrOpen} onClose={()=>setQrOpen(false)} item={item} workshopId={workshopId}/>
    <HistoryEntryModal open={historyOpen} onClose={()=>setHistoryOpen(false)} item={item} workshopId={workshopId} onDone={async()=>{setHistory(await getVehicleHistory(item.vehicleId));await onChanged()}}/>
  </section>;
}

function WorkshopTransferVerificationModal({open,onClose,workshopId}:{open:boolean;onClose:()=>void;workshopId:string}){
  const [vin,setVin]=useState('');
  const [confirmed,setConfirmed]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [qr,setQr]=useState<string|null>(null);
  const [url,setUrl]=useState('');
  const [vehicle,setVehicle]=useState<{make:string;model:string;variant?:string|null;licensePlate:string;expiresAt:string}|null>(null);

  useEffect(()=>{if(open){setVin('');setConfirmed(false);setBusy(false);setError(null);setQr(null);setUrl('');setVehicle(null)}},[open]);
  if(!open)return null;

  const generate=async()=>{
    if(vin.trim().length!==17){setError('Bitte die vollständige 17-stellige FIN eingeben.');return}
    if(!confirmed){setError('Bestätige zuerst, dass Fahrzeug und Unterlagen vor Ort geprüft wurden.');return}
    setBusy(true);setError(null);
    try{
      const result=await createVerifiedVehicleTransferToken(workshopId,vin);
      const nextUrl=claimUrl(result.token);
      setUrl(nextUrl);
      setQr(await QRCode.toDataURL(nextUrl,{width:320,margin:2,errorCorrectionLevel:'M'}));
      setVehicle({make:result.make,model:result.model,variant:result.variant,licensePlate:result.licensePlate,expiresAt:result.expiresAt});
    }catch(err){setError(err instanceof Error?err.message:'Besitzerwechsel konnte nicht geprüft werden.')}
    finally{setBusy(false)}
  };

  return <div className="modal-backdrop" onMouseDown={()=>{if(!busy)onClose()}}>
    <section className="workflow-modal vehicle-transfer-verify-modal" onMouseDown={event=>event.stopPropagation()}>
      <header><div className="modal-icon"><ShieldCheck/></div><div><span>BESITZERWECHSEL</span><h2>Fahrzeug vor Ort prüfen</h2><small>Für Fahrzeuge, die bereits in MotorAtlas existieren – unabhängig von der früheren Werkstatt.</small></div><button disabled={busy} onClick={onClose}><X/></button></header>
      {!qr?<div className="vehicle-transfer-verify-body">
        <div className="vehicle-identity-lock"><ShieldCheck/><div><b>Nur nach echter Vor-Ort-Prüfung</b><span>FIN am Fahrzeug und geeignete Fahrzeug-/Erwerbsunterlagen müssen mit dem vorgeführten Fahrzeug übereinstimmen. MotorAtlas überträgt keine personenbezogenen Daten des Vorbesitzers.</span></div></div>
        <label><span>FIN / VIN</span><input value={vin} onChange={e=>setVin(e.target.value.toUpperCase().replace(/\s/g,''))} maxLength={17} placeholder="17-stellige FIN"/></label>
        <label className="modal-check-row"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/><span><b>Fahrzeug und Unterlagen wurden vor Ort geprüft</b><small>Mit dieser Bestätigung wird die Prüfung mit Werkstatt, Mitarbeiter und Zeitpunkt protokolliert.</small></span></label>
        {error&&<div className="modal-error">{error}</div>}
        <div className="modal-actions"><button type="button" className="btn secondary" onClick={onClose}>Abbrechen</button><button type="button" className="btn primary" disabled={busy||!confirmed} onClick={()=>void generate()}>{busy?'Prüft …':'Prüfen & QR-Code erzeugen'}</button></div>
      </div>:<div className="vehicle-claim-code">
        <img src={qr} alt="QR-Code für geprüften Besitzerwechsel"/>
        <b>{vehicle?.make} {vehicle?.model} {vehicle?.variant||''}</b>
        <span>{vehicle?.licensePlate}</span>
        <small>Gültig bis {vehicle&&new Date(vehicle.expiresAt).toLocaleString('de-DE',{dateStyle:'medium',timeStyle:'short'})}</small>
        <button className="btn secondary" onClick={()=>window.print()}>Drucken</button>
        <button className="btn secondary" onClick={()=>navigator.clipboard?.writeText(url)}>Link kopieren</button>
      </div>}
    </section>
  </div>;
}

function WalkInOrderModal({open,onClose,item,workshopId,onDone}:{
  open:boolean;onClose:()=>void;item:WorkshopCustomerDirectoryItem;workshopId:string;onDone:(workOrderId:string)=>Promise<void>|void;
}){
  const [problem,setProblem]=useState('');
  const [workflow,setWorkflow]=useState<ServiceRequestIntent>('diagnosis_then_quote');
  const [invoiceRequired,setInvoiceRequired]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);

  useEffect(()=>{if(open){setProblem('');setWorkflow('diagnosis_then_quote');setInvoiceRequired(true);setError(null)}},[open,item.vehicleId]);
  if(!open)return null;

  const submit=async(e:React.FormEvent)=>{
    e.preventDefault();
    if(!problem.trim()){setError('Bitte Problem oder gewünschten Arbeitsumfang eintragen.');return}
    setBusy(true);setError(null);
    try{
      const order:any=await createWalkInWorkOrder({
        workshopId,vehicleId:item.vehicleId,customerId:item.customerId??null,problem,workflowPath:workflow,invoiceRequired
      });
      await onDone(order.id);
    }catch(err){setError(err instanceof Error?err.message:'Auftrag konnte nicht angelegt werden.')}
    finally{setBusy(false)}
  };

  return <div className="modal-backdrop" onMouseDown={()=>{if(!busy)onClose()}}>
    <section className="workflow-modal walk-in-order-modal" onMouseDown={e=>e.stopPropagation()}>
      <header><div className="modal-icon"><Car/></div><div><span>NEUER WERKSTATTAUFTRAG</span><h2>Fahrzeug ist jetzt eingetroffen</h2><small>{item.customerName} · {item.make} {item.model} · {item.licensePlate}</small></div><button disabled={busy} onClick={onClose}><X/></button></header>
      <div className="vehicle-identity-lock"><ShieldCheck/><div><b>Nur bei tatsächlich anwesendem Fahrzeug</b><span>Mit dem Speichern wird das Fahrzeug direkt als „eingetroffen“ erfasst und erscheint im Werkstattablauf.</span></div></div>
      <form onSubmit={submit}>
        <label><span>Problem / Auftrag</span><textarea rows={4} value={problem} onChange={e=>setProblem(e.target.value)} placeholder="z. B. Kunde meldet Geräusch vorne rechts / Ölwechsel durchführen" required/></label>
        <label><span>Ablauf</span><select value={workflow} onChange={e=>setWorkflow(e.target.value as ServiceRequestIntent)}>
          <option value="diagnosis_then_quote">Diagnose → Kostenvoranschlag</option>
          <option value="diagnosis_then_decide">Diagnose → Entscheidung</option>
          <option value="diagnosis_only">Nur Diagnose / Prüfung</option>
          <option value="direct_work">Direktauftrag / Arbeit freigegeben</option>
          <option value="quote_before_work">Kostenvoranschlag vor Arbeit</option>
        </select></label>
        <label className="modal-check-row"><input type="checkbox" checked={invoiceRequired} onChange={e=>setInvoiceRequired(e.target.checked)}/><span><b>Rechnung vorgesehen</b><small>Kann später bei tatsächlich kostenlosem Auftrag auf „Keine Kosten entstanden“ gesetzt werden.</small></span></label>
        {error&&<div className="modal-error">{error}</div>}
        <div className="modal-actions"><button type="button" className="btn secondary" disabled={busy} onClick={onClose}>Abbrechen</button><button className="btn primary" disabled={busy}>{busy?'Auftrag wird angelegt …':'Auftrag anlegen & einchecken'}</button></div>
      </form>
    </section>
  </div>;
}

function VehicleClaimQrModal({open,onClose,item,workshopId}:{open:boolean;onClose:()=>void;item:WorkshopCustomerDirectoryItem;workshopId:string}){
  const [mode,setMode]=useState<'onboarding'|'transfer'>('onboarding');
  const [qr,setQr]=useState<string|null>(null);
  const [url,setUrl]=useState('');
  const [expires,setExpires]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);

  useEffect(()=>{if(open){setMode(item.ownerUserId?'transfer':'onboarding');setQr(null);setUrl('');setExpires(null);setError(null)}},[open,item.vehicleId]);

  if(!open)return null;

  const generate=async()=>{
    setBusy(true);setError(null);
    try{
      const result=await createVehicleClaimToken({
        vehicleId:item.vehicleId,workshopId,customerId:mode==='onboarding'?item.customerId??null:null,claimMode:mode
      });
      const nextUrl=claimUrl(result.token);
      setUrl(nextUrl);setExpires(result.expiresAt);
      setQr(await QRCode.toDataURL(nextUrl,{width:320,margin:2,errorCorrectionLevel:'M'}));
    }catch(err){setError(err instanceof Error?err.message:'QR-Code konnte nicht erzeugt werden.')}
    finally{setBusy(false)}
  };

  return <div className="modal-backdrop" onMouseDown={()=>{if(!busy)onClose()}}>
    <section className="workflow-modal vehicle-claim-modal" onMouseDown={event=>event.stopPropagation()}>
      <header><div className="modal-icon"><QrCode/></div><div><span>FAHRZEUG ÜBERNEHMEN</span><h2>Sicherer Einmal-QR-Code</h2><small>{item.make} {item.model} · {item.licensePlate}</small></div><button disabled={busy} onClick={onClose}><X/></button></header>

      <div className="vehicle-claim-mode">
        <button className={mode==='onboarding'?'active':''} disabled={Boolean(item.ownerUserId)} onClick={()=>{setMode('onboarding');setQr(null)}}><UserRound/><span><b>Dieser Kunde registriert sich</b><small>Werkstatt-Kundenakte wird mit seinem neuen MotorAtlas-Konto verbunden.</small></span></button>
        <button className={mode==='transfer'?'active':''} onClick={()=>{setMode('transfer');setQr(null)}}><Car/><span><b>Neuer Fahrzeugbesitzer</b><small>Nur das Fahrzeug wird übernommen. Daten des bisherigen Kunden werden nicht übertragen.</small></span></button>
      </div>

      <div className="vehicle-claim-privacy"><ShieldCheck/><p>Im QR-Code steckt weder FIN noch Name noch Adresse, sondern nur ein zufälliger Einmal-Schlüssel. Er ist 14 Tage gültig und wird nach der Übernahme unbrauchbar.</p></div>

      {!qr?<button className="btn primary full" disabled={busy} onClick={()=>void generate()}>{busy?'QR-Code wird erzeugt …':'QR-Code erzeugen'}</button>:<div className="vehicle-claim-code">
        <img src={qr} alt="QR-Code zur Fahrzeugübernahme"/>
        <b>{item.make} {item.model}</b><span>{item.licensePlate}</span>
        {expires&&<small>Gültig bis {new Date(expires).toLocaleString('de-DE',{dateStyle:'medium',timeStyle:'short'})}</small>}
        <button className="btn secondary" onClick={()=>window.print()}>Drucken</button>
        <button className="btn secondary" onClick={()=>navigator.clipboard?.writeText(url)}>Link kopieren</button>
      </div>}
      {error&&<div className="modal-error">{error}</div>}
    </section>
  </div>;
}

function HistoryEntryModal({open,onClose,item,workshopId,onDone}:{open:boolean;onClose:()=>void;item:WorkshopCustomerDirectoryItem;workshopId:string;onDone:()=>Promise<void>|void}){
  const [type,setType]=useState<VehicleHistoryEntry['entryType']>('service');
  const [title,setTitle]=useState('');
  const [summary,setSummary]=useState('');
  const [mileage,setMileage]=useState(item.mileage!=null?String(item.mileage):'');
  const [date,setDate]=useState(()=>new Date().toISOString().slice(0,10));
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  useEffect(()=>{if(open){setMileage(item.mileage!=null?String(item.mileage):'');setDate(new Date().toISOString().slice(0,10));setError(null)}},[open,item.vehicleId]);
  if(!open)return null;
  const submit=async(e:React.FormEvent)=>{
    e.preventDefault();if(!title.trim())return;
    setBusy(true);setError(null);
    try{
      await addVehicleHistoryEntry({vehicleId:item.vehicleId,workshopId,entryType:type,title,summary,mileage:parseNumber(mileage),occurredAt:new Date(date+'T12:00:00').toISOString()});
      await onDone();onClose();setTitle('');setSummary('');
    }catch(err){setError(err instanceof Error?err.message:'Historieneintrag konnte nicht gespeichert werden.')}
    finally{setBusy(false)}
  };
  return <div className="modal-backdrop" onMouseDown={()=>{if(!busy)onClose()}}><section className="workflow-modal" onMouseDown={e=>e.stopPropagation()}>
    <header><div className="modal-icon"><FileClock/></div><div><span>FAHRZEUGHISTORIE</span><h2>Eintrag ergänzen</h2><small>{item.make} {item.model} · {item.licensePlate}</small></div><button onClick={onClose}><X/></button></header>
    <form onSubmit={submit}>
      <div className="form-two"><label><span>Art</span><select value={type} onChange={e=>setType(e.target.value as VehicleHistoryEntry['entryType'])}><option value="service">Service</option><option value="maintenance">Wartung</option><option value="repair">Reparatur</option><option value="inspection">Prüfung</option><option value="diagnosis">Diagnose</option><option value="note">Hinweis</option></select></label><label><span>Datum</span><input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label></div>
      <label><span>Was wurde gemacht?</span><input value={title} onChange={e=>setTitle(e.target.value)} required placeholder="z. B. Öl- und Filterwechsel"/></label>
      <label><span>Details</span><textarea value={summary} onChange={e=>setSummary(e.target.value)} rows={4} placeholder="Arbeiten, Teile oder wichtige Hinweise …"/></label>
      <label><span>Kilometerstand</span><input inputMode="numeric" value={mileage} onChange={e=>setMileage(e.target.value.replace(/\D/g,''))}/></label>
      {error&&<div className="modal-error">{error}</div>}
      <div className="modal-actions"><button type="button" className="btn secondary" onClick={onClose}>Abbrechen</button><button className="btn primary" disabled={busy}>{busy?'Speichert …':'Historie speichern'}</button></div>
    </form>
  </section></div>;
}

function WorkshopCustomerCreateModal({open,onClose,workshopId,onDone}:{open:boolean;onClose:()=>void;workshopId:string;onDone:(vehicleId:string)=>Promise<void>|void}){
  const [fullName,setFullName]=useState('');const [phone,setPhone]=useState('');const [email,setEmail]=useState('');
  const [street,setStreet]=useState('');const [postalCode,setPostalCode]=useState('');const [city,setCity]=useState('');
  const [make,setMake]=useState('');const [model,setModel]=useState('');const [variant,setVariant]=useState('');
  const [firstRegistration,setFirstRegistration]=useState('');const [licensePlate,setLicensePlate]=useState('');
  const [hsn,setHsn]=useState('');const [tsn,setTsn]=useState('');const [vin,setVin]=useState('');const [mileage,setMileage]=useState('');
  const [engineCode,setEngineCode]=useState('');const [typeVariantVersion,setTypeVariantVersion]=useState('');
  const [displacement,setDisplacement]=useState('');const [powerKw,setPowerKw]=useState('');const [fuelType,setFuelType]=useState('');
  const [transmissionCode,setTransmissionCode]=useState('');const [driveType,setDriveType]=useState('');
  const [busy,setBusy]=useState(false);const [error,setError]=useState<string|null>(null);
  if(!open)return null;
  const submit=async(e:React.FormEvent)=>{
    e.preventDefault();setBusy(true);setError(null);
    try{
      const result=await createWorkshopCustomerVehicle({
        workshopId,fullName,phone,email,street,postalCode,city,make,model,variant,firstRegistration,licensePlate,hsn,tsn,vin,
        mileage:parseNumber(mileage),engineCode,typeVariantVersion,displacementCcm:parseNumber(displacement),powerKw:parseNumber(powerKw),
        fuelType,transmissionCode,driveType
      });
      await onDone(result.vehicle_id);
    }catch(err){setError(err instanceof Error?err.message:'Kunde und Fahrzeug konnten nicht angelegt werden.')}
    finally{setBusy(false)}
  };
  return <div className="modal-backdrop" onMouseDown={()=>{if(!busy)onClose()}}><section className="workflow-modal workshop-customer-create-modal" onMouseDown={e=>e.stopPropagation()}>
    <header><div className="modal-icon"><UserRound/></div><div><span>WERKSTATTKUNDE</span><h2>Kunde + Fahrzeug anlegen</h2><small>Der Kunde braucht dafür kein MotorAtlas-Konto.</small></div><button disabled={busy} onClick={onClose}><X/></button></header>
    <form onSubmit={submit}>
      <h3>Kundendaten</h3>
      <div className="form-two"><label><span>Name</span><input value={fullName} onChange={e=>setFullName(e.target.value)} required/></label><label><span>Telefon</span><input value={phone} onChange={e=>setPhone(e.target.value)}/></label></div>
      <label><span>E-Mail optional</span><input type="email" value={email} onChange={e=>setEmail(e.target.value)}/></label>
      <div className="form-two"><label><span>Straße</span><input value={street} onChange={e=>setStreet(e.target.value)}/></label><label><span>PLZ / Ort</span><div className="inline-fields"><input value={postalCode} onChange={e=>setPostalCode(e.target.value.replace(/\D/g,''))}/><input value={city} onChange={e=>setCity(e.target.value)}/></div></label></div>

      <h3>Fahrzeug</h3>
      <div className="form-two"><label><span>Hersteller</span><input value={make} onChange={e=>setMake(e.target.value)} required/></label><label><span>Modell</span><input value={model} onChange={e=>setModel(e.target.value)} required/></label></div>
      <div className="form-two"><label><span>Variante / Motorisierung</span><input value={variant} onChange={e=>setVariant(e.target.value)}/></label><label><span>Kennzeichen</span><input value={licensePlate} onChange={e=>setLicensePlate(e.target.value.toUpperCase())} required/></label></div>
      <div className="form-two"><label><span>Erstzulassung</span><input type="date" value={firstRegistration} onChange={e=>setFirstRegistration(e.target.value)}/></label><label><span>Kilometerstand</span><input inputMode="numeric" value={mileage} onChange={e=>setMileage(e.target.value.replace(/\D/g,''))}/></label></div>
      <div className="form-two"><label><span>HSN / TSN</span><div className="inline-fields"><input value={hsn} onChange={e=>setHsn(e.target.value.replace(/\D/g,''))}/><input value={tsn} onChange={e=>setTsn(e.target.value.toUpperCase())}/></div></label><label><span>FIN / VIN</span><input value={vin} onChange={e=>setVin(e.target.value.toUpperCase().replace(/\s/g,''))} maxLength={17}/></label></div>
      <div className="form-two"><label><span>D.2 Typ / Variante / Version</span><input value={typeVariantVersion} onChange={e=>setTypeVariantVersion(e.target.value)}/></label><label><span>Motorcode</span><input value={engineCode} onChange={e=>setEngineCode(e.target.value.toUpperCase())}/></label></div>
      <div className="form-three"><label><span>Hubraum cm³</span><input value={displacement} onChange={e=>setDisplacement(e.target.value.replace(/\D/g,''))}/></label><label><span>Leistung kW</span><input value={powerKw} onChange={e=>setPowerKw(e.target.value.replace(/\D/g,''))}/></label><label><span>Kraftstoff</span><input value={fuelType} onChange={e=>setFuelType(e.target.value)}/></label></div>
      <div className="form-two"><label><span>Getriebecode</span><input value={transmissionCode} onChange={e=>setTransmissionCode(e.target.value.toUpperCase())}/></label><label><span>Antrieb</span><input value={driveType} onChange={e=>setDriveType(e.target.value)}/></label></div>
      {error&&<div className="modal-error">{error}</div>}
      <div className="modal-actions"><button type="button" className="btn secondary" disabled={busy} onClick={onClose}>Abbrechen</button><button className="btn primary" disabled={busy}>{busy?'Wird angelegt …':'Kunde + Fahrzeug speichern'}</button></div>
    </form>
  </section></div>;
}
