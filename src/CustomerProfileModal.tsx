import { useEffect, useState } from 'react';
import { MapPin, Phone, UserRound, X } from 'lucide-react';
import { getMyProfile, updateMyProfile, type CustomerProfile } from './api';

export function CustomerProfileModal({
  open,onClose,onSaved
}:{open:boolean;onClose:()=>void;onSaved?:()=>Promise<void>|void}){
  const [profile,setProfile]=useState<CustomerProfile|null>(null);
  const [fullName,setFullName]=useState('');
  const [phone,setPhone]=useState('');
  const [street,setStreet]=useState('');
  const [postalCode,setPostalCode]=useState('');
  const [city,setCity]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');

  useEffect(()=>{
    if(!open)return;
    let cancelled=false;
    setBusy(true);setError('');
    getMyProfile().then(data=>{
      if(cancelled)return;
      setProfile(data);
      setFullName(data.fullName??'');
      setPhone(data.phone??'');
      setStreet(data.street??'');
      setPostalCode(data.postalCode??'');
      setCity(data.city??'');
    }).catch(err=>!cancelled&&setError(err instanceof Error?err.message:'Kundendaten konnten nicht geladen werden.'))
      .finally(()=>!cancelled&&setBusy(false));
    return()=>{cancelled=true};
  },[open]);

  if(!open)return null;

  const save=async(event:React.FormEvent)=>{
    event.preventDefault();
    if(!fullName.trim()||!phone.trim()||!street.trim()||!postalCode.trim()||!city.trim()){
      setError('Bitte Name, Telefonnummer und vollständige Anschrift eintragen.');
      return;
    }
    setBusy(true);setError('');
    try{
      await updateMyProfile({fullName,phone,street,postalCode,city});
      await onSaved?.();
      onClose();
    }catch(err){setError(err instanceof Error?err.message:'Kundendaten konnten nicht gespeichert werden.')}
    finally{setBusy(false)}
  };

  return <div className="modal-backdrop" onMouseDown={onClose}>
    <section className="workflow-modal customer-profile-modal" onMouseDown={event=>event.stopPropagation()}>
      <header>
        <div className="modal-icon"><UserRound/></div>
        <div><span>KUNDENDATEN</span><h2>Meine Kontaktdaten</h2><small>Diese Daten sieht deine freigegebene Werkstatt am Fahrzeug und Termin.</small></div>
        <button onClick={onClose} aria-label="Schließen"><X/></button>
      </header>
      <form onSubmit={save}>
        <label><span>Vor- und Nachname</span><input value={fullName} onChange={e=>setFullName(e.target.value)} required/></label>
        <label><span><Phone size={14}/> Telefonnummer</span><input type="tel" value={phone} onChange={e=>setPhone(e.target.value)} required placeholder="+49 170 1234567"/></label>
        <label><span><MapPin size={14}/> Straße & Hausnummer</span><input value={street} onChange={e=>setStreet(e.target.value)} required/></label>
        <div className="form-two">
          <label><span>PLZ</span><input inputMode="numeric" maxLength={5} value={postalCode} onChange={e=>setPostalCode(e.target.value.replace(/\D/g,''))} required/></label>
          <label><span>Ort</span><input value={city} onChange={e=>setCity(e.target.value)} required/></label>
        </div>
        {profile&&!profile.phone&&<div className="profile-contact-note">Bitte ergänze deine Telefonnummer. Die Werkstatt kann dich dann bei Termin- oder Rückfragen direkt erreichen.</div>}
        {error&&<div className="modal-error">{error}</div>}
        <div className="modal-actions"><button type="button" className="btn secondary" onClick={onClose}>Abbrechen</button><button className="btn primary" disabled={busy}>{busy?'Speichert …':'Daten speichern'}</button></div>
      </form>
    </section>
  </div>;
}
