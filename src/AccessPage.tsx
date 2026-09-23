import { useEffect, useState } from 'react';
import {
  ArrowRight, Building2, Car, CheckCircle2, Clock3, Eye, EyeOff, Gauge, LockKeyhole,
  Mail, MailCheck, MapPin, MessageCircle, RefreshCw, ShieldCheck, Sparkles, UserRound, Users, WalletCards
} from 'lucide-react';
import { backendConfigured, supabase } from './lib';
import { claimMyWorkshopInvites, signUpCustomer } from './api';
import type { AppView } from './components';

async function resolveSignedInView():Promise<AppView>{
  if(!supabase)return'customer';
  const {data:user}=await supabase.auth.getUser();
  if(!user.user)return'login';
  try{await claimMyWorkshopInvites()}catch{}
  const {data:member}=await supabase.from('workshop_members').select('role').eq('user_id',user.user.id).eq('active',true).limit(1).maybeSingle();
  if(member?.role==='mechanic')return'workshop';
  if(member)return'office';
  if(user.user.user_metadata?.account_intent==='workshop')return'branding';
  return'customer';
}

type Tab='start'|'login'|'customer'|'workshop'|'verify'|'reset'|'password';

const benefits:Record<Tab,{kicker:string,title:string,text:string;items:Array<{icon:any;title:string;text:string}>}>={
  start:{
    kicker:'MOTORATLAS STARTEN',
    title:'Für Autofahrer und Werkstätten. Gemeinsam besser verbunden.',
    text:'Wähle, wie du MotorAtlas nutzen möchtest. Beide Seiten arbeiten später am selben aktuellen Fahrzeugvorgang – jeweils mit der passenden Oberfläche.',
    items:[
      {icon:Car,title:'Autofahrer',text:'Zeit sparen, Kosten besser kontrollieren, schneller Hilfe bekommen und jederzeit den aktuellen Stand sehen.'},
      {icon:Building2,title:'Werkstatt',text:'Personal entlasten, Abläufe beschleunigen, professioneller auftreten und mehr Umsatzpotenzial nutzen.'},
      {icon:MessageCircle,title:'Gemeinsam verbunden',text:'Fahrzeug, Auftrag, Chat, Freigaben und Dokumente bleiben sauber zusammen.'}
    ]
  },
  login:{
    kicker:'MOTORATLAS ANMELDEN',
    title:'Ein Login. Die passende Fahrzeug- oder Werkstattwelt.',
    text:'MotorAtlas erkennt nach der Anmeldung automatisch, ob du Autofahrer, Büro, Mechaniker oder Inhaber bist.',
    items:[
      {icon:Gauge,title:'Immer aktuell',text:'Status, Nachrichten und Freigaben erscheinen dort, wo du sie brauchst.'},
      {icon:ShieldCheck,title:'Passende Rechte',text:'Jede Rolle sieht nur die Informationen, die zur Aufgabe gehören.'},
      {icon:MessageCircle,title:'Alles am Vorgang',text:'Chat, Dokumente und Arbeitsschritte bleiben am richtigen Fahrzeug.'}
    ]
  },
  customer:{
    kicker:'FÜR AUTOFAHRER',
    title:'Weniger Zeit verlieren. Kosten besser im Griff behalten.',
    text:'Dein Fahrzeug, deine Werkstatt und dein aktueller Auftrag bleiben digital verbunden – vom Problem bis zur Rechnung.',
    items:[
      {icon:Clock3,title:'Zeit sparen',text:'Anfrage senden, Termin abstimmen und Status prüfen, ohne ständig hinterhertelefonieren zu müssen.'},
      {icon:WalletCards,title:'Kosten kontrollieren',text:'Diagnose und Kostenvoranschlag sehen, Rückfragen stellen und erst dann verbindlich freigeben.'},
      {icon:Car,title:'Fahrzeugspezifisch',text:'Jede Anfrage, jedes Dokument und jeder Chat gehört zum richtigen Fahrzeug und Auftrag.'}
    ]
  },
  workshop:{
    kicker:'FÜR WERKSTÄTTEN',
    title:'Personal entlasten. Professioneller arbeiten. Mehr Umsatzpotenzial nutzen.',
    text:'MotorAtlas reduziert unnötige Rückfragen und Medienbrüche und macht deine Werkstatt gleichzeitig online sichtbar und anfragbar.',
    items:[
      {icon:Users,title:'Personal entlasten',text:'Weniger Telefon, weniger Zettel, weniger doppelte Rückfragen zwischen Büro, Werkstatt und Kunde.'},
      {icon:Building2,title:'Professioneller auftreten',text:'Öffentliches Werkstattprofil, klare Kundenkommunikation und ein durchgängiger digitaler Ablauf.'},
      {icon:Sparkles,title:'Mehr Chancen auf Umsatz',text:'24/7 auffindbar, weniger verpasste Anfragen und schnellere Kundenfreigaben für laufende Aufträge.'}
    ]
  },
  verify:{
    kicker:'E-MAIL BESTÄTIGEN',
    title:'Nur noch ein Schritt bis zu deinem MotorAtlas-Konto.',
    text:'Die E-Mail-Bestätigung schützt dein Konto und stellt sicher, dass nur du diese Adresse für MotorAtlas verwenden kannst.',
    items:[
      {icon:MailCheck,title:'Postfach prüfen',text:'Öffne die Bestätigungsmail von MotorAtlas und tippe auf „E-Mail-Adresse bestätigen“.'},
      {icon:ShieldCheck,title:'Sicherer Zugang',text:'Erst nach der Bestätigung wird die E-Mail-Adresse als verifiziert behandelt.'},
      {icon:RefreshCw,title:'Mail erneut anfordern',text:'Falls nichts ankommt, kannst du den Versand direkt noch einmal anstoßen.'}
    ]
  },
  reset:{
    kicker:'PASSWORT ZURÜCKSETZEN',
    title:'Zugang verloren? Wir schicken dir einen sicheren Rücksetz-Link.',
    text:'Aus Sicherheitsgründen verrät MotorAtlas nicht, ob eine E-Mail-Adresse bereits registriert ist.',
    items:[
      {icon:Mail,title:'Link per E-Mail',text:'Du erhältst einen zeitlich begrenzten Link an die angegebene Adresse.'},
      {icon:ShieldCheck,title:'Keine Konto-Auskunft',text:'Die Rückmeldung bleibt bewusst gleich, egal ob ein Konto existiert.'},
      {icon:LockKeyhole,title:'Neues Passwort setzen',text:'Nach dem Link kannst du direkt ein neues Passwort vergeben.'}
    ]
  },
  password:{
    kicker:'NEUES PASSWORT',
    title:'Vergib jetzt ein neues MotorAtlas-Passwort.',
    text:'Der Rücksetz-Link stellt dafür eine temporäre, abgesicherte Sitzung her.',
    items:[
      {icon:LockKeyhole,title:'Mindestens 8 Zeichen',text:'Nutze idealerweise ein einzigartiges Passwort oder einen Passwortmanager.'},
      {icon:ShieldCheck,title:'Nicht im Klartext gespeichert',text:'Das Passwort wird vom Authentifizierungsdienst nur als sicherer Hash gespeichert.'},
      {icon:Gauge,title:'Danach neu anmelden',text:'Nach erfolgreicher Änderung meldest du dich mit dem neuen Passwort wieder an.'}
    ]
  }
};

function initialTab():Tab{
  if(new URLSearchParams(location.search).get('recovery')==='1')return'password';
  const mode=sessionStorage.getItem('motoratlas_access_mode');
  sessionStorage.removeItem('motoratlas_access_mode');
  return mode==='login'||mode==='customer'||mode==='workshop'||mode==='start'?mode:'start';
}

export function AccessPage({setView}:{setView:(view:AppView)=>void}){
  const [tab,setTabState]=useState<Tab>(initialTab);
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [name,setName]=useState('');
  const [street,setStreet]=useState('');
  const [postalCode,setPostalCode]=useState('');
  const [city,setCity]=useState('');
  const [show,setShow]=useState(false);
  const [newPassword,setNewPassword]=useState('');
  const [newPassword2,setNewPassword2]=useState('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [pendingEmail,setPendingEmail]=useState('');
  const [resendBusy,setResendBusy]=useState(false);
  const [resendStatus,setResendStatus]=useState('');

  const setTab=(next:Tab)=>{setMessage('');setResendStatus('');setTabState(next)};
  const benefit=benefits[tab];

  useEffect(()=>{
    if(!supabase)return;
    const {data}=supabase.auth.onAuthStateChange(event=>{
      if(event==='PASSWORD_RECOVERY')setTabState('password');
    });
    return()=>data.subscription.unsubscribe();
  },[]);

  const resendConfirmation=async()=>{
    if(!backendConfigured||!supabase||!pendingEmail)return;
    setResendBusy(true);
    setResendStatus('');
    try{
      const base=new URL('./',document.baseURI);
      base.search='app=1';
      base.hash='';
      const {error}=await supabase.auth.resend({
        type:'signup',
        email:pendingEmail,
        options:{emailRedirectTo:base.toString()}
      });
      if(error){
        if(error.status===429){
          setResendStatus('Bitte warte kurz, bevor du eine weitere Bestätigungsmail anforderst.');
        }else{
          setResendStatus('Der erneute Versand konnte gerade nicht gestartet werden. Prüfe die Adresse oder nutze die Anmeldung beziehungsweise „Passwort vergessen“.');
        }
      }else{
        setResendStatus('Wenn die Adresse noch bestätigt werden muss, wurde eine neue Bestätigungsmail angefordert.');
      }
    }finally{
      setResendBusy(false);
    }
  };

  const submit=async(event:React.FormEvent)=>{
    event.preventDefault();
    setMessage('');
    if(tab==='start')return;
    if(!backendConfigured||!supabase){
      setMessage('Die Backend-Verbindung ist in dieser Vorschau nicht verfügbar.');
      return;
    }
    setBusy(true);
    try{
      if(tab==='reset'){
        const base=new URL('./',document.baseURI);
        base.search='recovery=1';
        base.hash='';
        const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:base.toString()});
        if(error)throw error;
        setMessage('Wenn zu dieser E-Mail ein Konto existiert, wurde ein Link zum Zurücksetzen des Passworts versendet.');
        return;
      }
      if(tab==='password'){
        if(newPassword.length<8)throw new Error('Das neue Passwort muss mindestens 8 Zeichen lang sein.');
        if(newPassword!==newPassword2)throw new Error('Die beiden Passwörter stimmen nicht überein.');
        const {error}=await supabase.auth.updateUser({password:newPassword});
        if(error)throw error;
        await supabase.auth.signOut();
        const base=new URL('./',document.baseURI);
        history.replaceState({},'',base.pathname+'#/anmelden');
        setMessage('Passwort erfolgreich geändert. Du kannst dich jetzt neu anmelden.');
        setPassword('');
        setNewPassword('');
        setNewPassword2('');
        setTabState('login');
        return;
      }
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
          setView(tab==='workshop'?'branding':'customer');
        }else{
          setPendingEmail(email.trim());
          setMessage('');
          setResendStatus('');
          setTabState('verify');
        }
      }
    }catch(error){
      setMessage(error instanceof Error?error.message:'Anmeldung nicht möglich.');
    }finally{
      setBusy(false);
    }
  };

  return <main className="access-page">
    <div className="access-glow one"/><div className="access-glow two"/>
    <section className="wrap access-layout">
      <div className="access-story">
        <span className="access-kicker">{benefit.kicker}</span>
        <h1>{benefit.title}</h1>
        <p>{benefit.text}</p>

        <div className="access-benefits">
          {benefit.items.map(item=><article key={item.title}>
            <i><item.icon/></i>
            <div><b>{item.title}</b><span>{item.text}</span></div>
          </article>)}
        </div>

        <div className="access-shared">
          <span><CheckCircle2/> Schnelle Terminabstimmung</span>
          <span><CheckCircle2/> Fahrzeugbezogene Aufträge</span>
          <span><CheckCircle2/> Aktueller Status ohne Nachtelefonieren</span>
          <span><CheckCircle2/> Direkter Werkstatt-Kunden-Chat</span>
        </div>
      </div>

      <section className="access-card">
        <div className="access-tabs">
          <button className={tab==='login'||tab==='reset'||tab==='password'?'active':''} onClick={()=>setTab('login')}>Anmelden</button>
          <button className={tab==='customer'?'active':''} onClick={()=>setTab('customer')}>Autofahrer</button>
          <button className={tab==='workshop'?'active':''} onClick={()=>setTab('workshop')}>Werkstatt</button>
        </div>

        {tab==='start'?<>
          <div className="access-card-head">
            <span>KOSTENLOS STARTEN</span>
            <h2>Wie möchtest du MotorAtlas nutzen?</h2>
            <p>Wähle deinen Einstieg. Beide Seiten bleiben später über den jeweiligen Fahrzeugauftrag miteinander verbunden.</p>
          </div>

          <div className="access-choice">
            <button onClick={()=>setTab('customer')}>
              <i><Car/></i>
              <span><small>ICH BIN</small><b>Autofahrer</b><p>Fahrzeuge verwalten, Werkstatt finden, Anfrage senden und Reparaturstatus verfolgen.</p></span>
              <ArrowRight/>
            </button>
            <button onClick={()=>setTab('workshop')}>
              <i><Building2/></i>
              <span><small>WIR SIND EINE</small><b>Werkstatt</b><p>Werkstattprofil aufbauen, Kundenanfragen erhalten und den Werkstattablauf digital verbinden.</p></span>
              <ArrowRight/>
            </button>
          </div>

          <button className="access-existing" onClick={()=>setTab('login')}>Schon registriert? <b>Jetzt anmelden</b></button>
        </>:tab==='verify'?<>
          <div className="access-verify">
            <div className="access-verify-icon"><MailCheck/></div>
            <span className="access-verify-kicker">BESTÄTIGUNG ERFORDERLICH</span>
            <h2>Prüfe jetzt dein E-Mail-Postfach</h2>
            <p className="access-verify-lead">Für die Registrierung ist eine bestätigte E-Mail-Adresse erforderlich.</p>

            <div className="access-verify-email"><Mail/><span>{pendingEmail||email}</span></div>

            <div className="access-verify-paths">
              <article>
                <span>NEU REGISTRIERT?</span>
                <b>Bestätigungsmail prüfen</b>
                <p>Wenn die Adresse neu ist, sollte eine MotorAtlas-Mail zur Bestätigung ankommen. Bitte auch Spam/Junk prüfen.</p>
              </article>
              <article className="existing">
                <span>SCHON EIN KONTO?</span>
                <b>Es kommt keine neue Bestätigungsmail</b>
                <p>Bei bereits registrierten Adressen verschickt Supabase aus Sicherheitsgründen keine neue Signup-Mail. Nutze dann Anmeldung oder Passwort zurücksetzen.</p>
                <div><button onClick={()=>setTab('login')}>Anmelden</button><button onClick={()=>setTab('reset')}>Passwort vergessen</button></div>
              </article>
            </div>

            <div className="access-verify-steps">
              <span><b>1</b> Posteingang und Spam-Ordner prüfen</span>
              <span><b>2</b> MotorAtlas-Mail öffnen</span>
              <span><b>3</b> „E-Mail-Adresse bestätigen“ antippen</span>
            </div>

            <button className="btn primary xl full access-resend" disabled={resendBusy} onClick={resendConfirmation}>
              {resendBusy?'Mail wird angefordert …':'Bestätigungsmail erneut senden'} <RefreshCw/>
            </button>
            {resendStatus&&<div className="access-resend-status">{resendStatus}</div>}

            <div className="access-verify-actions">
              <button onClick={()=>setTab('login')}>Zur <b>Anmeldung</b></button>
            </div>
          </div>
        </>:tab==='reset'?<>
          <div className="access-card-head">
            <span>PASSWORT VERGESSEN</span>
            <h2>Rücksetz-Link anfordern</h2>
            <p>Gib die E-Mail-Adresse deines MotorAtlas-Kontos ein. Die Rückmeldung ist aus Sicherheitsgründen immer neutral.</p>
          </div>
          <form onSubmit={submit}>
            <label><span>E-Mail</span><div><Mail/><input type="email" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="name@beispiel.de"/></div></label>
            {message&&<div className="access-message">{message}</div>}
            <button className="btn primary xl full access-submit" disabled={busy}>{busy?'Bitte einen Moment …':'Rücksetz-Link senden'} <ArrowRight/></button>
          </form>
          <button className="access-existing" onClick={()=>setTab('login')}>Zurück zur <b>Anmeldung</b></button>
        </>:tab==='password'?<>
          <div className="access-card-head">
            <span>PASSWORT ÄNDERN</span>
            <h2>Neues Passwort festlegen</h2>
            <p>Der Link aus deiner E-Mail hat diesen Vorgang autorisiert. Vergib jetzt dein neues Passwort.</p>
          </div>
          <form onSubmit={submit}>
            <label><span>Neues Passwort</span><div><LockKeyhole/><input type={show?'text':'password'} value={newPassword} onChange={e=>setNewPassword(e.target.value)} minLength={8} required placeholder="Mindestens 8 Zeichen"/><button type="button" className="access-show" onClick={()=>setShow(!show)}>{show?<EyeOff/>:<Eye/>}</button></div></label>
            <label><span>Passwort wiederholen</span><div><LockKeyhole/><input type={show?'text':'password'} value={newPassword2} onChange={e=>setNewPassword2(e.target.value)} minLength={8} required placeholder="Passwort wiederholen"/></div></label>
            {message&&<div className="access-message">{message}</div>}
            <button className="btn primary xl full access-submit" disabled={busy}>{busy?'Bitte einen Moment …':'Passwort speichern'} <ArrowRight/></button>
          </form>
        </>:<>
          <div className="access-card-head">
            <span>{tab==='login'?'WILLKOMMEN ZURÜCK':tab==='customer'?'KOSTENLOS STARTEN':'WERKSTATT EINRICHTEN'}</span>
            <h2>{tab==='login'?'Bei MotorAtlas anmelden':tab==='customer'?'Deine digitale Garage starten':'MotorAtlas für deine Werkstatt starten'}</h2>
            <p>{tab==='login'
              ?'Ein Konto – automatisch die richtige Arbeitsoberfläche.'
              :tab==='customer'
                ?'Fahrzeuge hinterlegen, Werkstatt finden und künftige Vorgänge an einem Ort behalten.'
                :'Werkstattprofil, Team, Kundenanfragen und Werkstattablauf in einer Oberfläche zusammenführen.'}</p>
          </div>

          <form onSubmit={submit}>
            {tab!=='login'&&<label><span>{tab==='workshop'?'Ansprechpartner':'Vor- und Nachname'}</span><div><UserRound/><input value={name} onChange={e=>setName(e.target.value)} required placeholder={tab==='workshop'?'Max Mustermann':'Vor- und Nachname'}/></div></label>}

            {tab==='customer'&&<div className="access-address">
              <label><span>Straße & Hausnummer</span><div><MapPin/><input value={street} onChange={e=>setStreet(e.target.value)} required placeholder="Musterstraße 12"/></div></label>
              <div>
                <label><span>PLZ</span><input value={postalCode} onChange={e=>setPostalCode(e.target.value.replace(/\D/g,'').slice(0,5))} required inputMode="numeric" placeholder="92421"/></label>
                <label><span>Ort</span><input value={city} onChange={e=>setCity(e.target.value)} required placeholder="Schwandorf"/></label>
              </div>
            </div>}

            <label><span>E-Mail</span><div><Mail/><input type="email" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="name@beispiel.de"/></div></label>
            <label><span>Passwort</span><div><LockKeyhole/><input type={show?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} minLength={8} required placeholder="••••••••••••"/><button type="button" className="access-show" onClick={()=>setShow(!show)}>{show?<EyeOff/>:<Eye/>}</button></div></label>
            {tab==='login'&&<button type="button" className="access-forgot" onClick={()=>setTab('reset')}>Passwort vergessen?</button>}

            {message&&<div className="access-message">{message}</div>}

            <button className="btn primary xl full access-submit" disabled={busy}>
              {busy?'Bitte einen Moment …':tab==='login'?'Sicher anmelden':tab==='customer'?'Autofahrer-Konto erstellen':'Werkstattkonto starten'} <ArrowRight/>
            </button>
          </form>
          {tab!=='login'&&<p className="access-privacy-note">Mit der Kontoerstellung nimmst du die <button type="button" onClick={()=>setView('privacy')}>Datenschutzhinweise</button> zur Kenntnis. Für die Bereitstellung des Kontos werden nur die hierfür erforderlichen Daten verarbeitet.</p>}
        </>}

        <div className="access-trust">
          <span><ShieldCheck/> Rollenbasierter Zugriff</span>
          <span><LockKeyhole/> Geschützte Daten</span>
        </div>

        <div className="access-legal-links"><button onClick={()=>setView('privacy')}>Datenschutz</button><span>·</span><button onClick={()=>setView('imprint')}>Impressum</button></div>
        <div className="access-demo">
          <span>MotorAtlas vorab ansehen</span>
          <div><button onClick={()=>setView('office')}><Building2/> Büro</button><button onClick={()=>setView('workshop')}><Car/> Werkstatt</button><button onClick={()=>setView('customer')}><UserRound/> Kunde</button></div>
        </div>
      </section>
    </section>
  </main>;
}
