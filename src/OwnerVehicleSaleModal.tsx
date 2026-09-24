import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Archive, QrCode, ShieldCheck, X } from 'lucide-react';
import { archiveMyVehicle, createOwnerVehicleTransferToken, type CustomerVehicle } from './api';

function claimUrl(token:string){
  const configured=(import.meta.env.VITE_PUBLIC_APP_URL as string|undefined)?.trim()||'https://motoratlas.de/';
  const url=new URL(configured);
  url.search='';
  url.hash='/fahrzeug-uebernehmen?claim='+encodeURIComponent(token);
  return url.toString();
}

export function OwnerVehicleSaleModal({
  open,onClose,onDone,vehicle
}:{
  open:boolean;onClose:()=>void;onDone:()=>Promise<void>|void;vehicle:CustomerVehicle|null;
}){
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [qr,setQr]=useState<string|null>(null);
  const [url,setUrl]=useState('');
  const [expires,setExpires]=useState<string|null>(null);

  useEffect(()=>{if(open){setBusy(false);setError(null);setQr(null);setUrl('');setExpires(null)}},[open,vehicle?.id]);
  if(!open||!vehicle)return null;

  const releaseWithCode=async()=>{
    setBusy(true);setError(null);
    try{
      const result=await createOwnerVehicleTransferToken(vehicle.id);
      const nextUrl=claimUrl(result.token);
      setUrl(nextUrl);setExpires(result.expiresAt);
      setQr(await QRCode.toDataURL(nextUrl,{width:320,margin:2,errorCorrectionLevel:'M'}));
      await onDone();
    }catch(err){setError(err instanceof Error?err.message:'Fahrzeug konnte nicht zur Übergabe freigegeben werden.')}
    finally{setBusy(false)}
  };

  const archiveOnly=async()=>{
    setBusy(true);setError(null);
    try{
      await archiveMyVehicle(vehicle.id);
      await onDone();
      onClose();
    }catch(err){setError(err instanceof Error?err.message:'Fahrzeug konnte nicht aus der Garage entfernt werden.')}
    finally{setBusy(false)}
  };

  return <div className="modal-backdrop" onMouseDown={()=>{if(!busy)onClose()}}>
    <section className="workflow-modal owner-sale-modal" onMouseDown={event=>event.stopPropagation()}>
      <header><div className="modal-icon"><Archive/></div><div><span>FAHRZEUG VERKAUFT</span><h2>{vehicle.make} {vehicle.model}</h2><small>{vehicle.licensePlate}</small></div><button disabled={busy} onClick={onClose}><X/></button></header>

      {!qr?<>
        <div className="workflow-decision-note"><ShieldCheck/><p>Alte Aufträge, Rechnungen und persönliche Daten bleiben bei deinem Konto. Der neue Besitzer bekommt bei einer Übernahme nur die Fahrzeugakte und die neutrale technische Historie.</p></div>
        <div className="owner-sale-options">
          <button type="button" className="owner-sale-option primary" disabled={busy} onClick={()=>void releaseWithCode()}>
            <QrCode/><span><b>Verkauft · Übernahmecode erzeugen</b><small>MotorAtlas entfernt das Fahrzeug aus deiner aktiven Garage und erzeugt einen einmaligen QR-Code für den Käufer.</small></span>
          </button>
          <button type="button" className="owner-sale-option" disabled={busy} onClick={()=>void archiveOnly()}>
            <Archive/><span><b>Nur aus meiner Garage entfernen</b><small>Kein Übergabecode. Der spätere Käufer kann Werkstatt- oder Supportprüfung nutzen.</small></span>
          </button>
        </div>
      </>:<div className="vehicle-claim-code owner-sale-code">
        <div className="vehicle-support-submitted"><ShieldCheck/><div><b>Fahrzeug ist zur Übergabe freigegeben</b><span>Der Käufer kann diesen Einmal-QR-Code verwenden. Deine persönlichen Unterlagen werden nicht übertragen.</span></div></div>
        <img src={qr} alt="QR-Code für Fahrzeugübergabe"/>
        <b>{vehicle.make} {vehicle.model}</b><span>{vehicle.licensePlate}</span>
        {expires&&<small>Gültig bis {new Date(expires).toLocaleString('de-DE',{dateStyle:'medium',timeStyle:'short'})}</small>}
        <button className="btn secondary" onClick={()=>navigator.clipboard?.writeText(url)}>Link kopieren</button>
        <button className="btn secondary" onClick={()=>window.print()}>Drucken</button>
        <button className="btn primary" onClick={onClose}>Fertig</button>
      </div>}

      {error&&<div className="modal-error">{error}</div>}
    </section>
  </div>;
}
