import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  ArrowLeft, ArrowRight, Building2, CheckCircle2, MapPin, Search, ShieldCheck, Sparkles
} from 'lucide-react';
import { Brand, type AppView } from './components';
import { getWorkshopLogoPublicUrl, listPublicWorkshops, type PublicWorkshop } from './api';

function servicesOf(value:unknown){
  if(Array.isArray(value)) return value.filter(item=>typeof item==='string').slice(0,5) as string[];
  if(value&&typeof value==='object'){
    return Object.entries(value as Record<string,unknown>)
      .filter(([,enabled])=>Boolean(enabled))
      .map(([name])=>name)
      .slice(0,5);
  }
  return [] as string[];
}

export function WorkshopFinder({setView}:{setView:(view:AppView)=>void}){
  const [workshops,setWorkshops]=useState<PublicWorkshop[]>([]);
  const [query,setQuery]=useState('');
  const [acceptingOnly,setAcceptingOnly]=useState(false);
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const mapEl=useRef<HTMLDivElement|null>(null);
  const mapRef=useRef<L.Map|null>(null);
  const markersRef=useRef<Map<string,L.Marker>>(new Map());

  useEffect(()=>{
    let cancelled=false;
    setLoading(true);
    listPublicWorkshops()
      .then(data=>{
        if(cancelled)return;
        setWorkshops(data);
        setSelectedId(data[0]?.id??null);
        setError(null);
      })
      .catch(err=>!cancelled&&setError(err instanceof Error?err.message:'Werkstätten konnten nicht geladen werden.'))
      .finally(()=>!cancelled&&setLoading(false));
    return()=>{cancelled=true};
  },[]);

  const filtered=useMemo(()=>{
    const needle=query.trim().toLocaleLowerCase('de-DE');
    return workshops.filter(workshop=>{
      if(acceptingOnly&&!workshop.accepts_new_customers)return false;
      if(!needle)return true;
      const services=servicesOf(workshop.services);
      return [
        workshop.name,workshop.city,workshop.postal_code,workshop.street,workshop.description,...services
      ].some(value=>String(value??'').toLocaleLowerCase('de-DE').includes(needle));
    });
  },[workshops,query,acceptingOnly]);

  const selected=filtered.find(item=>item.id===selectedId)??filtered[0]??null;

  useEffect(()=>{
    if(!mapEl.current)return;
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
    markersRef.current.forEach(marker=>marker.remove());
    markersRef.current.clear();

    filtered.forEach(workshop=>{
      const lat=Number(workshop.latitude),lng=Number(workshop.longitude);
      if(!Number.isFinite(lat)||!Number.isFinite(lng))return;
      const active=workshop.id===selected?.id;
      const marker=L.marker([lat,lng],{
        icon:L.divIcon({
          className:'finder-marker',
          html:`<span class="${active?'active':''}"></span>`,
          iconSize:[34,42],
          iconAnchor:[17,39]
        })
      }).addTo(map);
      marker.bindTooltip(workshop.name,{direction:'top',offset:[0,-30]});
      marker.on('click',()=>setSelectedId(workshop.id));
      markersRef.current.set(workshop.id,marker);
    });

    if(selected){
      const lat=Number(selected.latitude),lng=Number(selected.longitude);
      if(Number.isFinite(lat)&&Number.isFinite(lng))map.flyTo([lat,lng],Math.max(map.getZoom(),11),{duration:.65});
    }
    setTimeout(()=>map.invalidateSize(),80);
  },[filtered,selected?.id]);

  useEffect(()=>()=>{mapRef.current?.remove();mapRef.current=null;markersRef.current.clear()},[]);

  const choose=(workshop:PublicWorkshop)=>{
    sessionStorage.setItem('motoratlas_selected_workshop',workshop.id);
    setView('login');
  };

  return <div className="finder-page">
    <main>
      <section className="finder-hero">
        <div className="finder-glow a"/><div className="finder-glow b"/>
        <div className="wrap finder-hero-inner">
          <div>
            <span className="finder-kicker"><Sparkles/> MOTORATLAS WERKSTATTNETZWERK</span>
            <h1>Die passende Werkstatt. <em>Ohne Telefonroulette.</em></h1>
            <p>Suche verifizierte MotorAtlas-Werkstätten, prüfe ob Neukunden angenommen werden und starte anschließend deine digitale Werkstattbeziehung.</p>
          </div>
          <div className="finder-search-panel">
            <div className="finder-search">
              <Search/>
              <input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Werkstatt, PLZ, Ort oder Leistung suchen …" autoFocus/>
            </div>
            <label className="finder-toggle">
              <input type="checkbox" checked={acceptingOnly} onChange={event=>setAcceptingOnly(event.target.checked)}/>
              <span/>
              Nur Werkstätten mit Neukundenaufnahme
            </label>
          </div>
        </div>
      </section>

      <section className="wrap finder-content">
        <div className="finder-results">
          <div className="finder-results-head">
            <div><span>VERIFIZIERTE WERKSTÄTTEN</span><h2>{loading?'Werkstätten werden geladen …':`${filtered.length} Treffer`}</h2></div>
            <small><ShieldCheck/> Nur öffentlich freigegebene MotorAtlas-Partner</small>
          </div>

          {error&&<div className="finder-state error"><b>Werkstattsuche derzeit nicht verfügbar.</b><span>{error}</span></div>}
          {!error&&!loading&&filtered.length===0&&<div className="finder-state"><MapPin/><b>{workshops.length===0?'Noch keine verifizierten Werkstätten veröffentlicht.':'Keine passende Werkstatt gefunden.'}</b><span>{workshops.length===0?'Die Suche ist aktiv. Neue öffentlich verifizierte MotorAtlas-Werkstätten erscheinen hier automatisch.':'Ändere den Suchbegriff oder deaktiviere den Neukundenfilter.'}</span></div>}

          <div className="finder-list">
            {filtered.map(workshop=>{
              const active=workshop.id===selected?.id;
              const services=servicesOf(workshop.services);
              return <article key={workshop.id} className={active?'active':''} onClick={()=>setSelectedId(workshop.id)}>
                <div className="finder-logo">
                  {workshop.logo_path?<img src={getWorkshopLogoPublicUrl(workshop.logo_path)} alt=""/>:<Building2/>}
                </div>
                <div className="finder-card-copy">
                  <div className="finder-card-title">
                    <div><h3>{workshop.name}</h3><span><ShieldCheck/> Verifiziert</span></div>
                    <span className={workshop.accepts_new_customers?'open':'closed'}>
                      {workshop.accepts_new_customers?'Nimmt Neukunden an':'Keine Neukunden'}
                    </span>
                  </div>
                  <p className="finder-address"><MapPin/> {workshop.street}, {workshop.postal_code} {workshop.city}</p>
                  {workshop.description&&<p className="finder-description">{workshop.description}</p>}
                  {services.length>0&&<div className="finder-services">{services.map(service=><span key={service}>{service}</span>)}</div>}
                  <div className="finder-card-footer">
                    <button className="btn secondary small" onClick={event=>{event.stopPropagation();setSelectedId(workshop.id)}}>Auf Karte zeigen</button>
                    <button className="btn primary small" disabled={!workshop.accepts_new_customers} onClick={event=>{event.stopPropagation();choose(workshop)}}>
                      {workshop.accepts_new_customers?'Werkstatt anfragen':'Derzeit geschlossen'} <ArrowRight size={14}/>
                    </button>
                  </div>
                </div>
              </article>
            })}
          </div>
        </div>

        <aside className="finder-map-column">
          <div className="finder-map-shell">
            <div ref={mapEl} className="finder-map"/>
            <div className="finder-map-top"><span><i/> MotorAtlas Partnernetzwerk</span></div>
            {selected&&<div className="finder-selected">
              <div>
                <small>AUSGEWÄHLT</small>
                <b>{selected.name}</b>
                <span>{selected.postal_code} {selected.city}</span>
              </div>
              <button className="btn primary small" disabled={!selected.accepts_new_customers} onClick={()=>choose(selected)}>Anfragen <ArrowRight size={14}/></button>
            </div>}
          </div>
          <div className="finder-info-strip">
            <CheckCircle2/>
            <div><b>Erst auswählen, dann anmelden.</b><span>Die Werkstatt erhält erst nach deinem Login und deiner Anfrage die notwendigen Kundendaten.</span></div>
          </div>
        </aside>
      </section>
    </main>
  </div>;
}
