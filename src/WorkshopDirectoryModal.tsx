import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Building2, CheckCircle2, MapPin, Search, ShieldCheck, X } from 'lucide-react';
import {
  geocodePublicWorkshop,getWorkshopLogoPublicUrl,hasWorkshopCoordinates,listPublicWorkshops,requestWorkshop,setPrimaryWorkshop,
  type CustomerWorkshop,type PublicWorkshop
} from './api';

export function WorkshopDirectoryModal({
  open,onClose,onChanged,relationships
}:{
  open:boolean;onClose:()=>void;onChanged:()=>Promise<void>|void;relationships:CustomerWorkshop[];
}){
  const [workshops,setWorkshops]=useState<PublicWorkshop[]>([]);
  const [query,setQuery]=useState('');
  const [selected,setSelected]=useState<string|null>(null);
  const [requested,setRequested]=useState<string[]>([]);
  const [busy,setBusy]=useState<string|null>(null);
  const [error,setError]=useState<string|null>(null);
  const mapEl=useRef<HTMLDivElement|null>(null);
  const mapRef=useRef<L.Map|null>(null);
  const markersRef=useRef<Map<string,L.Marker>>(new Map());

  useEffect(()=>{
    if(!open)return;
    let cancelled=false;
    listPublicWorkshops().then(data=>{if(!cancelled){setWorkshops(data);setError(null)}}).catch(err=>{if(!cancelled)setError(err instanceof Error?err.message:'Werkstätten konnten nicht geladen werden.')});
    return()=>{cancelled=true};
  },[open]);

  useEffect(()=>{
    if(!open)return;
    const missing=workshops.filter(workshop=>!hasWorkshopCoordinates(workshop));
    if(!missing.length)return;
    let cancelled=false;
    void(async()=>{
      for(let index=0;index<missing.length;index++){
        const workshop=missing[index];
        try{
          const coords=await geocodePublicWorkshop(workshop);
          if(cancelled)return;
          setWorkshops(current=>current.map(item=>item.id===workshop.id?{...item,latitude:coords.latitude,longitude:coords.longitude}:item));
        }catch{}
        if(index<missing.length-1)await new Promise(resolve=>setTimeout(resolve,1100));
      }
    })();
    return()=>{cancelled=true};
  },[open,workshops.length]);

  const filtered=useMemo(()=>{
    const needle=query.trim().toLocaleLowerCase('de-DE');
    if(!needle)return workshops;
    return workshops.filter(w=>[w.name,w.city,w.postal_code,w.street].some(value=>String(value??'').toLocaleLowerCase('de-DE').includes(needle)));
  },[workshops,query]);

  useEffect(()=>{
    if(!open||!mapEl.current)return;
    if(!mapRef.current){
      const map=L.map(mapEl.current,{zoomControl:false,attributionControl:true}).setView([51.1657,10.4515],6);
      L.control.zoom({position:'bottomright'}).addTo(map);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
        maxZoom:19,
        attribution:'&copy; OpenStreetMap contributors'
      }).addTo(map);
      mapRef.current=map;
    }
    const map=mapRef.current;
    markersRef.current.forEach(marker=>marker.remove());markersRef.current.clear();
    filtered.forEach(workshop=>{
      if(!hasWorkshopCoordinates(workshop))return;
      const lat=Number(workshop.latitude),lng=Number(workshop.longitude);
      const marker=L.marker([lat,lng],{
        icon:L.divIcon({className:'motoratlas-map-marker',html:'<span></span>',iconSize:[30,38],iconAnchor:[15,35]})
      }).addTo(map);
      marker.bindTooltip(workshop.name,{direction:'top',offset:[0,-28]});
      marker.on('click',()=>{setSelected(workshop.id)});
      markersRef.current.set(workshop.id,marker);
    });
    setTimeout(()=>map.invalidateSize(),60);
  },[open,filtered]);

  useEffect(()=>()=>{mapRef.current?.remove();mapRef.current=null;markersRef.current.clear()},[]);

  if(!open)return null;

  const relationFor=(id:string)=>relationships.find(item=>item.workshopId===id);
  const choose=async(workshop:PublicWorkshop)=>{
    const relation=relationFor(workshop.id);
    if(relation?.isPrimary)return;
    setBusy(workshop.id);setError(null);
    try{
      if(relation){
        await setPrimaryWorkshop(workshop.id);
      }else{
        await requestWorkshop(workshop.id,'Ich möchte diese Werkstatt über MotorAtlas als Werkstatt nutzen.');
        setRequested(value=>value.includes(workshop.id)?value:[...value,workshop.id]);
      }
      await onChanged();
    }catch(err){setError(err instanceof Error?err.message:'Aktion konnte nicht ausgeführt werden.')}
    finally{setBusy(null)}
  };

  const focusWorkshop=(workshop:PublicWorkshop)=>{
    setSelected(workshop.id);
    if(hasWorkshopCoordinates(workshop)){
      const lat=Number(workshop.latitude),lng=Number(workshop.longitude);
      mapRef.current?.flyTo([lat,lng],12,{duration:.7});
    }
  };

  return <div className="directory-modal-backdrop">
    <section className="directory-modal">
      <header><div><span>DEUTSCHLANDWEIT</span><h2>Werkstatt finden</h2><p>Nur verifizierte MotorAtlas-Werkstätten werden öffentlich angezeigt.</p></div><button onClick={onClose} aria-label="Schließen"><X/></button></header>
      <div className="directory-shell">
        <aside className="directory-list">
          <div className="directory-search"><Search/><input autoFocus value={query} onChange={e=>setQuery(e.target.value)} placeholder="Werkstatt, PLZ oder Ort …"/></div>
          {error&&<div className="workspace-alert">{error}</div>}
          <div className="directory-results">
            {filtered.length?filtered.map(workshop=>{
              const relation=relationFor(workshop.id);
              const pending=requested.includes(workshop.id);
              const active=selected===workshop.id;
              return <article key={workshop.id} className={active?'active':''} onClick={()=>focusWorkshop(workshop)}>
                <div className="directory-logo">{workshop.logo_path?<img src={getWorkshopLogoPublicUrl(workshop.logo_path)} alt=""/>:<Building2/>}</div>
                <div className="directory-copy"><div><b>{workshop.name}</b><ShieldCheck/></div><small><MapPin/> {workshop.postal_code} {workshop.city}</small>{workshop.description&&<p>{workshop.description}</p>}<span className={workshop.accepts_new_customers?'accepting':'closed'}>{workshop.accepts_new_customers?'Nimmt neue Kunden an':'Aktuell keine Neukunden'}</span></div>
                <div className="directory-action" onClick={e=>e.stopPropagation()}>
                  {relation?.isPrimary?<span className="primary-workshop"><CheckCircle2/> Stammwerkstatt</span>:pending?<span className="pending-workshop">Anfrage gesendet</span>:<button className="btn primary small" disabled={busy===workshop.id||(!relation&&!workshop.accepts_new_customers)} onClick={()=>void choose(workshop)}>{busy===workshop.id?'Bitte warten …':relation?'Als Stammwerkstatt':'Aufnahme anfragen'}</button>}
                </div>
              </article>;
            }):<div className="directory-empty"><MapPin/><b>Keine Werkstatt gefunden.</b><span>Versuche einen anderen Ort oder eine andere PLZ.</span></div>}
          </div>
        </aside>
        <div className="directory-map-wrap"><div ref={mapEl} className="directory-map"/><div className="map-legend"><span><i/> Verifizierte MotorAtlas-Werkstatt</span><small>Fehlende Kartenpositionen werden automatisch aus der verifizierten Werkstattadresse ermittelt.</small></div></div>
      </div>
    </section>
  </div>;
}
