import { useMemo, useState } from 'react';
import {
  Bell, Building2, CalendarDays, Car, FileText, Home, MapPin, MessageCircle,
  Plus, Search, Settings, ShieldCheck, Sparkles, Users, Wrench
} from 'lucide-react';
import { jobs, type Job, type Stage } from './demo';
import { applyPalette, paletteFromLogo } from './lib';
import { Brand, CarArt, Status, stageLabels, type AppView } from './components';
import { claimWork } from './api';
import { useCustomerWorkspace, useWorkshopWorkspace } from './hooks';
import { VehicleChat } from './VehicleChat';

function Shell({children,title,mode,active,onHome}:{children:React.ReactNode;title:string;mode:string;active:string;onHome:()=>void}){
  const items=[['Übersicht',Home],['Werkstatt',Wrench],['Termine',CalendarDays],['Kunden',Users],['Fahrzeuge',Car],['Dokumente',FileText]] as const;
  return <div className="app-shell"><aside className="sidebar"><button className="side-brand" onClick={onHome}><Brand compact/></button><nav>{items.map(([name,Icon])=><button key={name} className={active===name?'active':''}><Icon size={18}/><span>{name}</span></button>)}</nav><div className="side-bottom"><button><Settings size={18}/><span>Einstellungen</span></button><button className="profile"><span>PW</span><div><b>{title}</b><small>{mode}</small></div></button></div></aside><main className="app-main"><div className="app-top"><div className="app-search"><Search size={17}/><span>Fahrzeug, Kunde oder Auftrag suchen …</span></div><button className="icon-button"><Bell size={18}/><i/></button><div className="top-identity"><span>CS</span><div><b>{title}</b><small>{mode}</small></div></div></div>{children}</main></div>;
}

function PageHead({title,subtitle,children}:{title:string;subtitle:string;children?:React.ReactNode}){return <div className="page-head"><div><h1>{title}</h1><p>{subtitle}</p></div>{children}</div>}

const orderStages:Stage[]=['arrived','diagnosis','approval','repair','pickup'];
type DisplayJob=Job&{orderNumber?:string;rawStage?:string;vehicleId?:string;customerUserId?:string;serviceRequestId?:string|null;updatedAt?:string};
const toneFor=(id:string)=>[...id].reduce((sum,char)=>sum+char.charCodeAt(0),0)%5;
function JobCard({job}:{job:DisplayJob}){return <article className="job-card"><div className="job-car"><CarArt tone={toneFor(job.id)}/><div><b>{job.vehicle}</b><small>{job.plate}{job.mileage?` · ${job.mileage.toLocaleString('de-DE')} km`:''}</small></div></div><p>{job.complaint}</p><footer><span>#{job.orderNumber??job.id.slice(-6)}</span><Status stage={job.stage}/></footer></article>}

export function OfficeDashboard({setView}:{setView:(v:AppView)=>void}){
 const live=useWorkshopWorkspace();
 const displayJobs=(live.isLive?live.jobs:jobs) as DisplayJob[];
 const [chat,setChat]=useState(false); const [selectedId,setSelectedId]=useState<string>(displayJobs[0]?.id??jobs[0].id);
 const selected=displayJobs.find(job=>job.id===selectedId)??displayJobs[0];
 const counts=useMemo(()=>Object.fromEntries(orderStages.map(stage=>[stage,displayJobs.filter(job=>job.stage===stage).length])),[displayJobs]);
 const title=live.identity?.workshopName??'Carplus Service';
 return <Shell onHome={()=>setView('home')} title={title} mode="Büro" active="Übersicht"><div className="page"><PageHead title="Werkstattübersicht" subtitle={live.isLive?'Live-Daten deiner Werkstatt – Änderungen erscheinen auf allen Geräten.':'Produktdemo – so sieht der Echtzeitbetrieb später aus.'}><div className="head-actions"><span className="realtime"><i/> {live.isLive?'Echtzeit verbunden':'Demo-Modus'}</span><button className="btn primary"><Plus size={16}/> Neue Annahme</button></div></PageHead>
 {live.error&&<div className="workspace-alert">{live.error}</div>}
 <div className="metrics"><article><small>AKTIVE VORGÄNGE</small><b>{displayJobs.length}</b><span>gesamt</span></article><article><small>EINGETROFFEN</small><b>{counts.arrived??0}</b><span>Diagnose offen</span></article><article><small>FREIGABEN</small><b>{counts.approval??0}</b><span>offen</span></article><article><small>ABHOLBEREIT</small><b>{counts.pickup??0}</b><span>Fahrzeuge</span></article></div>
 <div className="board">{orderStages.map(stage=><section key={stage}><header><span>{stageLabels[stage]}</span><b>{counts[stage]??0}</b></header><div>{displayJobs.filter(job=>job.stage===stage).map(job=><button className="card-button" onClick={()=>setSelectedId(job.id)} key={job.id}><JobCard job={job}/></button>)}</div></section>)}</div>
 <div className="lower-grid">{selected?<section className="panel focus-card"><div><span className="overline">AUSGEWÄHLTER VORGANG</span><h3>{selected.vehicle}</h3><small>{selected.plate} · Auftrag #{selected.orderNumber??selected.id.slice(-6)}</small></div><div className="focus-action"><Status stage={selected.stage}/><button className="btn secondary" onClick={()=>setChat(true)}><MessageCircle size={16}/> Fahrzeugchat</button><button className="btn primary">Vorgang öffnen</button></div></section>:<section className="panel focus-card"><div><span className="overline">KEINE AKTIVEN VORGÄNGE</span><h3>Die Werkstatt-Queue ist leer.</h3><small>Neue bestätigte Termine erscheinen hier automatisch.</small></div></section>}
 <section className="panel incoming"><div><span className="overline">{live.isLive?'KUNDENAUFNAHME':'NEUE KUNDENANFRAGE'}</span><h3>{live.isLive?'Freigaben bleiben beim Büro':'Anna Meier'}</h3><p>{live.isLive?'Neue Kundenanfragen werden getrennt von Werkstattaufträgen bearbeitet.':'möchte Kunde bei Carplus Service Center werden.'}</p></div>{!live.isLive&&<div><button className="btn secondary">Ablehnen</button><button className="btn primary">Annehmen</button></div>}</section></div></div>
 {selected&&<VehicleChat open={chat} onClose={()=>setChat(false)} audience="workshop" workOrderId={live.isLive?selected.id:null} vehicleLabel={selected.vehicle} plate={selected.plate} orderNumber={selected.orderNumber??selected.id.slice(-6)}/>}
 </Shell>;
}

export function WorkshopBoard({setView}:{setView:(v:AppView)=>void}){
 const live=useWorkshopWorkspace();
 const allJobs=(live.isLive?live.jobs:jobs) as DisplayJob[];
 const queue=allJobs.filter(job=>job.stage==='arrived'||job.stage==='repair');
 const [claimed,setClaimed]=useState<string[]>([]);
 const [selectedId,setSelectedId]=useState<string>(queue[0]?.id??'');
 const selected=queue.find(job=>job.id===selectedId)??queue[0];
 const [chat,setChat]=useState(false); const [busy,setBusy]=useState(false); const [actionError,setActionError]=useState<string|null>(null);
 const take=async(job:DisplayJob)=>{
   setSelectedId(job.id);setActionError(null);
   if(!live.isLive){setClaimed(value=>value.includes(job.id)?value:[...value,job.id]);return;}
   setBusy(true);
   try{await claimWork(job.id,job.stage==='repair'?'repair':'diagnosis');setClaimed(value=>value.includes(job.id)?value:[...value,job.id]);await live.reload()}
   catch(err){setActionError(err instanceof Error?err.message:'Auftrag konnte nicht übernommen werden.')}
   finally{setBusy(false)}
 };
 const title=live.identity?.workshopName??'Carplus Service';
 return <Shell onHome={()=>setView('home')} title={title} mode="Werkstatt" active="Werkstatt"><div className="page workshop-page"><PageHead title="Werkstattboard" subtitle="Nächsten Auftrag nehmen. Arbeiten. Ergebnis eintragen."><span className="realtime"><i/> {live.isLive?'Live mit dem Büro':'Demo-Modus'}</span></PageHead>
 {(live.error||actionError)&&<div className="workspace-alert">{live.error??actionError}</div>}
 <div className="workshop-grid"><section className="panel queue"><div className="panel-title"><div><span className="overline">OFFENE ARBEITEN</span><h3>{queue.length} Fahrzeuge warten</h3></div><b>{queue.length}</b></div>
 {queue.length===0&&<div className="queue-empty"><b>Aktuell nichts offen.</b><span>Sobald das Büro ein Fahrzeug als eingetroffen markiert oder eine Reparatur freigegeben wird, erscheint es hier.</span></div>}
 {queue.map((job,index)=><article key={job.id} className={selected?.id===job.id?'selected':''} onClick={()=>setSelectedId(job.id)}><span className={`queue-index ${job.stage==='repair'?'repair':''}`}>{job.stage==='repair'?'R':index+1}</span><div className="queue-copy"><b>{job.vehicle}</b><small>{job.plate}</small><p>{job.stage==='repair'?'Reparatur vom Kunden freigegeben':job.complaint}</p></div><button className={`btn ${claimed.includes(job.id)||job.assignee?'muted':'primary'}`} disabled={busy||claimed.includes(job.id)||Boolean(job.assignee)} onClick={event=>{event.stopPropagation();void take(job)}}>{job.assignee?`Bei ${job.assignee}`:claimed.includes(job.id)?'Übernommen':job.stage==='repair'?'Reparatur nehmen':'Diagnose nehmen'}</button></article>)}</section>
 <section className="panel work-card"><span className="overline">WERKSTATTKARTE</span>{selected?<><div className="work-car"><CarArt large tone={toneFor(selected.id)}/><div><h2>{selected.vehicle}</h2><span className="plate">{selected.plate}</span></div></div><div className="complaint"><small>KUNDENBEANSTANDUNG</small><p>{selected.complaint}</p></div><div className="work-buttons"><button className="btn primary xl full">{selected.stage==='repair'?'Reparatur öffnen':'Diagnose eintragen'}</button>{(claimed.includes(selected.id)||Boolean(selected.assignee))&&<button className="btn secondary full" onClick={()=>setChat(true)}><MessageCircle size={17}/> Fahrzeugchat</button>}</div><p className="permission-note">Der Chat erscheint dem Mechaniker nur bei übernommenem Auftrag oder ausdrücklicher Berechtigung.</p></>:<div className="work-empty"><Car size={34}/><b>Keine Werkstattkarte ausgewählt.</b><span>Neue Arbeiten erscheinen automatisch in der Queue.</span></div>}</section></div></div>
 {selected&&<VehicleChat open={chat} onClose={()=>setChat(false)} audience="workshop" workOrderId={live.isLive?selected.id:null} vehicleLabel={selected.vehicle} plate={selected.plate} orderNumber={selected.orderNumber??selected.id.slice(-6)}/>}
 </Shell>;
}

function VehicleCard({name,plate,detail,active,tone}:{name:string;plate:string;detail:string;active?:boolean;tone:number}){return <article className="panel vehicle-card"><CarArt large tone={tone}/><div className="vehicle-title"><div><h3>{name}</h3><small>{detail}</small></div><span className="plate">{plate}</span></div>{active?<div className="vehicle-current"><Status stage="approval"/><b>Motorkontrollleuchte</b><small>Kostenvoranschlag liegt vor.</small></div>:<div className="vehicle-current neutral"><span>LETZTER SERVICE</span><b>Inspektion</b><small>17.06.2026</small></div>}</article>}

export function CustomerPortal({setView}:{setView:(v:AppView)=>void}){
 const live=useCustomerWorkspace(); const [approved,setApproved]=useState(false); const [chat,setChat]=useState(false);
 const activeOrder=live.isLive?live.orders.find(order=>order.rawStage!=='closed'&&order.rawStage!=='cancelled'):null;
 const activeVehicle=activeOrder?live.vehicles.find(vehicle=>vehicle.id===activeOrder.vehicleId):live.vehicles[0];
 return <Shell onHome={()=>setView('home')} title="Meine Garage" mode="Kundenportal" active="Fahrzeuge"><div className="page"><PageHead title="Meine Garage" subtitle={live.isLive?'Deine echten Fahrzeuge, Aufträge und Dokumente an einem Ort.':'Produktdemo des Kundenportals.'}><div className="head-actions"><button className="btn secondary"><MapPin size={16}/> Werkstatt finden</button><button className="btn secondary" onClick={()=>setChat(true)} disabled={live.isLive&&!activeOrder}><MessageCircle size={16}/> Chat {!live.isLive&&<span className="badge">1</span>}</button><button className="btn primary"><Plus size={16}/> Anfrage starten</button></div></PageHead>
 {live.error&&<div className="workspace-alert">{live.error}</div>}
 {live.isLive?<div className="customer-layout"><div className="garage">{live.vehicles.length?live.vehicles.map((vehicle,index)=><VehicleCard key={vehicle.id} name={[vehicle.make,vehicle.model,vehicle.variant].filter(Boolean).join(' ')} plate={vehicle.licensePlate} detail={`${vehicle.firstRegistration?new Date(vehicle.firstRegistration).getFullYear():'—'} · ${vehicle.mileage?.toLocaleString('de-DE')??'—'} km`} active={activeOrder?.vehicleId===vehicle.id} tone={index}/>):<section className="panel vehicle-card empty-card"><Car size={30}/><h3>Noch kein Fahrzeug hinterlegt.</h3><small>Lege deinen ersten PKW an, um eine Werkstattanfrage zu starten.</small></section>}</div>
 <section className="panel timeline"><div className="panel-title"><div><span className="overline">{activeOrder?`AUFTRAG #${activeOrder.orderNumber}`:'KEIN AKTIVER AUFTRAG'}</span><h3>{activeOrder?'Aktueller Auftrag':'Alles erledigt'}</h3></div>{activeOrder&&<Status stage={activeOrder.stage}/>}</div>
 {activeOrder?<><Timeline title="Auftrag aktiv" detail={`Zuletzt aktualisiert: ${new Date(activeOrder.updatedAt).toLocaleString('de-DE')}`} current/><Timeline title="Nächster Schritt" detail={activeOrder.stage==='approval'?'Kostenvoranschlag/Freigabe wird im Dokumentbereich angezeigt.':activeOrder.stage==='repair'?'Die Werkstatt bearbeitet den freigegebenen Auftrag.':activeOrder.stage==='pickup'?'Bitte Abholung mit der Werkstatt abstimmen.':'Status wird automatisch mit der Werkstatt synchronisiert.'}/></>:<div className="timeline-empty"><b>Kein laufender Werkstattauftrag.</b><span>Neue Anfragen und bestätigte Termine erscheinen hier automatisch.</span></div>}</section></div>:
 <div className="customer-layout"><div className="garage"><VehicleCard name="BMW X3 3.0i" plate="SAD XX 123" detail="2005 · 247.318 km" active tone={0}/><VehicleCard name="VW Golf VII" plate="SAD VW 407" detail="2016 · 128.140 km" tone={1}/></div><section className="panel timeline"><div className="panel-title"><div><span className="overline">BMW X3 · AUFTRAG #184</span><h3>Aktueller Auftrag</h3></div><Status stage={approved?'repair':'approval'}/></div><Timeline title="Fahrzeug eingetroffen" detail="08:41 · Carplus Service Center"/><Timeline title="Diagnose abgeschlossen" detail="09:12 · Lambdasonde Bank 1 vor Kat"/><Timeline current title={approved?'Reparatur freigegeben':'Deine Freigabe ist erforderlich'} detail={approved?'09:31 · an Werkstatt übermittelt':'09:26 · Kostenvoranschlag bereitgestellt'}>{!approved&&<div className="quote"><div><small>KOSTENVORANSCHLAG · PDF</small><b>328,40 €</b><span>inkl. MwSt.</span></div><p>Lambdasonde Bank 1 vor Kat + Einbau</p><div><button className="btn primary" onClick={()=>setApproved(true)}>Reparatur freigeben</button><button className="btn secondary" onClick={()=>setChat(true)}>Rückfrage</button></div></div>}</Timeline><Timeline title="Reparatur" detail={approved?'Auftrag steht in der Werkstatt-Queue':'Startet nach Freigabe'}/><Timeline title="Abholbereit" detail="Noch nicht erreicht" last/></section></div>}
 </div>
 <VehicleChat open={chat} onClose={()=>setChat(false)} audience="customer" workOrderId={live.isLive?activeOrder?.id:null} vehicleLabel={live.isLive&&activeVehicle?[activeVehicle.make,activeVehicle.model,activeVehicle.variant].filter(Boolean).join(' '):'BMW X3 3.0i'} plate={live.isLive&&activeVehicle?activeVehicle.licensePlate:'SAD XX 123'} orderNumber={live.isLive&&activeOrder?activeOrder.orderNumber:'184'}/>
 </Shell>;
}

function Timeline({title,detail,current=false,last=false,children}:{title:string;detail:string;current?:boolean;last?:boolean;children?:React.ReactNode}){return <div className={`timeline-row ${current?'current':''} ${last?'last':''}`}><i/><div><b>{title}</b><small>{detail}</small>{children}</div></div>}

export function BrandingPage({setView}:{setView:(v:AppView)=>void}){
 const [url,setUrl]=useState<string>(); const [mode,setMode]=useState<'solo'|'team'>('solo');
 const logo=async(file?:File)=>{if(!file)return;const palette=await paletteFromLogo(file);applyPalette(palette);if(url)URL.revokeObjectURL(url);setUrl(URL.createObjectURL(file))};
 return <Shell onHome={()=>setView('home')} title="Carplus Service" mode="Werkstattprofil" active=""><div className="page"><PageHead title="Deine Werkstatt. Deine Identität." subtitle="MotorAtlas übernimmt die Wirkung deines Logos – aber nicht seine Lautstärke."><button className="btn primary">Änderungen speichern</button></PageHead><div className="branding-grid"><section className="panel"><span className="overline">ADAPTIVES BRANDING</span><h3>Logo rein. Premium-Farbsystem raus.</h3><p>MotorAtlas analysiert die dominante Markenfarbe und erzeugt daraus kontraststarke, dezente UI-Akzente.</p><label className="logo-upload"><Sparkles/><b>Werkstattlogo hochladen</b><span>PNG, JPG oder WebP</span><input type="file" accept="image/*" onChange={e=>logo(e.target.files?.[0])}/></label><div className="swatches"><i/><i/><i/></div></section><section className="panel preview"><span className="overline">LIVE-VORSCHAU</span><div className="profile-preview"><div className="preview-logo">{url?<img src={url} alt="Werkstattlogo"/>:<span>CS</span>}</div><div><b>Carplus Service Center</b><small><ShieldCheck size={14}/> Verifizierte Werkstatt</small></div></div><div className="preview-order"><Status stage="repair"/><h3>BMW X3 3.0i</h3><small>Auftrag #184 · Reparatur freigegeben</small><button className="btn primary full">Auftrag öffnen</button></div></section></div><section className="panel org-mode"><span className="overline">ORGANISATION</span><h3>Die Oberfläche passt sich an deinen Betrieb an.</h3><div><button className={mode==='solo'?'selected':''} onClick={()=>setMode('solo')}><Building2/><b>Einzelbetrieb</b><span>Eine Person sieht Büro und Werkstatt in einem flüssigen Ablauf.</span></button><button className={mode==='team'?'selected':''} onClick={()=>setMode('team')}><Users/><b>Team-Betrieb</b><span>Büro, Mechaniker und individuelle Berechtigungen arbeiten synchron.</span></button></div></section></div></Shell>;
}
