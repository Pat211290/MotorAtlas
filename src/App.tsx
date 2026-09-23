import { useEffect, useState } from 'react';
import {
  ArrowLeft,ArrowRight,Building2,Car,Eye,EyeOff,LockKeyhole,Mail,MapPin,ShieldCheck,UserRound
} from 'lucide-react';
import { Marketing } from './Marketing';
import { WorkshopFinder } from './WorkshopFinder';
import { PublicHeader } from './PublicHeader';
import { CustomerMarketingPage, SecurityMarketingPage, WorkshopMarketingPage } from './MarketingPages';
import { BrandingPage, CustomerPortal, OfficeDashboard, WorkshopBoard } from './Workspace';
import { Brand, type AppView } from './components';
import { backendConfigured, supabase } from './lib';
import { signUpCustomer } from './api';

function Splash(){
  const [show,setShow]=useState(true);
  useEffect(()=>{const id=setTimeout(()=>setShow(false),1100);return()=>clearTimeout(id)},[]);
  if(!show)return null;
  return <div className="splash"><div className="splash-orbit"/><Brand inverse/><div className="splash-loader"><i/></div></div>;
}

async function resolveSignedInView():Promise<AppView>{
  if(!supabase)return'customer';
  const {data:user}=await supabase.auth.getUser();
  if(!user.user)return'login';
  try{await supabase.rpc('claim_my_workshop_invites')}catch{}
  const {data:member}=await supabase.from('workshop_members').select('role').eq('user_id',user.user.id).eq('active',true).limit(1).maybeSingle();
  if(member?.role==='mechanic')return'workshop';
  if(member)return'office';
  if(user.user.user_metadata?.account_intent==='workshop')return'branding';
  return'customer';
}

function Login({setView}:{setView:(view:AppView)=>void}){
  const [tab,setTab]=useState<'login'|'customer'|'workshop'>('login');
  const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [name,setName]=useState('');
  const [street,setStreet]=useState('');const [postalCode,setPostalCode]=useState('');const [city,setCity]=useState('');
  const [show,setShow]=useState(false);const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');

  const submit=async(event:React.FormEvent)=>{
    event.preventDefault();setMessage('');
    if(!backendConfigured||!supabase){setMessage('Backend-Verbindung ist noch nicht aktiv. Du kannst unten die Produktdemo öffnen.');return}
    setBusy(true);
    try{
      if(tab==='login'){
        const {error}=await supabase.auth.signInWithPassword({email,password});
        if(error)throw error;
        setView(await resolveSignedInView());
      }else{
        if(tab==='customer'&&(!street.trim()||!postalCode.trim()||!city.trim()))throw new Error('Bitte die vollständige Anschrift eintragen.');
        const result=await signUpCustomer(email,password,name,{
          accountIntent:tab==='workshop'?'workshop':'customer',
          street:tab==='customer'?street:undefined,
          postalCode:tab==='customer'?postalCode:undefined,
          city:tab==='customer'?city:undefined
        });
        if(result.session){
          setMessage(tab==='workshop'?'Konto erstellt. Jetzt richten wir deine Werkstatt ein.':'Konto erstellt.');
          setView(tab==='workshop'?'branding':'customer');
        }else{
          setMessage('Konto erstellt. Bitte bestätige zuerst deine E-Mail-Adresse. Danach führt MotorAtlas dich automatisch in den richtigen Bereich.');
        }
      }
    }catch(err){setMessage(err instanceof Error?err.message:'Anmeldung nicht möglich.')}
    finally{setBusy(false)}
  };

  return <div className="auth-page">
    <div className="auth-ambient one"/><div className="auth-ambient two"/>
    <button className="back" onClick={()=>setView('home')}><ArrowLeft/> Zurück zu motoratlas.de</button>
    <div className="auth-shell">
      <section className="auth-story">
        <Brand inverse/>
        <div><span className="auth-kicker">MOTORATLAS ACCESS</span><h1>Eine Anmeldung. <em>Die passende Arbeitswelt.</em></h1><p>Autofahrer sehen ihre Garage. Das Büro sieht den Betrieb. Mechaniker sehen nur ihre Werkstattkarten.</p></div>
        <div className="auth-proof"><span><ShieldCheck/> Rollenbasierter Zugriff</span><span><LockKeyhole/> Geschützte Fahrzeugdaten</span><span><Car/> Ausschließlich PKW</span></div>
      </section>
      <section className="auth-card">
        <div className="auth-tabs"><button className={tab==='login'?'active':''} onClick={()=>setTab('login')}>Anmelden</button><button className={tab==='customer'?'active':''} onClick={()=>setTab('customer')}>Autofahrer</button><button className={tab==='workshop'?'active':''} onClick={()=>setTab('workshop')}>Werkstatt</button></div>
        <div className="auth-title"><span>{tab==='login'?'WILLKOMMEN ZURÜCK':tab==='customer'?'DEINE GARAGE':'DEINE WERKSTATT'}</span><h2>{tab==='login'?'Bei MotorAtlas anmelden':tab==='customer'?'Kundenkonto erstellen':'Werkstattkonto starten'}</h2><p>{tab==='login'?'MotorAtlas erkennt nach der Anmeldung automatisch deine Rolle.':tab==='customer'?'Fahrzeuge, Anfragen, Freigaben und Dokumente in einem Konto.':'Nach der Kontoerstellung richtest du Werkstattprofil, Logo und Mitarbeiter ein.'}</p></div>
        <form onSubmit={submit}>
          {tab!=='login'&&<label><span>Name</span><div><UserRound/><input value={name} onChange={e=>setName(e.target.value)} required placeholder={tab==='workshop'?'Ansprechpartner':'Vor- und Nachname'}/></div></label>}
          {tab==='customer'&&<div className="auth-address"><label><span>Straße & Hausnummer</span><div><MapPin/><input value={street} onChange={e=>setStreet(e.target.value)} required placeholder="Musterstraße 12"/></div></label><div><label><span>PLZ</span><input value={postalCode} onChange={e=>setPostalCode(e.target.value.replace(/\D/g,'').slice(0,5))} required inputMode="numeric" placeholder="92421"/></label><label><span>Ort</span><input value={city} onChange={e=>setCity(e.target.value)} required placeholder="Schwandorf"/></label></div></div>}
          <label><span>E-Mail</span><div><Mail/><input type="email" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="name@beispiel.de"/></div></label>
          <label><span>Passwort</span><div><LockKeyhole/><input type={show?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} minLength={8} required placeholder="••••••••••••"/><button type="button" className="show-password" onClick={()=>setShow(!show)}>{show?<EyeOff/>:<Eye/>}</button></div></label>
          {message&&<div className="auth-message">{message}</div>}
          <button className="btn primary xl full" disabled={busy}>{busy?'Bitte einen Moment …':tab==='login'?'Sicher anmelden':'Konto erstellen'} <ArrowRight/></button>
        </form>
        <div className="demo-divider"><span>Produkt vorab ansehen</span></div>
        <div className="demo-buttons"><button onClick={()=>setView('office')}><Building2/> Büro</button><button onClick={()=>setView('workshop')}><Car/> Werkstatt</button><button onClick={()=>setView('customer')}><UserRound/> Kunde</button></div>
      </section>
    </div>
  </div>;
}

const viewHashes:Record<AppView,string>={
  home:'#/',
  'customer-info':'#/autofahrer',
  'workshop-info':'#/werkstaetten',
  'security-info':'#/sicherheit',
  finder:'#/werkstatt-finden',
  login:'#/anmelden',
  office:'#/app/buero',
  workshop:'#/app/werkstatt',
  customer:'#/app/kunde',
  branding:'#/app/werkstattprofil'
};

function viewFromHash(hash:string):AppView|null{
  const entry=(Object.entries(viewHashes) as Array<[AppView,string]>).find(([,value])=>value===hash);
  return entry?.[0]??null;
}

export default function App(){
  const [view,setView]=useState<AppView>(()=>viewFromHash(location.hash)??'home');

  const navigate=(next:AppView)=>{
    setView(next);
    const target=viewHashes[next];
    if(location.hash!==target)history.pushState({motorAtlasView:next},'',target);
    window.scrollTo({top:0,behavior:'auto'});
  };

  useEffect(()=>{
    const syncFromLocation=()=>{
      const next=viewFromHash(location.hash);
      if(next)setView(next);
    };
    window.addEventListener('popstate',syncFromLocation);
    window.addEventListener('hashchange',syncFromLocation);
    return()=>{
      window.removeEventListener('popstate',syncFromLocation);
      window.removeEventListener('hashchange',syncFromLocation);
    };
  },[]);

  useEffect(()=>{
    if(!supabase)return;
    supabase.auth.getSession().then(async({data})=>{
      if(data.session&&(location.hash==='#app'||new URLSearchParams(location.search).get('app')==='1')){
        navigate(await resolveSignedInView());
      }
    });
  },[]);

  useEffect(()=>{
    const titles:Partial<Record<AppView,string>>={
      home:'MotorAtlas – Werkstatt. Neu gedacht.',
      'customer-info':'MotorAtlas für Autofahrer – Fahrzeug, Werkstatt & Dokumente',
      'workshop-info':'MotorAtlas für Werkstätten – Digitaler Werkstattablauf',
      'security-info':'MotorAtlas – Sicherheit & Transparenz',
      finder:'MotorAtlas – Werkstatt finden',
      login:'MotorAtlas – Anmelden'
    };
    if(titles[view])document.title=titles[view]!;
  },[view]);

  const showPublicHeader=['home','customer-info','workshop-info','security-info','finder','login'].includes(view);
  return <div className="site">
    <Splash/>
    {showPublicHeader&&<PublicHeader view={view} setView={navigate}/>} 
    {view==='home'&&<Marketing setView={navigate}/>}
    {view==='customer-info'&&<CustomerMarketingPage setView={navigate}/>}
    {view==='workshop-info'&&<WorkshopMarketingPage setView={navigate}/>}
    {view==='security-info'&&<SecurityMarketingPage setView={navigate}/>}
    {view==='finder'&&<WorkshopFinder setView={navigate}/>}
    {view==='login'&&<Login setView={navigate}/>}
    {view==='office'&&<OfficeDashboard setView={navigate}/>}
    {view==='workshop'&&<WorkshopBoard setView={navigate}/>}
    {view==='customer'&&<CustomerPortal setView={navigate}/>}
    {view==='branding'&&<BrandingPage setView={navigate}/>}
  </div>;
}
