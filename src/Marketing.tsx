import { useState } from 'react';
import {
  ArrowRight, Building2, Car, CheckCircle2, FileCheck2, FileText, LockKeyhole, MapPin,
  Menu, MessageCircle, MonitorSmartphone, Search, ShieldCheck, Smartphone, Users, Wrench, X
} from 'lucide-react';
import { jobs, type Stage } from './demo';
import { Brand, CarArt, CheckLine, Feature, SectionIntro, Status, TrustPill, Verified, type AppView } from './components';

function Header({setView}:{setView:(v:AppView)=>void}){
  const [open,setOpen]=useState(false);
  const jump=(id:string)=>{setOpen(false);document.getElementById(id)?.scrollIntoView({behavior:'smooth',block:'start'});};
  return <header className="marketing-header"><div className="marketing-nav wrap">
    <button className="brand-button" onClick={()=>{setView('home');scrollTo({top:0,behavior:'smooth'})}}><Brand/></button>
    <nav className={open?'open':''}><button onClick={()=>jump('autofahrer')}>Für Autofahrer</button><button onClick={()=>jump('werkstaetten')}>Für Werkstätten</button><button onClick={()=>jump('finden')}>Werkstatt finden</button><button onClick={()=>jump('sicherheit')}>Sicherheit</button></nav>
    <div className="nav-actions"><button className="link-button" onClick={()=>setView('login')}>Anmelden</button><button className="btn primary" onClick={()=>setView('login')}>Als Werkstatt starten <ArrowRight size={15}/></button><button className="menu" aria-label="Menü" onClick={()=>setOpen(!open)}>{open?<X/>:<Menu/>}</button></div>
  </div></header>;
}

function ProductWindow({setView}:{setView:(v:AppView)=>void}){
  const stages:Stage[]=['arrived','diagnosis','approval','repair','pickup'];
  return <div className="product-window">
    <div className="window-top"><div><i/><i/><i/></div><span>MotorAtlas · Werkstattübersicht</span><span className="live"><b/> LIVE</span></div>
    <div className="window-body"><aside><Brand compact/><span className="active">Übersicht</span><span>Werkstatt</span><span>Termine</span><span>Kunden</span><span>Dokumente</span></aside>
      <section><div className="window-title"><div><small>GUTEN MORGEN</small><h3>Was läuft gerade?</h3></div><button className="btn primary small" onClick={()=>setView('office')}>Live-Demo</button></div>
        <div className="mini-flow">{stages.map((s,i)=><div key={s}><header><span>{['DA','DI','FR','RE','AB'][i]}</span><b>{i===0?3:i===2?2:1}</b></header><article><CarArt tone={i}/><strong>{jobs[i].vehicle}</strong><small>{jobs[i].plate}</small><Status stage={s}/></article></div>)}</div>
      </section>
    </div>
  </div>;
}

function Workflow(){const stages:Stage[]=['arrived','diagnosis','approval','repair','pickup'];return <div className="workflow"><div className="workflow-grid">{stages.map((stage,i)=><div className="flow-lane" key={stage}><header><span>{['Eingetroffen','Diagnose','Freigabe','Reparatur','Abholung'][i]}</span><b>{i===0?3:i===2?2:1}</b></header><article><CarArt tone={i}/><strong>{jobs[i].vehicle}</strong><small>{jobs[i].plate}</small><p>{jobs[i].complaint}</p><Status stage={stage}/></article></div>)}</div><footer><b/> Eine Änderung erscheint in Sekunden auf Büro-PC, Werkstatt-Tablet und Kundenhandy.</footer></div>}

function CustomerPhone(){return <div className="phone"><div className="phone-bar"><span>9:41</span><i/></div><div className="phone-screen"><small>GUTEN MORGEN</small><h3>Deine Garage</h3><div className="phone-car"><CarArt tone={0}/><div><b>BMW X3 3.0i</b><span>SAD XX 123 · 247.318 km</span></div></div><div className="phone-alert"><span>KOSTENVORANSCHLAG</span><b>Deine Freigabe ist erforderlich</b><p>Lambdasonde Bank 1 vor Kat</p><strong>328,40 €</strong><button className="btn primary full">Reparatur freigeben</button></div><div className="phone-link"><FileText/><span><b>Dokumente</b><small>KV & Rechnungen</small></span><ArrowRight/></div><div className="phone-link"><MessageCircle/><span><b>Fahrzeugchat</b><small>1 neue Nachricht</small></span><ArrowRight/></div></div></div>}

function GermanyMap(){return <div className="map-card"><div className="map-search"><Search size={17}/><span>PLZ oder Ort eingeben</span></div><div className="germany-shape"><i className="pin p1"/><i className="pin p2"/><i className="pin p3"/><i className="pin p4"/><div className="map-outline">DE</div></div><div className="map-result"><div className="shop-logo">CS</div><div><b>Carplus Service Center</b><small><MapPin size={12}/> Schwandorf · nimmt Kunden an</small></div><Verified/></div></div>}

export function Marketing({setView}:{setView:(v:AppView)=>void}){
 return <><Header setView={setView}/><main className="marketing">
  <section className="hero"><div className="ambient a"/><div className="ambient b"/><div className="wrap hero-grid"><div className="hero-copy"><div className="eyebrow"><span>NEU</span> DIE DIGITALE VERBINDUNG ZUR WERKSTATT</div><h1>Werkstattservice mit <em>Überblick statt Umwegen.</em></h1><p>Fahrzeug auswählen. Problem melden. Termin abstimmen. Diagnose erhalten. Kostenvoranschlag freigeben. Rechnung wiederfinden. <strong>Eine klare Verbindung zwischen Kunde und Werkstatt.</strong></p><div className="hero-actions"><button className="btn primary xl" onClick={()=>document.getElementById('finden')?.scrollIntoView({behavior:'smooth'})}><Search size={18}/> Werkstatt finden</button><button className="btn glass xl" onClick={()=>setView('login')}>Für Werkstätten <ArrowRight size={18}/></button></div><div className="trust-row"><TrustPill>Nur PKW</TrustPill><TrustPill>PC · Tablet · Smartphone</TrustPill><TrustPill>Dokumente direkt am Auftrag</TrustPill></div></div><ProductWindow setView={setView}/></div></section>

  <section className="process-line wrap"><p>Ein Fahrzeug. Ein Vorgang. Eine nachvollziehbare Geschichte.</p><div><span>ANFRAGE</span><i/><span>TERMIN</span><i/><span>DIAGNOSE</span><i/><span>FREIGABE</span><i/><span>REPARATUR</span><i/><span>RECHNUNG</span></div></section>

  <section className="section wrap" id="werkstaetten"><SectionIntro kicker="FÜR WERKSTÄTTEN" title={<>Nicht nur Termine sehen. <em>Den Betrieb verstehen.</em></>} text="MotorAtlas bildet den echten Werkstattfluss ab – ohne den Mechaniker mit Verwaltungsarbeit zu belasten."/><Workflow/><div className="feature-grid"><Feature icon={<Building2/>} title="Büro & Werkstatt synchron" text="Das Büro meldet das Fahrzeug als eingetroffen. Die Werkstatt sieht den Diagnoseauftrag sofort."/><Feature icon={<Wrench/>} title="Werkstattkarte statt Formularfriedhof" text="Auftrag nehmen, Diagnose eintragen, Arbeit abschließen. Die Software erzeugt den Ablauf daraus."/><Feature icon={<Users/>} title="Ein Mann oder ganzes Team" text="Bei einer Person verschmelzen Rollen. Im Team greifen Rechte, Queues und saubere Übergaben."/></div></section>

  <section className="section soft" id="autofahrer"><div className="wrap customer-grid"><CustomerPhone/><div><SectionIntro align="left" kicker="FÜR AUTOFAHRER" title={<>Dein Auto hat ein Problem. <em>Nicht deine Kommunikation.</em></>} text="Deine Fahrzeugdaten sind bereits hinterlegt. Die nächste Anfrage beginnt deshalb nicht wieder bei null."/><div className="check-stack"><CheckLine title="Alle PKW in einer Garage" text="Foto, Kennzeichen, HSN, TSN, VIN, Historie und Dokumente bleiben am Fahrzeug."/><CheckLine title="Problem in Sekunden melden" text="Kurz beschreiben, Pflichtbild hinzufügen und Wunschtermin senden."/><CheckLine title="KVA verbindlich freigeben" text="Rückfragen per Chat oder Telefon – die formelle Freigabe bleibt separat dokumentiert."/><CheckLine title="Fahrzeugbezogener Chat" text="Werkstatt und Kunde sprechen genau dort, wo der Vorgang liegt. Keine verstreuten Messenger-Nachrichten."/></div></div></div></section>

  <section className="section wrap vision"><SectionIntro kicker="DAS PRODUKT ALS GANZES" title={<>Ein System, das schon beim Öffnen <em>nach Premium aussieht.</em></>} text="Das freigegebene MotorAtlas-Design bleibt die visuelle Leitlinie für Website, PWA und Android-App."/><div className="vision-frame"><img src={`${import.meta.env.BASE_URL}product-vision.webp`} alt="MotorAtlas Premium Produktvision"/></div></section>

  <section className="section wrap directory" id="finden"><div><SectionIntro align="left" kicker="DEUTSCHLANDWEIT" title={<>Werkstatt finden. <em>Beziehung aufbauen.</em></>} text="Verifizierte Werkstätten zeigen Leistungen, Öffnungszeiten und ob sie neue Kunden aufnehmen."/><div className="directory-points"><span><CheckCircle2/> Werkstatt stellt ihr Profil selbst professionell dar</span><span><CheckCircle2/> Kunde fragt die Aufnahme an</span><span><CheckCircle2/> Erst nach Freigabe entstehen Aufträge</span><span><CheckCircle2/> Stammwerkstatt lässt sich jederzeit wechseln</span></div><button className="btn primary xl" onClick={()=>setView('login')}>MotorAtlas öffnen <ArrowRight size={17}/></button></div><GermanyMap/></section>

  <section className="section dark" id="sicherheit"><div className="wrap security-grid"><div><span className="kicker-light">TRANSPARENZ OHNE CHAOS</span><h2>Kommunikation, Freigaben und Dokumente <em>bleiben unterscheidbar.</em></h2><p>Ein Chat ist eine Unterhaltung. Eine Reparaturfreigabe ist eine dokumentierte Entscheidung. Eine Rechnung ist ein unveränderbares Dokument. MotorAtlas vermischt diese Ebenen bewusst nicht.</p></div><div className="security-cards"><article><MessageCircle/><b>Fahrzeugchat</b><span>Nachrichten und Anhänge bleiben am Auftrag.</span></article><article><FileCheck2/><b>Formelle Freigaben</b><span>Portal- oder dokumentierte Telefonfreigabe.</span></article><article><LockKeyhole/><b>Dokumenthistorie</b><span>PDF, später ZUGFeRD/XRechnung, mit Versionierung.</span></article><article><ShieldCheck/><b>Rollen & Rechte</b><span>Jeder sieht nur, was seine Aufgabe erfordert.</span></article></div></div></section>

  <section className="section wrap device-section"><SectionIntro kicker="AUF JEDEM GERÄT" title={<>Ein Designsystem. <em>Drei Arbeitswelten.</em></>} text="Am Büro-PC viel Überblick, auf dem Werkstatt-Tablet große Aktionen, auf dem Kundenhandy nur das Wesentliche."/><div className="devices"><article><MonitorSmartphone/><b>PC</b><span>Dashboard, Termine, Dokumente, Kunden</span></article><article><Smartphone/><b>Smartphone</b><span>Anfrage, Freigabe, Chat, Werkstattkarte</span></article><article><Car/><b>Werkstatt</b><span>Diagnose- und Reparaturqueue ohne Bürokratie</span></article></div></section>

  <section className="cta"><div className="wrap"><div><span>MOTORATLAS</span><h2>Bereit für eine Werkstattbeziehung, die endlich digital zusammenpasst?</h2></div><button className="btn white xl" onClick={()=>setView('login')}>Jetzt starten <ArrowRight/></button></div></section>
 </main><Footer setView={setView}/></>;
}

function Footer({setView}:{setView:(v:AppView)=>void}){return <footer className="footer"><div className="wrap footer-grid"><div><Brand/><p>Die digitale Verbindung zwischen Autofahrer und Werkstatt.</p></div><div><b>Produkt</b><span>Für Autofahrer</span><span>Für Werkstätten</span><span>Werkstatt finden</span></div><div><b>Zugang</b><button onClick={()=>setView('login')}>Anmelden</button><button onClick={()=>setView('office')}>Produktdemo</button></div><div><b>Plattform</b><span>Nur PKW</span><span>Deutschlandweit</span><span>Web · PWA · Android</span></div></div><div className="wrap footer-bottom"><span>© 2026 MotorAtlas</span><span>Datenschutz · Impressum · Nutzungsbedingungen</span></div></footer>}
