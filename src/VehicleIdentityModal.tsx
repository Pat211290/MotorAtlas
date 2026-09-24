import { useEffect, useState } from 'react';
import { Car, ShieldCheck, X } from 'lucide-react';
import { updateVehicleIdentityAsWorkshop, type LiveJob } from './api';

export function VehicleIdentityModal({
  open,onClose,onDone,job
}:{
  open:boolean;onClose:()=>void;onDone:()=>Promise<void>|void;
  job:(Partial<LiveJob>&{id:string;vehicle:string;plate:string;orderNumber?:string|null})|null;
}){
  const [make,setMake]=useState('');
  const [model,setModel]=useState('');
  const [variant,setVariant]=useState('');
  const [firstRegistration,setFirstRegistration]=useState('');
  const [licensePlate,setLicensePlate]=useState('');
  const [hsn,setHsn]=useState('');
  const [tsn,setTsn]=useState('');
  const [vin,setVin]=useState('');
  const [mileage,setMileage]=useState('');
  const [typeVariantVersion,setTypeVariantVersion]=useState('');
  const [engineCode,setEngineCode]=useState('');
  const [displacement,setDisplacement]=useState('');
  const [powerKw,setPowerKw]=useState('');
  const [fuelType,setFuelType]=useState('');
  const [transmissionCode,setTransmissionCode]=useState('');
  const [driveType,setDriveType]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);

  useEffect(()=>{
    if(!open||!job)return;
    setMake(job.make??job.vehicle.split(' ')[0]??'');
    setModel(job.model??'');
    setVariant(job.variant??'');
    setFirstRegistration(job.firstRegistration??'');
    setLicensePlate(job.plate??'');
    setHsn(job.hsn??'');
    setTsn(job.tsn??'');
    setVin(job.vin??'');
    setMileage(job.mileage!=null?String(job.mileage):'');
    setTypeVariantVersion(job.typeVariantVersion??'');
    setEngineCode(job.engineCode??'');
    setDisplacement(job.displacementCcm!=null?String(job.displacementCcm):'');
    setPowerKw(job.powerKw!=null?String(job.powerKw):'');
    setFuelType(job.fuelType??'');
    setTransmissionCode(job.transmissionCode??'');
    setDriveType(job.driveType??'');
    setError(null);
  },[open,job]);

  if(!open||!job)return null;

  const numberValue=(value:string)=>{
    if(!value.trim())return null;
    const n=Number(value);
    return Number.isFinite(n)?Math.round(n):null;
  };

  const submit=async(event:React.FormEvent)=>{
    event.preventDefault();
    if(!job.vehicleId){setError('Die Fahrzeug-ID fehlt. Bitte den Live-Auftrag neu laden.');return}
    if(!make.trim()||!model.trim()||!licensePlate.trim()){
      setError('Hersteller, Modell und Kennzeichen sind erforderlich.');
      return;
    }
    const km=numberValue(mileage);
    const ccm=numberValue(displacement);
    const kw=numberValue(powerKw);
    if(mileage.trim()&&km==null){setError('Kilometerstand ist ungültig.');return}
    if(displacement.trim()&&ccm==null){setError('Hubraum ist ungültig.');return}
    if(powerKw.trim()&&kw==null){setError('Leistung ist ungültig.');return}

    setBusy(true);setError(null);
    try{
      await updateVehicleIdentityAsWorkshop({
        vehicleId:job.vehicleId,workOrderId:job.id,make,model,variant,firstRegistration:firstRegistration||null,
        licensePlate,hsn,tsn,vin,mileage:km,typeVariantVersion,engineCode,displacementCcm:ccm,powerKw:kw,
        fuelType,transmissionCode,driveType
      });
      await onDone();
      onClose();
    }catch(err){
      setError(err instanceof Error?err.message:'Fahrzeugdaten konnten nicht gespeichert werden.');
    }finally{setBusy(false)}
  };

  return <div className="modal-backdrop" onMouseDown={()=>{if(!busy)onClose()}}>
    <section className="workflow-modal vehicle-identity-modal" onMouseDown={event=>event.stopPropagation()}>
      <header>
        <div className="modal-icon"><Car/></div>
        <div><span>FAHRZEUGIDENTITÄT</span><h2>Fahrzeugdaten prüfen & ergänzen</h2><small>{job.vehicle} · {job.plate} · Auftrag #{job.orderNumber}</small></div>
        <button disabled={busy} onClick={onClose} aria-label="Schließen"><X/></button>
      </header>

      <div className="vehicle-identity-lock">
        <ShieldCheck/>
        <div><b>Werkstattgeschützt</b><span>Diese Daten können nur von einer autorisierten Werkstatt geändert werden, solange das Fahrzeug eingecheckt und tatsächlich in der Werkstatt ist. Jede Änderung wird protokolliert.</span></div>
      </div>

      <form onSubmit={submit}>
        <div className="form-two">
          <label><span>Hersteller</span><input value={make} onChange={e=>setMake(e.target.value)} required/></label>
          <label><span>Modell</span><input value={model} onChange={e=>setModel(e.target.value)} required/></label>
        </div>
        <div className="form-two">
          <label><span>Variante / Motorisierung</span><input value={variant} onChange={e=>setVariant(e.target.value)} placeholder="z. B. 3.0i"/></label>
          <label><span>Typ / Variante / Version <small>Feld D.2</small></span><input value={typeVariantVersion} onChange={e=>setTypeVariantVersion(e.target.value)} placeholder="D.2 aus Fahrzeugschein"/></label>
        </div>
        <div className="form-two">
          <label><span>Kennzeichen</span><input value={licensePlate} onChange={e=>setLicensePlate(e.target.value.toUpperCase())} required/></label>
          <label><span>Erstzulassung</span><input type="date" value={firstRegistration} onChange={e=>setFirstRegistration(e.target.value)}/></label>
        </div>
        <div className="form-two">
          <label><span>HSN <small>2.1</small></span><input value={hsn} onChange={e=>setHsn(e.target.value.replace(/\D/g,''))} maxLength={4} inputMode="numeric"/></label>
          <label><span>TSN <small>2.2</small></span><input value={tsn} onChange={e=>setTsn(e.target.value.toUpperCase().replace(/\s/g,''))}/></label>
        </div>
        <label><span>FIN / VIN <small>Feld E</small></span><input value={vin} onChange={e=>setVin(e.target.value.toUpperCase().replace(/\s/g,''))} maxLength={17}/></label>
        <div className="form-three vehicle-technical-grid">
          <label><span>Motorcode</span><input value={engineCode} onChange={e=>setEngineCode(e.target.value.toUpperCase())} placeholder="z. B. M54B30"/></label>
          <label><span>Hubraum cm³</span><input inputMode="numeric" value={displacement} onChange={e=>setDisplacement(e.target.value.replace(/\D/g,''))} placeholder="2979"/></label>
          <label><span>Leistung kW</span><input inputMode="numeric" value={powerKw} onChange={e=>setPowerKw(e.target.value.replace(/\D/g,''))} placeholder="170"/></label>
        </div>
        <div className="form-three vehicle-technical-grid">
          <label><span>Kraftstoff</span><input value={fuelType} onChange={e=>setFuelType(e.target.value)} placeholder="Benzin"/></label>
          <label><span>Getriebecode</span><input value={transmissionCode} onChange={e=>setTransmissionCode(e.target.value.toUpperCase())} placeholder="z. B. 5L40E"/></label>
          <label><span>Antrieb</span><input value={driveType} onChange={e=>setDriveType(e.target.value)} placeholder="z. B. Allrad"/></label>
        </div>
        <label><span>Kilometerstand</span><input inputMode="numeric" value={mileage} onChange={e=>setMileage(e.target.value.replace(/\D/g,''))}/></label>

        {error&&<div className="modal-error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn secondary" disabled={busy} onClick={onClose}>Abbrechen</button>
          <button className="btn primary" disabled={busy}>{busy?'Speichert …':'Fahrzeugdaten speichern'}</button>
        </div>
      </form>
    </section>
  </div>;
}
