import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Building2, CheckCircle2, Clock3, MapPin, MessageCircle, ShieldCheck, Wrench } from 'lucide-react';
import { getWorkshopLogoPublicUrl, listPublicWorkshops, type PublicWorkshop } from './api';
import type { AppView } from './components';

function servicesOf(value:unknown){
  if(Array.isArray(value))return value.filter(item=>typeof item==='string') as string[];
  if(value&&typeof value==='object')return Object.entries(value as Record<string,unknown>).filter(([,enabled])=>Boolean(enabled)).map(([name])=>name);
  return [];
}
function hoursOf(value:unknown){
  if(!value||typeof value!=='object')return[] as Array<[string,string]>;
  return Object.entries(value as Record<string,unknown>).map(([day,hours])=>[day,String(hours??'')]);
}

export function PublicWorkshopProfile({setView}:{setView:(view:AppView)=>void}){
  const [workshop,setWorkshop]=useState<PublicWorkshop|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const slug=sessionStorage.getItem('motoratlas_selected_workshop_slug')??'';

  useEffect(()=>{
    let cancelled=false;
    listPublicWorkshops().then(list=>{
      if(cancelled)return;
      const selected=list.find(item=>item.slug===slug)||list.find(item=>item.id===sessionStorage.getItem('motoratlas_selected_workshop'))||null;
      setWorkshop(selected);
      if(!selected)setError('Diese Werkstatt ist nicht öffentlich verfügbar.');
    }).catch(err=>!cancelled&&setError(err instanceof Error?err.message:'Werkstatt konnte nicht geladen werden.')).finally(()=>!cancelled&&setLoading(false));
    return()=>{cancelled=true};
  },[slug]);

  const services=useMemo(()=>servicesOf(workshop?.services),[workshop?.services]);
  const hours=useMemo(()=>hoursOf(workshop?.opening_hours),[workshop?.opening_hours]);

  const request=()=>{
    if(!workshop)return;
    sessionStorage.setItem('motoratlas_selected_workshop',workshop.id);
    sessionStorage.setItem('motoratlas_selected_workshop_slug',workshop.slug);
    setView('login');
  };

  if(loading)return <main className="wp-page"><div className="wrap wp-loading">Werkstattprofil wird geladen …</div></main>;
  if(error||!workshop)return <main className="wp-page"><div className="wrap wp-empty"><Building2/><h1>Werkstattprofil nicht verfügbar</h1><p>{error}</p><button className="btn primary" onClick={()=>setView('finder')}>Zur Werkstattsuche</button></div></main>;

  return <main className="wp-page">
    <section className="wp-hero" style={{'--shop-brand':workshop.brand_primary||'#0c667a'} as React.CSSProperties}>
      <div className="wrap">
        <button className="wp-back" onClick={()=>setView('finder')}><ArrowLeft/> Zur Werkstattsuche</button>
        <div className="wp-identity">
          <div className="wp-logo">{workshop.logo_path?<img src={getWorkshopLogoPublicUrl(workshop.logo_path)} alt={workshop.name+' Logo'}/>:<Building2/>}</div>
          <div className="wp-title">
            <span><ShieldCheck/> Verifizierte MotorAtlas-Werkstatt</span>
            <h1>{workshop.name}</h1>
            <p><MapPin/> {workshop.street}, {workshop.postal_code} {workshop.city}</p>
          </div>
          <div className="wp-availability">
            <span className={workshop.accepts_new_customers?'yes':'no'}>{workshop.accepts_new_customers?'Nimmt Neukunden an':'Aktuell keine Neukunden'}</span>
            <button className="btn primary xl" disabled={!workshop.accepts_new_customers} onClick={request}>Werkstatt anfragen <ArrowRight/></button>
          </div>
        </div>
      </div>
    </section>

    <section className="wrap wp-grid">
      <div className="wp-main">
        <article className="wp-intro">
          <span>ÜBER DIE WERKSTATT</span>
          <h2>{workshop.name}</h2>
          <p>{workshop.description||'Diese Werkstatt hat noch keine ausführliche Beschreibung hinterlegt.'}</p>
        </article>

        <article className="wp-panel">
          <div className="wp-panel-head"><Wrench/><div><span>LEISTUNGEN</span><h3>Was diese Werkstatt anbietet</h3></div></div>
          {services.length?<div className="wp-services">{services.map(service=><span key={service}><CheckCircle2/>{service}</span>)}</div>:<p className="wp-muted">Leistungen werden derzeit ergänzt.</p>}
        </article>

        <article className="wp-panel">
          <div className="wp-panel-head"><MessageCircle/><div><span>MOTORATLAS VERBINDUNG</span><h3>Vom Profil direkt in den Fahrzeugauftrag</h3></div></div>
          <div className="wp-flow">
            <span>Werkstatt ansehen</span><i/><span>Anfrage senden</span><i/><span>Termin abstimmen</span><i/><span>Diagnose & KVA</span><i/><span>Freigabe & Reparatur</span>
          </div>
          <p className="wp-muted">Nach deiner Anfrage bleibt die Kommunikation am jeweiligen Fahrzeug und Auftrag – nicht verstreut über verschiedene Kanäle.</p>
        </article>
      </div>

      <aside className="wp-side">
        <article className="wp-contact-card">
          <span>WERKSTATT AUF EINEN BLICK</span>
          <div><MapPin/><p><b>Adresse</b>{workshop.street}<br/>{workshop.postal_code} {workshop.city}</p></div>
          <div><ShieldCheck/><p><b>Status</b>Von MotorAtlas öffentlich verifiziert</p></div>
          <div><Clock3/><p><b>Öffnungszeiten</b>{hours.length?'Siehe unten':'Noch nicht veröffentlicht'}</p></div>
          <button className="btn primary full" disabled={!workshop.accepts_new_customers} onClick={request}>{workshop.accepts_new_customers?'Als Kunde anfragen':'Keine Neukundenaufnahme'}</button>
        </article>

        {hours.length>0&&<article className="wp-hours"><span>ÖFFNUNGSZEITEN</span>{hours.map(([day,hour])=><div key={day}><b>{day}</b><span>{hour}</span></div>)}</article>}
      </aside>
    </section>

    <section className="wp-bottom-cta"><div className="wrap"><div><span>DEIN FAHRZEUG · DIESE WERKSTATT</span><h2>Bereit, die erste Anfrage fahrzeugspezifisch zu senden?</h2></div><button className="btn white xl" disabled={!workshop.accepts_new_customers} onClick={request}>Werkstatt anfragen <ArrowRight/></button></div></section>
  </main>;
}
