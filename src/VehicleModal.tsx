import { useEffect, useMemo, useState } from 'react';
import { Camera, Car, X } from 'lucide-react';
import { createVehicleWithPhoto, getVehicleImageUrl } from './api';

export function VehicleCreateModal({open,onClose,onDone}:{open:boolean;onClose:()=>void;onDone:()=>Promise<void>|void}){
  const [make,setMake]=useState('');const [model,setModel]=useState('');const [variant,setVariant]=useState('');
  const [firstRegistration,setFirstRegistration]=useState('');const [licensePlate,setLicensePlate]=useState('');
  const [hsn,setHsn]=useState('');const [tsn,setTsn]=useState('');const [vin,setVin]=useState('');const [mileage,setMileage]=useState('');
  const [photo,setPhoto]=useState<File|null>(null);const [busy,setBusy]=useState(false);const [error,setError]=useState<string|null>(null);
  const preview=useMemo(()=>photo?URL.createObjectURL(photo):null,[photo]);
  useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview)},[preview]);
  if(!open)return null;
  const submit=async(event:React.FormEvent)=>{
    event.preventDefault();
    if(!photo){setError('Zu jedem Fahrzeug ist ein Fahrzeugbild erforderlich.');return}
    const km=mileage.trim()?Number(mileage):undefined;
    if(km!=null&&(!Number.isFinite(km)||km<0)){setError('Kilometerstand ist ungültig.');return}
    setBusy(true);setError(null);
    try{
      await createVehicleWithPhoto({make,model,variant,firstRegistration,licensePlate,hsn,tsn,vin,mileage:km,photo});
      await onDone();
      setMake('');setModel('');setVariant('');setFirstRegistration('');setLicensePlate('');setHsn('');setTsn('');setVin('');setMileage('');setPhoto(null);
      onClose();
    }catch(err){setError(err instanceof Error?err.message:'Fahrzeug konnte nicht gespeichert werden.')}
    finally{setBusy(false)}
  };
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="workflow-modal vehicle-modal" onMouseDown={e=>e.stopPropagation()}>
    <header><div className="modal-icon"><Car/></div><div><span>MEINE GARAGE</span><h2>Fahrzeug hinzufügen</h2></div><button onClick={onClose} aria-label="Schließen"><X/></button></header>
    <form onSubmit={submit}>
      <label className="vehicle-photo-upload">
        <input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>setPhoto(e.target.files?.[0]??null)} required/>
        {preview?<img src={preview} alt="Fahrzeugvorschau"/>:<><Camera/><b>Fahrzeugbild aufnehmen oder auswählen</b><span>Pflichtangabe · JPG, PNG oder WebP</span></>}
      </label>
      <div className="form-two"><label><span>Hersteller</span><input value={make} onChange={e=>setMake(e.target.value)} placeholder="BMW" required/></label><label><span>Modell</span><input value={model} onChange={e=>setModel(e.target.value)} placeholder="X3" required/></label></div>
      <div className="form-two"><label><span>Variante / Motorisierung</span><input value={variant} onChange={e=>setVariant(e.target.value)} placeholder="3.0i"/></label><label><span>Erstzulassung</span><input type="date" value={firstRegistration} onChange={e=>setFirstRegistration(e.target.value)}/></label></div>
      <div className="form-two"><label><span>Kennzeichen</span><input value={licensePlate} onChange={e=>setLicensePlate(e.target.value.toUpperCase())} placeholder="SAD XX 123" required/></label><label><span>Kilometerstand</span><input inputMode="numeric" value={mileage} onChange={e=>setMileage(e.target.value.replace(/\D/g,''))} placeholder="247318"/></label></div>
      <div className="form-two"><label><span>HSN</span><input value={hsn} onChange={e=>setHsn(e.target.value)} maxLength={4} placeholder="0005"/></label><label><span>TSN</span><input value={tsn} onChange={e=>setTsn(e.target.value.toUpperCase())} placeholder="ABC"/></label></div>
      <label><span>VIN / Fahrgestellnummer</span><input value={vin} onChange={e=>setVin(e.target.value.toUpperCase().replace(/\s/g,''))} maxLength={17} placeholder="WBA…"/></label>
      {error&&<div className="modal-error">{error}</div>}
      <div className="modal-actions"><button type="button" className="btn secondary" onClick={onClose}>Abbrechen</button><button className="btn primary" disabled={busy||!photo}>{busy?'Fahrzeug wird gespeichert …':'Fahrzeug speichern'}</button></div>
    </form>
  </section></div>;
}

export function VehiclePhoto({path,alt}:{path?:string|null;alt:string}){
  const [url,setUrl]=useState<string|null>(null);
  useEffect(()=>{
    if(!path){setUrl(null);return}
    let cancelled=false;
    getVehicleImageUrl(path).then(value=>{if(!cancelled)setUrl(value)}).catch(()=>{if(!cancelled)setUrl(null)});
    return()=>{cancelled=true};
  },[path]);
  if(!url)return <div className="vehicle-photo-placeholder"><Car/></div>;
  return <img className="vehicle-photo-real" src={url} alt={alt}/>;
}
