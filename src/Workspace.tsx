import { useEffect, useMemo, useState } from 'react';
import {
  Bell, Building2, CalendarDays, Car, FileText, Home, MapPin, MessageCircle,
  Plus, Search, Settings, ShieldCheck, Sparkles, Users, Wrench
} from 'lucide-react';
import { jobs, type Job, type Stage } from './demo';
import { applyPalette, paletteFromLogo } from './lib';
import { Brand, CarArt, Status, stageLabels, type AppView } from './components';
import { claimWork, closeWorkOrder, completeRepair, createWorkshop, getDocumentVersionUrl, getWorkshopLogoPublicUrl, getWorkshopProfile, listWorkOrderDocuments, markReadyForPickup, markVehicleArrived, recordApproval, updateWorkshopProfile, uploadWorkshopLogo } from './api';
import { useCustomerWorkspace, useWorkshopWorkspace } from './hooks';
import { VehicleChat } from './VehicleChat';
import { VehicleCreateModal, VehiclePhoto } from './VehicleModal';
import { DiagnosisModal, DocumentUploadModal } from './WorkflowModals';

function Shell({children,title,mode,active,onHome}:{children:React.ReactNode;title:string;mode:string;active:string;onHome:()=>void}){
  const items=[['Übersicht',Home],['Werkstatt',Wrench],['Termine',CalendarDays],['Kunden',Users],['Fahrzeuge',Car],['Dokumente',FileText]] as const;
  return <div className="app-shell"><aside className="sidebar"><button className="side-brand" onClick={onHome}><Brand compact/></button><nav>{items.map(([name,Icon])=><button key={name} className={active===name?'active':''}><Icon size={18}/><span>{name}</span></button>)}</nav><div className="side-bottom"><button><Settings size={18}/><span>Einstellungen</span></button><button className="profile"><span>PW</span><div><b>{title}</b><small>{mode}</small></div></button></div></aside><main className="app-main"><div className="app-top"><div className="app-search"><Search size={17}/><span>Fahrzeug, Kunde oder Auftrag suchen …</span></div><button className="icon-button"><Bell size={18}/><i/></button><div className="top-identity"><span>CS</span><div><b>{title}</b><small>{mode}</small></div></div></div>{children}</main></div>;
}

function PageHead({title,subtitle,children}:{title:string;subtitle:string;children?:React.ReactNode}){return <div className="page-head"><div><h1>{title}</h1><p>{subtitle}</p></div>{children}</div>}

const orderStages:Stage[]=['arrived','diagnosis','approval','repair','pickup'];
type DisplayJob=Job&{orderNumber?:string;rawStage?:string;vehicleId?:string;customerUserId?:string;serviceRequestId?:string|null;updatedAt?:string;assigneeUserId?:string|null};
const toneFor=(id:string)=>[...id].reduce((sum,char)=>sum+char.charCodeAt(0),0)%5;
function JobCard({job}:{job:DisplayJob}){return <article className="job-card"><div className="job-car"><CarArt tone={toneFor(job.id)}/><div><b>{job.vehicle}</b><small>{job.plate}{job.mileage?` · ${job.mileage.toLocaleString('de-DE')} km`:''}</small></div></div><p>{job.complaint}</p><footer><span>#{job.orderNumber??job.id.slice(-6)}</span><Status stage={job.stage}/></footer></article>}

export function OfficeDashboard({setView}:{setView:(v:AppView)=>void}){
 const live=useWorkshopWorkspace();
 const displayJobs=(live.isLive?live.jobs:jobs) as DisplayJob[];
 const [chat,setChat]=useState(false); const [selectedId,setSelectedId]=useState<string>(displayJobs[0]?.id??jobs[0].id);
 const [docType,setDocType]=useState<'quote'|'invoice'|null>(null);
 const [busy,setBusy]=useState(false); const [actionError,setActionError]=useState<string|null>(null);
 const selected=displayJobs.find(job=>job.id===selectedId)??displayJobs[0];
 const counts=useMemo(()=>Object.fromEntries(orderStages.map(stage=>[stage,displayJobs.filter(job=>job.stage===stage).length])),[displayJobs]);
 const title=live.identity?.workshopName??'Carplus Service';

 const actionLabel=()=>{
   if(!live.isLive||!selected)return'Vorgang öffnen';
   switch(selected.rawStage){
     case'appointment_confirmed':return'Fahrzeug eingetroffen';
     case'awaiting_quote':return'Kostenvoranschlag hochladen';
     case'awaiting_customer_approval':return'Wartet auf Kundenfreigabe';
     case'repair_complete':return'Rechnung hochladen';
     case'ready_for_pickup':return'Fahrzeug abgeholt';
     default:return'Vorgang öffnen';
   }
 };

 const runPrimary=async()=>{
   if(!selected||busy)return;
   if(!live.isLive)return;
   setActionError(null);
   if(selected.rawStage==='awaiting_quote'){setDocType('quote');return;}
   if(selected.rawStage==='repair_complete'){setDocType('invoice');return;}
   if(selected.rawStage==='awaiting_customer_approval')return;
   setBusy(true);
   try{
     if(selected.rawStage==='appointment_confirmed')await markVehicleArrived(selected.id);
     else if(selected.rawStage==='ready_for_pickup')await closeWorkOrder(selected.id);
     await live.reload();
   }catch(err){setActionError(err instanceof Error?err.message:'Aktion konnte nicht ausgeführt werden.')}
   finally{setBusy(false)}
 };

 const documentDone=async()=>{
   if(!selected)return;
   if(docType==='invoice')await markReadyForPickup(selected.id);
   await live.reload();
 };

 return <Shell onHome={()=>setView('home')} title={title} mode="Büro" active="Übersicht"><div className="page"><PageHead title="Werkstattübersicht" subtitle={live.isLive?'Live-Daten deiner Werkstatt – Änderungen erscheinen auf allen Geräten.':'Produktdemo – so sieht der Echtzeitbetrieb später aus.'}><div className="head-actions"><span className="realtime"><i/> {live.isLive?'Echtzeit verbunden':'Demo-Modus'}</span><button className="btn primary"><Plus size={16}/> Neue Annahme</button></div></PageHead>
 {(live.error||actionError)&&<div className="workspace-alert">{live.error??actionError}</div>}
 <div className="metrics"><article><small>AKTIVE VORGÄNGE</small><b>{displayJobs.length}</b><span>gesamt</span></article><article><small>ANNAHME / DIAGNOSE</small><b>{counts.arrived??0}</b><span>offen</span></article><article><small>FREIGABEN</small><b>{counts.approval??0}</b><span>offen</span></article><article><small>ABHOLBEREIT</small><b>{counts.pickup??0}</b><span>Fahrzeuge</span></article></div>
 <div className="board">{orderStages.map(stage=><section key={stage}><header><span>{stageLabels[stage]}</span><b>{counts[stage]??0}</b></header><div>{displayJobs.filter(job=>job.stage===stage).map(job=><button className="card-button" onClick={()=>setSelectedId(job.id)} key={job.id}><JobCard job={job}/></button>)}</div></section>)}</div>
 <div className="lower-grid">{selected?<section className="panel focus-card"><div><span className="overline">AUSGEWÄHLTER VORGANG</span><h3>{selected.vehicle}</h3><small>{selected.plate} · Auftrag #{selected.orderNumber??selected.id.slice(-6)}</small></div><div className="focus-action"><Status stage={selected.stage}/><button className="btn secondary" onClick={()=>setChat(true)}><MessageCircle size={16}/> Fahrzeugchat</button><button className="btn primary" disabled={busy||Boolean(live.isLive&&selected.rawStage==='awaiting_customer_approval')} onClick={()=>void runPrimary()}>{busy?'Bitte warten …':actionLabel()}</button></div></section>:<section className="panel focus-card"><div><span className="overline">KEINE AKTIVEN VORGÄNGE</span><h3>Die Werkstatt-Queue ist leer.</h3><small>Neue bestätigte Termine erscheinen hier automatisch.</small></div></section>}
 <section className="panel incoming"><div><span className="overline">{live.isLive?'KUNDENAUFNAHME':'NEUE KUNDENANFRAGE'}</span><h3>{live.isLive?'Freigaben bleiben beim Büro':'Anna Meier'}</h3><p>{live.isLive?'Neue Kundenanfragen werden getrennt von Werkstattaufträgen bearbeitet.':'möchte Kunde bei Carplus Service Center werden.'}</p></div>{!live.isLive&&<div><button className="btn secondary">Ablehnen</button><button className="btn primary">Annehmen</button></div>}</section></div></div>
 {selected&&<VehicleChat open={chat} onClose={()=>setChat(false)} audience="workshop" workOrderId={live.isLive?selected.id:null} vehicleLabel={selected.vehicle} plate={selected.plate} orderNumber={selected.orderNumber??selected.id.slice(-6)}/>}
 {selected&&live.identity&&docType&&<DocumentUploadModal open={Boolean(docType)} onClose={()=>setDocType(null)} onDone={documentDone} workOrderId={selected.id} workshopId={live.identity.workshopId} vehicle={selected.vehicle} type={docType}/>}
 </Shell>;
}

export function WorkshopBoard({setView}:{setView:(v:AppView)=>void}){
 const live=useWorkshopWorkspace();
 const allJobs=(live.isLive?live.jobs:jobs) as DisplayJob[];
 const queue=live.isLive
   ?allJobs.filter(job=>['waiting_diagnosis','diagnosing','ready_for_repair','repairing'].includes(job.rawStage??''))
   :allJobs.filter(job=>job.stage==='arrived'||job.stage==='repair');
 const [claimed,setClaimed]=useState<string[]>([]);
 const [selectedId,setSelectedId]=useState<string>(queue[0]?.id??'');
 const selected=queue.find(job=>job.id===selectedId)??queue[0];
 const [chat,setChat]=useState(false); const [diagnosis,setDiagnosis]=useState(false);
 const [busy,setBusy]=useState(false); const [actionError,setActionError]=useState<string|null>(null);
 const title=live.identity?.workshopName??'Carplus Service';

 const owned=(job:DisplayJob)=>!live.isLive?claimed.includes(job.id):job.assigneeUserId===live.identity?.userId;
 const take=async(job:DisplayJob)=>{
   setSelectedId(job.id);setActionError(null);
   if(!live.isLive){setClaimed(value=>value.includes(job.id)?value:[...value,job.id]);return;}
   setBusy(true);
   try{await claimWork(job.id,job.rawStage==='ready_for_repair'?'repair':'diagnosis');await live.reload()}
   catch(err){setActionError(err instanceof Error?err.message:'Auftrag konnte nicht übernommen werden.')}
   finally{setBusy(false)}
 };

 const primary=async()=>{
   if(!selected||busy)return;
   setActionError(null);
   if(!live.isLive){
     if(!claimed.includes(selected.id)){await take(selected);return;}
     if(selected.stage!=='repair'){setDiagnosis(true);return;}
     return;
   }
   if(selected.rawStage==='waiting_diagnosis'||selected.rawStage==='ready_for_repair'){await take(selected);return;}
   if(selected.rawStage==='diagnosing'){if(owned(selected))setDiagnosis(true);return;}
   if(selected.rawStage==='repairing'){
     if(!owned(selected))return;
     setBusy(true);
     try{await completeRepair(selected.id);await live.reload()}
     catch(err){setActionError(err instanceof Error?err.message:'Reparatur konnte nicht abgeschlossen werden.')}
     finally{setBusy(false)}
   }
 };

 const primaryLabel=()=>{
   if(!selected)return'Kein Auftrag';
   if(!live.isLive)return claimed.includes(selected.id)?(selected.stage==='repair'?'Reparatur abschließen':'Diagnose eintragen'):(selected.stage==='repair'?'Reparatur nehmen':'Diagnose nehmen');
   if(selected.rawStage==='waiting_diagnosis')return'Diagnose übernehmen';
   if(selected.rawStage==='diagnosing')return owned(selected)?'Diagnose eintragen':'Bei '+(selected.assignee??'Kollege');
   if(selected.rawStage==='ready_for_repair')return'Reparatur übernehmen';
   if(selected.rawStage==='repairing')return owned(selected)?'Reparatur abschließen':'Bei '+(selected.assignee??'Kollege');
   return'Öffnen';
 };

 return <Shell onHome={()=>setView('home')} title={title} mode="Werkstatt" active="Werkstatt"><div className="page workshop-page"><PageHead title="Werkstattboard" subtitle="Nächsten Auftrag nehmen. Arbeiten. Ergebnis eintragen."><span className="realtime"><i/> {live.isLive?'Live mit dem Büro':'Demo-Modus'}</span></PageHead>
 {(live.error||actionError)&&<div className="workspace-alert">{live.error??actionError}</div>}
 <div className="workshop-grid"><section className="panel queue"><div className="panel-title"><div><span className="overline">OFFENE ARBEITEN</span><h3>{queue.length} Fahrzeuge in der Werkstatt</h3></div><b>{queue.length}</b></div>
 {queue.length===0&&<div className="queue-empty"><b>Aktuell nichts offen.</b><span>Sobald das Büro ein Fahrzeug als eingetroffen markiert oder eine Reparatur freigegeben wird, erscheint es hier.</span></div>}
 {queue.map((job,index)=><article key={job.id} className={selected?.id===job.id?'selected':''} onClick={()=>setSelectedId(job.id)}><span className={`queue-index ${job.stage==='repair'?'repair':''}`}>{job.stage==='repair'?'R':index+1}</span><div className="queue-copy"><b>{job.vehicle}</b><small>{job.plate}</small><p>{job.rawStage==='repairing'?'Reparatur in Arbeit':job.rawStage==='diagnosing'?'Diagnose in Arbeit':job.stage==='repair'?'Reparatur vom Kunden freigegeben':job.complaint}</p></div><button className={`btn ${owned(job)||job.assignee?'muted':'primary'}`} disabled={busy||Boolean(job.assignee&&!owned(job))} onClick={event=>{event.stopPropagation();void primaryFor(job)}}>{job.assignee&&!owned(job)?`Bei ${job.assignee}`:owned(job)?'Mein Auftrag':job.stage==='repair'?'Reparatur nehmen':'Diagnose nehmen'}</button></article>)}</section>
 <section className="panel work-card"><span className="overline">WERKSTATTKARTE</span>{selected?<><div className="work-car"><CarArt large tone={toneFor(selected.id)}/><div><h2>{selected.vehicle}</h2><span className="plate">{selected.plate}</span></div></div><div className="complaint"><small>KUNDENBEANSTANDUNG</small><p>{selected.complaint}</p></div><div className="work-buttons"><button className="btn primary xl full" disabled={busy||Boolean(live.isLive&&selected.assignee&&!owned(selected))} onClick={()=>void primary()}>{busy?'Bitte warten …':primaryLabel()}</button>{(owned(selected)||!live.isLive)&&<button className="btn secondary full" onClick={()=>setChat(true)}><MessageCircle size={17}/> Fahrzeugchat</button>}</div><p className="permission-note">Ein übernommener Auftrag ist dem Mechaniker eindeutig zugeordnet. Andere Mitarbeiter sehen den Status, können ihn aber nicht abschließen.</p></>:<div className="work-empty"><Car size={34}/><b>Keine Werkstattkarte ausgewählt.</b><span>Neue Arbeiten erscheinen automatisch in der Queue.</span></div>}</section></div></div>
 {selected&&<VehicleChat open={chat} onClose={()=>setChat(false)} audience="workshop" workOrderId={live.isLive?selected.id:null} vehicleLabel={selected.vehicle} plate={selected.plate} orderNumber={selected.orderNumber??selected.id.slice(-6)}/>}
 {selected&&<DiagnosisModal open={diagnosis} onClose={()=>setDiagnosis(false)} onDone={live.reload} workOrderId={selected.id} vehicle={selected.vehicle}/>}
 </Shell>;

 async function primaryFor(job:DisplayJob){
   setSelectedId(job.id);
   if(live.isLive&&(job.rawStage==='diagnosing'||job.rawStage==='repairing'))return;
   await take(job);
 }
}

function VehicleCard({name,plate,detail,active,tone,stage='approval',demo=false,photoPath}:{name:string;plate:string;detail:string;active?:boolean;tone:number;stage?:Stage;demo?:boolean;photoPath?:string|null}){return <article className="panel vehicle-card">{demo||!photoPath?<CarArt large tone={tone}/>:<VehiclePhoto path={photoPath} alt={name}/>} <div className="vehicle-title"><div><h3>{name}</h3><small>{detail}</small></div><span className="plate">{plate}</span></div>{active?<div className="vehicle-current"><Status stage={stage}/><b>Aktiver Werkstattauftrag</b><small>Status wird automatisch synchronisiert.</small></div>:demo?<div className="vehicle-current neutral"><span>LETZTER SERVICE</span><b>Inspektion</b><small>17.06.2026</small></div>:<div className="vehicle-current neutral"><span>STATUS</span><b>Kein aktiver Auftrag</b><small>Fahrzeug ist in deiner Garage gespeichert.</small></div>}</article>}

export function CustomerPortal({setView}:{setView:(v:AppView)=>void}){
 const live=useCustomerWorkspace(); const [approved,setApproved]=useState(false); const [chat,setChat]=useState(false); const [vehicleModal,setVehicleModal]=useState(false);
 const [documents,setDocuments]=useState<any[]>([]); const [docError,setDocError]=useState<string|null>(null); const [busy,setBusy]=useState(false);
 const activeOrder=live.isLive?live.orders.find(order=>order.rawStage!=='closed'&&order.rawStage!=='cancelled'):null;
 const activeVehicle=activeOrder?live.vehicles.find(vehicle=>vehicle.id===activeOrder.vehicleId):live.vehicles[0];

 useEffect(()=>{
   if(!live.isLive||!activeOrder){setDocuments([]);return}
   let cancelled=false;
   listWorkOrderDocuments(activeOrder.id).then(data=>{if(!cancelled){setDocuments(data);setDocError(null)}}).catch(err=>{if(!cancelled)setDocError(err instanceof Error?err.message:'Dokumente konnten nicht geladen werden.')});
   return()=>{cancelled=true};
 },[live.isLive,activeOrder?.id,activeOrder?.updatedAt]);

 const quote=documents.find(document=>document.document_type==='quote'&&document.status==='published');
 const invoice=documents.find(document=>document.document_type==='invoice'&&document.status==='published');

 const openDocument=async(document:any)=>{
   const version=document?.versions?.[0];if(!version)return;
   try{const url=await getDocumentVersionUrl(version.storage_path);window.open(url,'_blank','noopener,noreferrer')}
   catch(err){setDocError(err instanceof Error?err.message:'Dokument konnte nicht geöffnet werden.')}
 };

 const approve=async(decision:'approved'|'question_requested')=>{
   if(!activeOrder||!quote||busy)return;
   if(decision==='question_requested'){setChat(true);return;}
   setBusy(true);setDocError(null);
   try{await recordApproval({workOrderId:activeOrder.id,quoteDocumentId:quote.id,decision:'approved',method:'portal'});await live.reload()}
   catch(err){setDocError(err instanceof Error?err.message:'Freigabe konnte nicht gespeichert werden.')}
   finally{setBusy(false)}
 };

 return <Shell onHome={()=>setView('home')} title="Meine Garage" mode="Kundenportal" active="Fahrzeuge"><div className="page"><PageHead title="Meine Garage" subtitle={live.isLive?'Deine echten Fahrzeuge, Aufträge und Dokumente an einem Ort.':'Produktdemo des Kundenportals.'}><div className="head-actions"><button className="btn secondary"><MapPin size={16}/> Werkstatt finden</button><button className="btn secondary" onClick={()=>setVehicleModal(true)}><Plus size={16}/> Fahrzeug</button><button className="btn secondary" onClick={()=>setChat(true)} disabled={live.isLive&&!activeOrder}><MessageCircle size={16}/> Chat {!live.isLive&&<span className="badge">1</span>}</button><button className="btn primary"><Plus size={16}/> Anfrage starten</button></div></PageHead>
 {(live.error||docError)&&<div className="workspace-alert">{live.error??docError}</div>}
 {live.isLive?<div className="customer-layout"><div className="garage">{live.vehicles.length?live.vehicles.map((vehicle,index)=><VehicleCard key={vehicle.id} name={[vehicle.make,vehicle.model,vehicle.variant].filter(Boolean).join(' ')} plate={vehicle.licensePlate} detail={`${vehicle.firstRegistration?new Date(vehicle.firstRegistration).getFullYear():'—'} · ${vehicle.mileage?.toLocaleString('de-DE')??'—'} km`} active={activeOrder?.vehicleId===vehicle.id} stage={activeOrder?.vehicleId===vehicle.id?activeOrder.stage:undefined} tone={index} photoPath={vehicle.photoPath}/>):<section className="panel vehicle-card empty-card"><Car size={30}/><h3>Noch kein Fahrzeug hinterlegt.</h3><small>Lege deinen ersten PKW an, um eine Werkstattanfrage zu starten.</small></section>}</div>
 <section className="panel timeline"><div className="panel-title"><div><span className="overline">{activeOrder?`AUFTRAG #${activeOrder.orderNumber}`:'KEIN AKTIVER AUFTRAG'}</span><h3>{activeOrder?'Aktueller Auftrag':'Alles erledigt'}</h3></div>{activeOrder&&<Status stage={activeOrder.stage}/>}</div>
 {activeOrder?<><Timeline title="Auftrag aktiv" detail={`Zuletzt aktualisiert: ${new Date(activeOrder.updatedAt).toLocaleString('de-DE')}`} current/>
 {quote&&<div className="customer-document-card"><div><FileText/><span><small>KOSTENVORANSCHLAG</small><b>{quote.document_number||'Dokument'}</b></span><strong>{quote.amount_total!=null?Number(quote.amount_total).toLocaleString('de-DE',{style:'currency',currency:quote.currency||'EUR'}):''}</strong></div><div><button className="btn secondary" onClick={()=>void openDocument(quote)}>PDF öffnen</button>{activeOrder.rawStage==='awaiting_customer_approval'&&<button className="btn primary" disabled={busy} onClick={()=>void approve('approved')}>{busy?'Wird gespeichert …':'Reparatur freigeben'}</button>}<button className="btn secondary" onClick={()=>void approve('question_requested')}>Rückfrage</button></div></div>}
 {invoice&&<div className="customer-document-card invoice-card"><div><FileText/><span><small>RECHNUNG</small><b>{invoice.document_number||'Dokument'}</b></span><strong>{invoice.amount_total!=null?Number(invoice.amount_total).toLocaleString('de-DE',{style:'currency',currency:invoice.currency||'EUR'}):''}</strong></div><div><button className="btn primary" onClick={()=>void openDocument(invoice)}>Rechnung öffnen</button></div></div>}
 <Timeline title="Nächster Schritt" detail={activeOrder.stage==='approval'?'Kostenvoranschlag prüfen und freigeben.':activeOrder.stage==='repair'?'Die Werkstatt bearbeitet den freigegebenen Auftrag.':activeOrder.stage==='pickup'?'Fahrzeug ist abholbereit. Rechnung steht im Dokumentbereich bereit.':'Status wird automatisch mit der Werkstatt synchronisiert.'}/></>:<div className="timeline-empty"><b>Kein laufender Werkstattauftrag.</b><span>Neue Anfragen und bestätigte Termine erscheinen hier automatisch.</span></div>}</section></div>:
 <div className="customer-layout"><div className="garage"><VehicleCard name="BMW X3 3.0i" plate="SAD XX 123" detail="2005 · 247.318 km" active tone={0} demo/><VehicleCard name="VW Golf VII" plate="SAD VW 407" detail="2016 · 128.140 km" tone={1} demo/></div><section className="panel timeline"><div className="panel-title"><div><span className="overline">BMW X3 · AUFTRAG #184</span><h3>Aktueller Auftrag</h3></div><Status stage={approved?'repair':'approval'}/></div><Timeline title="Fahrzeug eingetroffen" detail="08:41 · Carplus Service Center"/><Timeline title="Diagnose abgeschlossen" detail="09:12 · Lambdasonde Bank 1 vor Kat"/><Timeline current title={approved?'Reparatur freigegeben':'Deine Freigabe ist erforderlich'} detail={approved?'09:31 · an Werkstatt übermittelt':'09:26 · Kostenvoranschlag bereitgestellt'}>{!approved&&<div className="quote"><div><small>KOSTENVORANSCHLAG · PDF</small><b>328,40 €</b><span>inkl. MwSt.</span></div><p>Lambdasonde Bank 1 vor Kat + Einbau</p><div><button className="btn primary" onClick={()=>setApproved(true)}>Reparatur freigeben</button><button className="btn secondary" onClick={()=>setChat(true)}>Rückfrage</button></div></div>}</Timeline><Timeline title="Reparatur" detail={approved?'Auftrag steht in der Werkstatt-Queue':'Startet nach Freigabe'}/><Timeline title="Abholbereit" detail="Noch nicht erreicht" last/></section></div>}
 </div>
 <VehicleCreateModal open={vehicleModal} onClose={()=>setVehicleModal(false)} onDone={live.reload}/>
 <VehicleChat open={chat} onClose={()=>setChat(false)} audience="customer" workOrderId={live.isLive?activeOrder?.id:null} vehicleLabel={live.isLive&&activeVehicle?[activeVehicle.make,activeVehicle.model,activeVehicle.variant].filter(Boolean).join(' '):'BMW X3 3.0i'} plate={live.isLive&&activeVehicle?activeVehicle.licensePlate:'SAD XX 123'} orderNumber={live.isLive&&activeOrder?activeOrder.orderNumber:'184'}/>
 </Shell>;
}

function Timeline({title,detail,current=false,last=false,children}:{title:string;detail:string;current?:boolean;last?:boolean;children?:React.ReactNode}){return <div className={`timeline-row ${current?'current':''} ${last?'last':''}`}><i/><div><b>{title}</b><small>{detail}</small>{children}</div></div>}

export function BrandingPage({setView}:{setView:(v:AppView)=>void}){
 const live=useWorkshopWorkspace();
 const [url,setUrl]=useState<string>(); const [logoFile,setLogoFile]=useState<File|null>(null); const [palette,setPalette]=useState<Awaited<ReturnType<typeof paletteFromLogo>>|null>(null);
 const [mode,setMode]=useState<'solo'|'team'>('solo'); const [name,setName]=useState(''); const [legalName,setLegalName]=useState('');
 const [street,setStreet]=useState(''); const [postalCode,setPostalCode]=useState(''); const [city,setCity]=useState('');
 const [description,setDescription]=useState(''); const [accepts,setAccepts]=useState(true); const [verified,setVerified]=useState(false);
 const [busy,setBusy]=useState(false); const [error,setError]=useState<string|null>(null);

 useEffect(()=>{
   if(!live.identity)return;
   let cancelled=false;
   getWorkshopProfile(live.identity.workshopId).then(profile=>{
     if(cancelled)return;
     setName(profile.name??'');setLegalName(profile.legal_name??'');setStreet(profile.street??'');setPostalCode(profile.postal_code??'');
     setCity(profile.city??'');setDescription(profile.description??'');setMode((profile.operating_mode??'solo') as 'solo'|'team');
     setAccepts(Boolean(profile.accepts_new_customers));setVerified(Boolean(profile.verified_at));
     if(profile.logo_path)setUrl(getWorkshopLogoPublicUrl(profile.logo_path));
     if(profile.brand_primary){
       const primary=profile.brand_primary as string,secondary=(profile.brand_secondary as string|null)??primary;
       applyPalette({primary,dark:secondary,soft:'#f1f8f9',rgb:'12,102,122'});
     }
   }).catch(err=>{if(!cancelled)setError(err instanceof Error?err.message:'Werkstattprofil konnte nicht geladen werden.')});
   return()=>{cancelled=true};
 },[live.identity?.workshopId]);

 const logo=async(file?:File)=>{
   if(!file)return;const next=await paletteFromLogo(file);setPalette(next);applyPalette(next);setLogoFile(file);
   if(url&&url.startsWith('blob:'))URL.revokeObjectURL(url);setUrl(URL.createObjectURL(file));
 };

 const save=async()=>{
   if(busy)return;
   if(!name.trim()||!street.trim()||!postalCode.trim()||!city.trim()){setError('Name und vollständige Werkstattanschrift sind erforderlich.');return}
   setBusy(true);setError(null);
   try{
     let workshopId=live.identity?.workshopId;
     if(!workshopId){
       const slugBase=name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,45)||'werkstatt';
       const created=await createWorkshop({name,slug:slugBase+'-'+crypto.randomUUID().slice(0,6),street,postalCode,city,legalName,description});
       workshopId=created.id;
     }
     if(!workshopId)throw new Error('Werkstatt konnte nicht angelegt werden.');
     const resolvedWorkshopId:string=workshopId;
     await updateWorkshopProfile({workshopId:resolvedWorkshopId,name,legalName,street,postalCode,city,description,operatingMode:mode,acceptsNewCustomers:accepts});
     if(logoFile&&palette)await uploadWorkshopLogo({workshopId:resolvedWorkshopId,file:logoFile,primary:palette.primary,secondary:palette.dark});
     await live.reload();setView('office');
   }catch(err){setError(err instanceof Error?err.message:'Werkstattprofil konnte nicht gespeichert werden.')}
   finally{setBusy(false)}
 };

 const title=name.trim()||'Deine Werkstatt';
 return <Shell onHome={()=>setView('home')} title={title} mode="Werkstattprofil" active=""><div className="page"><PageHead title={live.identity?'Werkstattprofil':'Werkstatt einrichten'} subtitle="Deine Marke bleibt erkennbar – MotorAtlas sorgt für die professionelle, ruhige Darstellung."><button className="btn primary" disabled={busy} onClick={()=>void save()}>{busy?'Speichert …':live.identity?'Änderungen speichern':'Werkstatt anlegen'}</button></PageHead>
 {error&&<div className="workspace-alert">{error}</div>}
 {!live.identity&&<div className="onboarding-note"><ShieldCheck/><div><b>Neue Werkstatt</b><span>Dein Profil wird angelegt, ist aber erst nach MotorAtlas-Verifizierung öffentlich auf der Deutschlandkarte sichtbar.</span></div></div>}
 <div className="branding-fields">
  <section className="panel profile-form"><span className="overline">STAMMDATEN</span><h3>Die Werkstatt hinter dem Profil.</h3><div className="form-two"><label><span>Werkstattname</span><input value={name} onChange={e=>setName(e.target.value)} placeholder="z. B. Carplus Service Center"/></label><label><span>Rechtlicher Firmenname</span><input value={legalName} onChange={e=>setLegalName(e.target.value)} placeholder="optional"/></label></div><label><span>Straße & Hausnummer</span><input value={street} onChange={e=>setStreet(e.target.value)} placeholder="Musterstraße 12"/></label><div className="address-grid"><label><span>PLZ</span><input value={postalCode} onChange={e=>setPostalCode(e.target.value)} inputMode="numeric" placeholder="92421"/></label><label><span>Ort</span><input value={city} onChange={e=>setCity(e.target.value)} placeholder="Schwandorf"/></label></div><label><span>Beschreibung</span><textarea rows={4} value={description} onChange={e=>setDescription(e.target.value)} placeholder="Leistungen, Spezialisierung und das, was deine Werkstatt besonders macht."/></label><label className="toggle-row"><input type="checkbox" checked={accepts} onChange={e=>setAccepts(e.target.checked)}/><span><b>Neue Kunden annehmen</b><small>Kann jederzeit deaktiviert werden, wenn die Werkstatt ausgelastet ist.</small></span></label></section>
  <div className="branding-stack"><section className="panel"><span className="overline">ADAPTIVES BRANDING</span><h3>Logo rein. Premium-Farbsystem raus.</h3><p>MotorAtlas analysiert die dominante Markenfarbe und erzeugt daraus kontraststarke, dezente UI-Akzente.</p><label className="logo-upload"><Sparkles/><b>{url?'Logo ändern':'Werkstattlogo hochladen'}</b><span>PNG, JPG oder WebP</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>void logo(e.target.files?.[0])}/></label><div className="swatches"><i/><i/><i/></div></section>
  <section className="panel preview"><span className="overline">LIVE-VORSCHAU</span><div className="profile-preview"><div className="preview-logo">{url?<img src={url} alt="Werkstattlogo"/>:<span>{title.slice(0,2).toUpperCase()}</span>}</div><div><b>{title}</b><small className={verified?'verified-copy':'pending-copy'}><ShieldCheck size={14}/> {verified?'Verifizierte Werkstatt':'Verifizierung ausstehend'}</small></div></div><div className="preview-order"><Status stage="repair"/><h3>BMW X3 3.0i</h3><small>Auftrag #184 · Reparatur freigegeben</small><button className="btn primary full">Auftrag öffnen</button></div></section></div>
 </div>
 <section className="panel org-mode"><span className="overline">ORGANISATION</span><h3>Die Oberfläche passt sich an deinen Betrieb an.</h3><div><button className={mode==='solo'?'selected':''} onClick={()=>setMode('solo')}><Building2/><b>Einzelbetrieb</b><span>Eine Person sieht Büro und Werkstatt in einem flüssigen Ablauf.</span></button><button className={mode==='team'?'selected':''} onClick={()=>setMode('team')}><Users/><b>Team-Betrieb</b><span>Büro, Mechaniker und individuelle Berechtigungen arbeiten synchron.</span></button></div></section>
 </div></Shell>;
}
