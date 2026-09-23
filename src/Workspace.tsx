import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Bell, Building2, CalendarDays, Car, Clock3, FileText, Home, Mail, MapPin, MessageCircle,
  Phone, Plus, Search, Settings, ShieldCheck, Sparkles, UserRound, Users, Wrench
} from 'lucide-react';
import { jobs, type Job, type Stage } from './demo';
import { applyPalette, paletteFromLogo } from './lib';
import { Brand, CarArt, Status, stageLabels, type AppView } from './components';
import { claimWork, closeWorkOrder, completeRepair, createWorkshop, getDocumentVersionUrl, getWorkshopLogoPublicUrl, getWorkshopProfile, listWorkOrderDocuments, markNotificationRead, markReadyForPickup, markVehicleArrived, recordApproval, respondAppointment, updateWorkshopProfile, uploadWorkshopLogo, type AppNotification, type WorkshopAppointment } from './api';
import { useCustomerWorkspace, useWorkshopWorkspace } from './hooks';
import { VehicleChat } from './VehicleChat';
import { VehicleCreateModal, VehiclePhoto } from './VehicleModal';
import { ServiceRequestModal } from './ServiceRequestModal';
import { CustomerAdmissionModal, ServiceRequestOfficeModal } from './OfficeRequestModals';
import { WorkshopDirectoryModal } from './WorkshopDirectoryModal';
import { DiagnosisModal, DocumentUploadModal } from './WorkflowModals';
import { TeamManager } from './TeamManager';
import { VerificationPanel } from './VerificationPanel';
import { CustomerProfileModal } from './CustomerProfileModal';
import { AppointmentCancelModal } from './AppointmentCancelModal';
import { WORKSHOP_SERVICE_OPTIONS } from './verification';

type ShellSection='Übersicht'|'Werkstatt'|'Termine'|'Kunden'|'Fahrzeuge'|'Dokumente'|'Stammwerkstatt';
type ShellNavItem=[ShellSection,typeof Home,string?];

function Shell({
  children,title,mode,active,onHome,onSettings,onNavigate,navItems,notifications=[],onNotificationOpen,onNotificationsChanged
}:{
  children:React.ReactNode;title:string;mode:string;active:string;onHome:()=>void;
  onSettings?:()=>void;onNavigate?:(section:ShellSection)=>void;navItems?:ShellNavItem[];
  notifications?:AppNotification[];onNotificationOpen?:(notification:AppNotification)=>void;
  onNotificationsChanged?:()=>Promise<void>|void;
}){
  const items:ShellNavItem[]=navItems??[
    ['Übersicht',Home],['Werkstatt',Wrench],['Termine',CalendarDays],['Kunden',Users],['Fahrzeuge',Car],['Dokumente',FileText]
  ];
  const [notificationOpen,setNotificationOpen]=useState(false);
  const unread=notifications.filter(item=>!item.readAt).length;

  const openNotification=async(notification:AppNotification)=>{
    if(!notification.readAt){
      try{await markNotificationRead(notification.id);await onNotificationsChanged?.()}catch{}
    }
    onNotificationOpen?.(notification);
    setNotificationOpen(false);
  };

  const readAll=async()=>{
    const unreadItems=notifications.filter(item=>!item.readAt);
    if(!unreadItems.length)return;
    try{await Promise.all(unreadItems.map(item=>markNotificationRead(item.id)));await onNotificationsChanged?.()}catch{}
  };

  return <div className="app-shell">
    <aside className="sidebar">
      <button className="side-brand" onClick={onHome}><Brand compact/></button>
      <nav>{items.map(([name,Icon,label])=><button
        key={name}
        className={active===name?'active':''}
        onClick={()=>onNavigate?.(name)}
        aria-current={active===name?'page':undefined}
      ><Icon size={18}/><span>{label??name}</span></button>)}
      {onSettings&&<button className="mobile-settings" onClick={onSettings}><Settings size={18}/><span>Einstellungen</span></button>}</nav>
      <div className="side-bottom">
        {onSettings&&<button onClick={onSettings}><Settings size={18}/><span>Einstellungen</span></button>}
        <button className="profile"><span>PW</span><div><b>{title}</b><small>{mode}</small></div></button>
      </div>
    </aside>
    <main className="app-main">
      <div className="app-top">
        <div className="app-search"><Search size={17}/><span>Fahrzeug, Kunde oder Auftrag suchen …</span></div>
        <div className="notification-wrap">
          <button className="icon-button" onClick={()=>setNotificationOpen(value=>!value)} aria-label="Benachrichtigungen">
            <Bell size={18}/>{unread>0&&<span className="notification-count">{unread>99?'99+':unread}</span>}
          </button>
          {notificationOpen&&<div className="notification-popover">
            <header><div><small>BENACHRICHTIGUNGEN</small><b>{unread?unread+' neu':'Alles gelesen'}</b></div>{unread>0&&<button onClick={()=>void readAll()}>Alle gelesen</button>}</header>
            <div>{notifications.length?notifications.slice(0,12).map(item=><button key={item.id} className={item.readAt?'':'unread'} onClick={()=>void openNotification(item)}>
              <span className="notification-dot"/><div><b>{item.title}</b><p>{item.body||'Neue Aktivität in MotorAtlas.'}</p><small>{new Date(item.createdAt).toLocaleString('de-DE',{dateStyle:'short',timeStyle:'short'})}</small></div>
            </button>):<div className="notification-empty"><Bell/><b>Keine neuen Meldungen.</b><span>Neue Anfragen und Terminantworten erscheinen hier automatisch.</span></div>}</div>
          </div>}
        </div>
        <div className="top-identity"><span>CS</span><div><b>{title}</b><small>{mode}</small></div></div>
      </div>
      {children}
    </main>
  </div>;
}

function PageHead({title,subtitle,children}:{title:string;subtitle:string;children?:React.ReactNode}){return <div className="page-head"><div><h1>{title}</h1><p>{subtitle}</p></div>{children}</div>}

const orderStages:Stage[]=['arrived','diagnosis','approval','repair','pickup'];
type DisplayJob=Job&{orderNumber?:string;rawStage?:string;vehicleId?:string;customerUserId?:string;serviceRequestId?:string|null;updatedAt?:string;assigneeUserId?:string|null;photoPath?:string|null};
const toneFor=(id:string)=>[...id].reduce((sum,char)=>sum+char.charCodeAt(0),0)%5;
function JobCard({job}:{job:DisplayJob}){return <article className="job-card"><div className="job-car">{job.photoPath?<VehiclePhoto path={job.photoPath} alt={job.vehicle}/>:<CarArt tone={toneFor(job.id)}/>}<div><b>{job.vehicle}</b><small>{job.plate}{job.mileage?` · ${job.mileage.toLocaleString('de-DE')} km`:''}</small></div></div><p>{job.complaint}</p><footer><span>#{job.orderNumber??job.id.slice(-6)}</span><Status stage={job.stage}/></footer></article>}

type AppointmentView='day'|'week'|'month';
type AppointmentPhase='proposed'|'planned'|'today'|'late'|'arrived';

function sameLocalDay(a:Date,b:Date){
  return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();
}

function calendarDayDistance(date:Date,now:Date){
  const dateDay=Date.UTC(date.getFullYear(),date.getMonth(),date.getDate());
  const nowDay=Date.UTC(now.getFullYear(),now.getMonth(),now.getDate());
  return Math.round((dateDay-nowDay)/86_400_000);
}

function relativeDayLabel(date:Date,now:Date){
  const days=calendarDayDistance(date,now);
  if(days===0)return'Heute';
  if(days===-1)return'Gestern';
  if(days===-2)return'Vorgestern';
  if(days<0)return`Vor ${Math.abs(days)} Tagen`;
  if(days===1)return'Morgen';
  if(days===2)return'Übermorgen';
  return`In ${days} Tagen`;
}

function overdueSinceLabel(startsAt:string,now:Date){
  const diff=Math.max(0,now.getTime()-new Date(startsAt).getTime());
  const minutes=Math.floor(diff/60_000);
  if(minutes<=0)return'Jetzt fällig';
  if(minutes===1)return'Überfällig seit 1 Minute';
  if(minutes<60)return`Überfällig seit ${minutes} Minuten`;
  const hours=Math.floor(minutes/60);
  const remainingMinutes=minutes%60;
  if(hours<24)return`Überfällig seit ${hours} Std${remainingMinutes?` ${remainingMinutes} Min`:''}`;
  const days=Math.floor(hours/24);
  const remainingHours=hours%24;
  return`Überfällig seit ${days} ${days===1?'Tag':'Tagen'}${remainingHours?` ${remainingHours} Std`:''}`;
}

function customerCancellationOpen(startsAt:string,now:Date){
  return new Date(startsAt).getTime()-now.getTime()>=12*60*60*1000;
}

function appointmentCountdownText(startsAt:string,now:Date){
  const diff=new Date(startsAt).getTime()-now.getTime();
  const absolute=Math.abs(diff);
  const totalMinutes=Math.max(0,Math.floor(absolute/60_000));
  const days=Math.floor(totalMinutes/1440);
  const hours=Math.floor((totalMinutes%1440)/60);
  const minutes=totalMinutes%60;

  if(diff>0){
    const parts:string[]=[];
    if(days)parts.push(`${days} ${days===1?'Tag':'Tagen'}`);
    if(hours)parts.push(`${hours} Std.`);
    if(minutes||!parts.length)parts.push(`${minutes} Min.`);
    return `Du musst in ${parts.join(' ')} zur Werkstatt.`;
  }
  if(totalMinutes<1)return'Dein Termin ist jetzt.';
  const parts:string[]=[];
  if(days)parts.push(`${days} ${days===1?'Tag':'Tagen'}`);
  if(hours)parts.push(`${hours} Std.`);
  if(minutes||!parts.length)parts.push(`${minutes} Min.`);
  return `Du bist seit ${parts.join(' ')} überfällig.`;
}

function customerOrderTitle(rawStage:string){
  if(rawStage==='appointment_confirmed')return'Bevorstehender Werkstatttermin';
  if(rawStage==='arrived')return'Dein Fahrzeug ist eingetroffen';
  if(rawStage==='diagnosis')return'Diagnose läuft';
  if(rawStage==='awaiting_quote')return'Diagnose abgeschlossen';
  if(rawStage==='awaiting_customer_approval')return'Deine Freigabe wird benötigt';
  if(rawStage==='repair')return'Reparatur läuft';
  if(rawStage==='repair_complete')return'Reparatur abgeschlossen';
  if(rawStage==='ready_for_pickup')return'Dein Fahrzeug ist abholbereit';
  return'Aktueller Werkstattauftrag';
}

function customerOrderDetail(rawStage:string){
  if(rawStage==='arrived')return'Die Werkstatt hat dein Fahrzeug vor Ort angenommen.';
  if(rawStage==='diagnosis')return'Die Werkstatt prüft dein Fahrzeug und sucht die Ursache.';
  if(rawStage==='awaiting_quote')return'Die Diagnose ist abgeschlossen. Der Kostenvoranschlag wird vorbereitet.';
  if(rawStage==='awaiting_customer_approval')return'Prüfe den Kostenvoranschlag und entscheide über die Reparatur.';
  if(rawStage==='repair')return'Die freigegebene Reparatur wird durchgeführt.';
  if(rawStage==='repair_complete')return'Die Reparatur ist abgeschlossen. Die Werkstatt bereitet die Abholung vor.';
  if(rawStage==='ready_for_pickup')return'Dein Fahrzeug kann abgeholt werden.';
  return'Der Status wird automatisch mit der Werkstatt synchronisiert.';
}

function documentTypeLabel(type:string){
  if(type==='quote')return'Angebot / Kostenvoranschlag';
  if(type==='invoice')return'Rechnung';
  if(type==='credit_note')return'Gutschrift';
  return'Dokument';
}

function appointmentPhase(item:WorkshopAppointment,now=new Date()):AppointmentPhase{
  if(item.status==='proposed')return'proposed';
  if(item.arrivedAt||(item.rawOrderStage&&item.rawOrderStage!=='appointment_confirmed'))return'arrived';
  const start=new Date(item.startsAt);
  if(start.getTime()<=now.getTime()){
    return now.getTime()-start.getTime()>=60*1000?'late':'today';
  }
  return'planned';
}

function appointmentPhaseLabel(phase:AppointmentPhase){
  if(phase==='proposed')return'Terminvorschlag offen';
  if(phase==='planned')return'Geplant';
  if(phase==='today')return'Jetzt erwartet';
  if(phase==='late')return'Verspätet';
  return'Eingetroffen';
}

function startOfToday(){
  const now=new Date();return new Date(now.getFullYear(),now.getMonth(),now.getDate());
}

function requestStatusLabel(status:string){
  const labels:Record<string,string>={
    submitted:'Anfrage gesendet',accepted:'Von Werkstatt angenommen',appointment_pending:'Terminabstimmung',
    appointment_confirmed:'Termin bestätigt',declined:'Von Werkstatt abgelehnt',converted:'Auftrag angelegt',
    cancelled:'Storniert',draft:'Entwurf'
  };
  return labels[status]??status;
}

export function OfficeDashboard({setView}:{setView:(v:AppView)=>void}){
 const live=useWorkshopWorkspace();
 const displayJobs=(live.isLive?live.jobs:jobs) as DisplayJob[];
 const [section,setSection]=useState<ShellSection>(()=>{
   const saved=sessionStorage.getItem('motoratlas_office_section') as ShellSection|null;
   return saved&&['Übersicht','Termine','Kunden','Fahrzeuge','Dokumente'].includes(saved)?saved:'Übersicht';
 });
 const [scheduleRange,setScheduleRange]=useState<AppointmentView>('week');
 const [now,setNow]=useState(()=>new Date());
 const [chat,setChat]=useState(false);
 const [selectedId,setSelectedId]=useState<string>(displayJobs[0]?.id??jobs[0].id);
 const [docType,setDocType]=useState<'quote'|'invoice'|null>(null);
 const [serviceRequest,setServiceRequest]=useState<(typeof live.serviceRequests)[number]|null>(null);
 const [customerRequest,setCustomerRequest]=useState<any|null>(null);
 const [busy,setBusy]=useState(false);
 const [arrivalBusy,setArrivalBusy]=useState<string|null>(null);
 const [cancelTarget,setCancelTarget]=useState<WorkshopAppointment|null>(null);
 const [actionError,setActionError]=useState<string|null>(null);
 const [documents,setDocuments]=useState<any[]>([]);
 const [documentsBusy,setDocumentsBusy]=useState(false);
 const selected=displayJobs.find(job=>job.id===selectedId)??displayJobs[0];
 const counts=useMemo(()=>Object.fromEntries(orderStages.map(stage=>[stage,displayJobs.filter(job=>job.stage===stage).length])),[displayJobs]);
 const title=live.identity?.workshopName??'Carplus Service';

 useEffect(()=>{
   const timer=window.setInterval(()=>setNow(new Date()),60_000);
   return()=>window.clearInterval(timer);
 },[]);

 const openSection=(next:ShellSection)=>{
   if(next==='Werkstatt'){setView('workshop');return;}
   sessionStorage.setItem('motoratlas_office_section',next);
   setSection(next);
   window.scrollTo({top:0,behavior:'auto'});
 };

 const appointmentStats=useMemo(()=>{
   const stats={today:0,due:0,late:0,planned:0,proposed:0,arrived:0};
   for(const item of live.appointments){
     const phase=appointmentPhase(item,now);
     const start=new Date(item.startsAt);
     if(item.status==='confirmed'&&!item.arrivedAt&&sameLocalDay(start,now))stats.today++;
     if(phase==='today')stats.due++;
     else if(phase==='late')stats.late++;
     else if(phase==='planned')stats.planned++;
     else if(phase==='proposed')stats.proposed++;
     else stats.arrived++;
   }
   return stats;
 },[live.appointments,now]);

 const visibleAppointments=useMemo(()=>{
   const begin=startOfToday();
   const endDate=new Date(begin);
   endDate.setDate(endDate.getDate()+(scheduleRange==='day'?1:scheduleRange==='week'?7:31));
   return live.appointments
     .filter(item=>{
       const phase=appointmentPhase(item,now);
       if(phase==='late')return true;
       const startDate=new Date(item.startsAt);
       return startDate>=begin&&startDate<endDate;
     })
     .sort((a,b)=>new Date(a.startsAt).getTime()-new Date(b.startsAt).getTime());
 },[live.appointments,scheduleRange,now]);

 const appointmentGroups=useMemo(()=>{
   const groups=new Map<string,WorkshopAppointment[]>();
   for(const item of visibleAppointments){
     const key=new Date(item.startsAt).toLocaleDateString('de-DE',{weekday:'long',day:'2-digit',month:'2-digit',year:'numeric'});
     groups.set(key,[...(groups.get(key)??[]),item]);
   }
   return[...groups.entries()];
 },[visibleAppointments]);

 useEffect(()=>{
   if(section!=='Dokumente'||!live.isLive){setDocuments([]);return;}
   let cancelled=false;
   setDocumentsBusy(true);
   Promise.all(live.jobs.map(async job=>{
     const docs=await listWorkOrderDocuments(job.id);
     return docs.map(document=>({...document,job}));
   })).then(groups=>{
     if(!cancelled)setDocuments(groups.flat().sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))));
   }).catch(err=>{
     if(!cancelled)setActionError(err instanceof Error?err.message:'Dokumente konnten nicht geladen werden.');
   }).finally(()=>{if(!cancelled)setDocumentsBusy(false)});
   return()=>{cancelled=true};
 },[section,live.isLive,live.jobs]);

 const actionLabel=()=>{
   if(!live.isLive||!selected)return'Vorgang öffnen';
   switch(selected.rawStage){
     case'awaiting_quote':return'Kostenvoranschlag hochladen';
     case'awaiting_customer_approval':return'Wartet auf Kundenfreigabe';
     case'repair_complete':return'Rechnung hochladen';
     case'ready_for_pickup':return'Fahrzeug abgeholt';
     default:return'Vorgang öffnen';
   }
 };

 const runPrimary=async()=>{
   if(!selected||busy||!live.isLive)return;
   setActionError(null);
   if(selected.rawStage==='awaiting_quote'){setDocType('quote');return;}
   if(selected.rawStage==='repair_complete'){setDocType('invoice');return;}
   if(selected.rawStage==='awaiting_customer_approval')return;
   setBusy(true);
   try{
     if(selected.rawStage==='ready_for_pickup')await closeWorkOrder(selected.id);
     await live.reload();
   }catch(err){setActionError(err instanceof Error?err.message:'Aktion konnte nicht ausgeführt werden.')}
   finally{setBusy(false)}
 };

 const markArrived=async(item:WorkshopAppointment)=>{
   if(!item.workOrderId||arrivalBusy)return;
   setArrivalBusy(item.id);setActionError(null);
   try{await markVehicleArrived(item.workOrderId);await live.reload();setSelectedId(item.workOrderId);openSection('Übersicht')}
   catch(err){setActionError(err instanceof Error?err.message:'Fahrzeug konnte nicht als eingetroffen markiert werden.')}
   finally{setArrivalBusy(null)}
 };

 const documentDone=async()=>{
   if(!selected)return;
   if(docType==='invoice')await markReadyForPickup(selected.id);
   await live.reload();
 };

 const openDocument=async(document:any)=>{
   const version=document.versions?.[0];
   if(!version)return;
   try{const url=await getDocumentVersionUrl(version.storage_path);window.open(url,'_blank','noopener,noreferrer')}
   catch(err){setActionError(err instanceof Error?err.message:'Dokument konnte nicht geöffnet werden.')}
 };

 const vehicles=useMemo(()=>{
   const map=new Map<string,{id:string;vehicle:string;plate:string;job?:DisplayJob;request?:any;appointment?:WorkshopAppointment}>();
   for(const job of displayJobs)if(job.vehicleId)map.set(job.vehicleId,{id:job.vehicleId,vehicle:job.vehicle,plate:job.plate,job});
   for(const request of live.serviceRequests)if(!map.has(request.vehicleId))map.set(request.vehicleId,{id:request.vehicleId,vehicle:request.vehicle,plate:request.plate,request});
   for(const appointment of live.appointments)if(!map.has(appointment.vehicleId))map.set(appointment.vehicleId,{id:appointment.vehicleId,vehicle:appointment.vehicle,plate:appointment.plate,appointment});
   return[...map.values()];
 },[displayJobs,live.serviceRequests,live.appointments]);

 const customers=useMemo(()=>{
   const map=new Map<string,{id:string;name:string;detail:string;request?:any}>();
   for(const request of live.serviceRequests)map.set(request.customerUserId,{id:request.customerUserId,name:request.customerName,detail:request.customerPhone||'Werkstattanfrage vorhanden'});
   for(const appointment of live.appointments)if(!map.has(appointment.customerUserId))map.set(appointment.customerUserId,{id:appointment.customerUserId,name:appointment.customerName,detail:appointment.customerPhone||[appointment.customerPostalCode,appointment.customerCity].filter(Boolean).join(' ')||'Termin vorhanden'});
   for(const request of live.customerRequests){
     const name=request.profile?.full_name||'Kundenanfrage';
     const detail=request.profile?.phone||[request.profile?.postal_code,request.profile?.city].filter(Boolean).join(' ')||'Aufnahme angefragt';
     map.set(request.customer_user_id,{id:request.customer_user_id,name,detail,request});
   }
   return[...map.values()];
 },[live.serviceRequests,live.appointments,live.customerRequests]);

 const openNotification=(notification:AppNotification)=>{
   if(notification.kind==='customer_request'){openSection('Kunden');return}
   if(notification.kind==='request'||notification.kind==='appointment'){openSection('Termine');return}
   openSection('Übersicht');
 };

 const appointmentCard=(item:WorkshopAppointment)=>{
   const phase=appointmentPhase(item,now);
   const start=new Date(item.startsAt);
   const dayLabel=relativeDayLabel(start,now);
   const canArrive=item.status==='confirmed'&&!item.arrivedAt&&item.rawOrderStage==='appointment_confirmed'&&Boolean(item.workOrderId);
   const canCancel=!item.arrivedAt&&(item.status==='confirmed'||item.status==='proposed')&&(!item.rawOrderStage||item.rawOrderStage==='appointment_confirmed');
   return <article key={item.id} className={'schedule-card '+phase}>
     <div className="schedule-photo"><VehiclePhoto path={item.photoPath} alt={item.vehicle}/></div>
     <div className="schedule-time">
       <span className="relative-day">{dayLabel}</span>
       <b>{start.toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})}</b>
       <small>{item.endsAt?'bis '+new Date(item.endsAt).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'}):'Termin'}</small>
       {phase==='late'&&<em>{overdueSinceLabel(item.startsAt,now)}</em>}
     </div>
     <div className="schedule-main">
       <div className="schedule-title"><div><b>{item.vehicle}</b><small>{item.plate} · {item.customerName}</small></div><span className={'schedule-status '+phase}>{phase==='late'&&<AlertTriangle/>}{appointmentPhaseLabel(phase)}</span></div>
       <p>{item.complaint}</p>
       <div className="schedule-contact">
         <span><Phone/> {item.customerPhone||'Keine Telefonnummer hinterlegt'}</span>
         {item.customerEmail&&<span><Mail/> {item.customerEmail}</span>}
         <span><MapPin/> {[item.customerStreet,item.customerPostalCode,item.customerCity].filter(Boolean).join(', ')||'Keine Anschrift hinterlegt'}</span>
       </div>
       <div className="schedule-vehicle-data">
         <span>EZ <b>{item.firstRegistration?new Date(item.firstRegistration).toLocaleDateString('de-DE'):'—'}</b></span>
         <span>km <b>{item.mileage!=null?item.mileage.toLocaleString('de-DE'):'—'}</b></span>
         <span>HSN/TSN <b>{[item.hsn,item.tsn].filter(Boolean).join('/')||'—'}</b></span>
         <span>VIN <b>{item.vin||'—'}</b></span>
       </div>
     </div>
     <div className="schedule-actions">
       {canArrive&&<button className="btn primary" disabled={arrivalBusy===item.id} onClick={()=>void markArrived(item)}>{arrivalBusy===item.id?'Speichert …':'Fahrzeug eingetroffen'}</button>}
       {phase==='arrived'&&item.workOrderId&&<button className="btn secondary" onClick={()=>{setSelectedId(item.workOrderId!);openSection('Übersicht')}}>Auftrag öffnen</button>}
       {canCancel&&<button className="btn secondary cancel-appointment" onClick={()=>setCancelTarget(item)}>{item.status==='proposed'?'Vorschlag zurückziehen':'Termin stornieren'}</button>}
       {phase==='proposed'&&<span className="waiting-customer">Wartet auf Kundenbestätigung</span>}
     </div>
   </article>;
 };

 return <Shell
   onHome={()=>setView('home')}
   onSettings={live.identity?.role==='owner'?()=>setView('branding'):undefined}
   onNavigate={openSection}
   notifications={live.notifications}
   onNotificationOpen={openNotification}
   onNotificationsChanged={live.reload}
   title={title}
   mode="Büro"
   active={section}
 ><div className="page">
   {(live.error||actionError)&&<div className="workspace-alert">{live.error??actionError}</div>}

   {section==='Übersicht'&&<>
     <PageHead title="Werkstattübersicht" subtitle={live.isLive?'Was jetzt wichtig ist: Ankünfte, offene Arbeit und neue Kundenaktionen.':'Produktdemo – so sieht der Echtzeitbetrieb später aus.'}>
       <div className="head-actions">
         <span className="realtime"><i/> {live.isLive?'Echtzeit verbunden':'Demo-Modus'}</span>
         <button className="btn primary" onClick={()=>openSection('Termine')}><CalendarDays size={16}/> Terminplanung</button>
       </div>
     </PageHead>
     <div className="metrics">
       <article><small>IN DER WERKSTATT</small><b>{displayJobs.length}</b><span>aktive Fahrzeuge</span></article>
       <article className={appointmentStats.today?'attention':''}><small>HEUTE ERWARTET</small><b>{appointmentStats.today}</b><span>{appointmentStats.due?'davon '+appointmentStats.due+' jetzt fällig':'geplante Ankünfte'}</span></article>
       <article className={appointmentStats.late?'danger':''}><small>VERSPÄTET</small><b>{appointmentStats.late}</b><span>Termin überschritten</span></article>
       <article><small>NEUE ANFRAGEN</small><b>{live.isLive?live.serviceRequests.length:3}</b><span>zu bearbeiten</span></article>
     </div>

     {live.isLive&&<section className="panel today-arrivals">
       <header><div><span className="overline">HEUTE & ÜBERFÄLLIG</span><h3>Anstehende Fahrzeugannahmen</h3></div><button className="btn secondary" onClick={()=>openSection('Termine')}>Alle Termine</button></header>
       <div>{live.appointments.filter(item=>{const phase=appointmentPhase(item,now);return phase==='late'||(item.status==='confirmed'&&!item.arrivedAt&&sameLocalDay(new Date(item.startsAt),now))}).sort((a,b)=>new Date(a.startsAt).getTime()-new Date(b.startsAt).getTime()).slice(0,5).map(appointmentCard)}</div>
       {!live.appointments.some(item=>{const phase=appointmentPhase(item,now);return phase==='late'||(item.status==='confirmed'&&!item.arrivedAt&&sameLocalDay(new Date(item.startsAt),now))})&&<div className="inbox-empty">Heute sind keine Fahrzeugannahmen geplant.</div>}
     </section>}

     {live.isLive&&<div className="office-inbox-grid">
       <section className="panel office-inbox"><header><div><span className="overline">NEUE WERKSTATTANFRAGEN</span><h3>Termin abstimmen</h3></div><b>{live.serviceRequests.length}</b></header>{live.serviceRequests.length?live.serviceRequests.slice(0,4).map(request=><button key={request.id} className="inbox-row" onClick={()=>setServiceRequest(request)}><span className="inbox-icon"><CalendarDays/></span><span><b>{request.vehicle}</b><small>{request.plate} · {request.customerName}{request.customerPhone?' · '+request.customerPhone:''}</small><p>{request.complaint}</p></span><strong>{request.desiredStart?new Date(request.desiredStart).toLocaleString('de-DE',{dateStyle:'short',timeStyle:'short'}):'Termin offen'}</strong></button>):<div className="inbox-empty">Keine neuen Werkstattanfragen.</div>}</section>
       <section className="panel office-inbox"><header><div><span className="overline">NEUE KUNDEN</span><h3>Aufnahme freigeben</h3></div><b>{live.customerRequests.length}</b></header>{live.customerRequests.length?live.customerRequests.slice(0,4).map(request=><button key={request.id} className="inbox-row customer" onClick={()=>setCustomerRequest(request)}><span className="inbox-icon"><Users/></span><span><b>{request.profile?.full_name||'Kundenanfrage'}</b><small>{request.profile?.phone||[request.profile?.postal_code,request.profile?.city].filter(Boolean).join(' ')||'Profilanfrage'}</small><p>{request.message||'Möchte Kunde dieser Werkstatt werden.'}</p></span><strong>Prüfen</strong></button>):<div className="inbox-empty">Keine offenen Kundenaufnahmen.</div>}</section>
     </div>}

     <div className="board">{orderStages.map(stage=><section key={stage}><header><span>{stageLabels[stage]}</span><b>{counts[stage]??0}</b></header><div>{displayJobs.filter(job=>job.stage===stage).map(job=><button className="card-button" onClick={()=>setSelectedId(job.id)} key={job.id}><JobCard job={job}/></button>)}</div></section>)}</div>
     <div className="lower-grid">{selected?<section className="panel focus-card"><div><span className="overline">AUSGEWÄHLTER VORGANG</span><h3>{selected.vehicle}</h3><small>{selected.plate} · Auftrag #{selected.orderNumber??selected.id.slice(-6)}</small></div><div className="focus-action"><Status stage={selected.stage}/><button className="btn secondary" onClick={()=>setChat(true)}><MessageCircle size={16}/> Fahrzeugchat</button><button className="btn primary" disabled={busy||Boolean(live.isLive&&selected.rawStage==='awaiting_customer_approval')} onClick={()=>void runPrimary()}>{busy?'Bitte warten …':actionLabel()}</button></div></section>:<section className="panel focus-card"><div><span className="overline">KEINE FAHRZEUGE IN DER WERKSTATT</span><h3>Die Werkstatt-Queue ist leer.</h3><small>Bestätigte Termine bleiben in der Terminplanung, bis das Fahrzeug tatsächlich eintrifft.</small></div></section>}</div>
   </>}

   {section==='Termine'&&<>
     <PageHead title="Terminplanung & Auslastung" subtitle="Bestätigte Termine bleiben geplant. Erst der echte Check-in verschiebt das Fahrzeug in die Werkstatt.">
       <div className="schedule-range">
         <button className={scheduleRange==='day'?'active':''} onClick={()=>setScheduleRange('day')}>Heute</button>
         <button className={scheduleRange==='week'?'active':''} onClick={()=>setScheduleRange('week')}>7 Tage</button>
         <button className={scheduleRange==='month'?'active':''} onClick={()=>setScheduleRange('month')}>31 Tage</button>
       </div>
     </PageHead>

     <div className="schedule-summary">
       <article><CalendarDays/><div><small>IM ZEITRAUM</small><b>{visibleAppointments.length}</b></div></article>
       <article><Clock3/><div><small>HEUTE ERWARTET</small><b>{appointmentStats.today}</b></div></article>
       <article className={appointmentStats.late?'late':''}><AlertTriangle/><div><small>VERSPÄTET</small><b>{appointmentStats.late}</b></div></article>
       <article><ShieldCheck/><div><small>BESTÄTIGT GEPLANT</small><b>{appointmentStats.planned}</b></div></article>
     </div>

     <section className="panel schedule-panel">
       <header><div><span className="overline">WERKSTATTAUSLASTUNG</span><h3>{scheduleRange==='day'?'Heute':scheduleRange==='week'?'Nächste 7 Tage':'Nächste 31 Tage'}</h3></div><small>{appointmentStats.proposed?appointmentStats.proposed+' Terminvorschlag/-vorschläge warten noch auf Kundenantwort.':'Alle Vorschläge beantwortet.'}</small></header>
       <div className="schedule-groups">
         {appointmentGroups.map(([day,items])=><section className="schedule-day" key={day}><header><b>{day}</b><span>{items.length} {items.length===1?'Termin':'Termine'}</span></header><div>{items.map(appointmentCard)}</div></section>)}
         {!appointmentGroups.length&&<div className="inbox-empty">Für diesen Zeitraum sind keine Termine geplant.</div>}
       </div>
     </section>

     <section className="panel office-inbox requests-under-calendar">
       <header><div><span className="overline">OFFENE ANFRAGEN</span><h3>{live.serviceRequests.length} Vorgänge warten auf Terminabstimmung</h3></div></header>
       {live.serviceRequests.length?live.serviceRequests.map(request=><button key={request.id} className="inbox-row" onClick={()=>setServiceRequest(request)}>
         <span className="inbox-icon"><CalendarDays/></span>
         <span><b>{request.customerName} · {request.vehicle}</b><small>{request.plate}{request.customerPhone?' · '+request.customerPhone:''}</small><p>{request.complaint}</p></span>
         <strong>{request.desiredStart?new Date(request.desiredStart).toLocaleString('de-DE',{dateStyle:'medium',timeStyle:'short'}):'Termin offen'}</strong>
       </button>):<div className="inbox-empty">Keine offenen Terminanfragen.</div>}
     </section>
   </>}

   {section==='Kunden'&&<>
     <PageHead title="Kunden" subtitle="Kontaktdaten und offene Aufnahmeanfragen deiner Werkstatt."/>
     <section className="panel office-inbox">
       <header><div><span className="overline">KUNDEN</span><h3>{customers.length} aktuelle Kontakte</h3></div></header>
       {customers.length?customers.map(customer=><button key={customer.id} className="inbox-row customer" onClick={()=>customer.request&&setCustomerRequest(customer.request)}>
         <span className="inbox-icon"><Users/></span>
         <span><b>{customer.name}</b><small>{customer.detail}</small></span>
         <strong>{customer.request?'Prüfen':'Aktiv'}</strong>
       </button>):<div className="inbox-empty">Noch keine Kundenkontakte vorhanden.</div>}
     </section>
   </>}

   {section==='Fahrzeuge'&&<>
     <PageHead title="Fahrzeuge" subtitle="Fahrzeuge aus Werkstatt, Terminplanung und aktuellen Anfragen."/>
     <section className="panel office-inbox">
       <header><div><span className="overline">FAHRZEUGE</span><h3>{vehicles.length} Fahrzeuge</h3></div></header>
       {vehicles.length?vehicles.map(vehicle=><button key={vehicle.id} className="inbox-row" onClick={()=>{
         if(vehicle.job){setSelectedId(vehicle.job.id);openSection('Übersicht')}
         else if(vehicle.request)setServiceRequest(vehicle.request);
         else if(vehicle.appointment)openSection('Termine');
       }}>
         <span className="inbox-icon"><Car/></span>
         <span><b>{vehicle.vehicle}</b><small>{vehicle.plate}</small></span>
         <strong>{vehicle.job?'Auftrag öffnen':vehicle.request?'Anfrage öffnen':'Termin ansehen'}</strong>
       </button>):<div className="inbox-empty">Noch keine Fahrzeuge vorhanden.</div>}
     </section>
   </>}

   {section==='Dokumente'&&<>
     <PageHead title="Dokumente" subtitle="Kostenvoranschläge, Rechnungen und weitere Dokumente aus deinen Aufträgen."/>
     <section className="panel office-inbox">
       <header><div><span className="overline">DOKUMENTE</span><h3>{documentsBusy?'Dokumente werden geladen …':`${documents.length} Dokumente`}</h3></div></header>
       {!documentsBusy&&documents.length?documents.map(document=><button key={document.id} className="inbox-row" onClick={()=>void openDocument(document)}>
         <span className="inbox-icon"><FileText/></span>
         <span><b>{document.title||document.document_number||'Dokument'}</b><small>{document.job?.vehicle} · {document.job?.plate}</small><p>{document.document_type==='quote'?'Kostenvoranschlag':document.document_type==='invoice'?'Rechnung':'Dokument'} · {document.status}</p></span>
         <strong>{document.amount_total!=null?Number(document.amount_total).toLocaleString('de-DE',{style:'currency',currency:document.currency||'EUR'}):'Öffnen'}</strong>
       </button>):!documentsBusy&&<div className="inbox-empty">Noch keine Dokumente vorhanden.</div>}
     </section>
   </>}
 </div>
 {selected&&<VehicleChat open={chat} onClose={()=>setChat(false)} audience="workshop" workOrderId={live.isLive?selected.id:null} vehicleLabel={selected.vehicle} plate={selected.plate} orderNumber={selected.orderNumber??selected.id.slice(-6)}/>}
 {selected&&live.identity&&docType&&<DocumentUploadModal open={Boolean(docType)} onClose={()=>setDocType(null)} onDone={documentDone} workOrderId={selected.id} workshopId={live.identity.workshopId} vehicle={selected.vehicle} type={docType}/>}
 <ServiceRequestOfficeModal open={Boolean(serviceRequest)} onClose={()=>setServiceRequest(null)} onDone={live.reload} request={serviceRequest}/>
 <CustomerAdmissionModal open={Boolean(customerRequest)} onClose={()=>setCustomerRequest(null)} onDone={live.reload} request={customerRequest}/>
 <AppointmentCancelModal open={Boolean(cancelTarget)} onClose={()=>setCancelTarget(null)} onDone={live.reload} appointmentId={cancelTarget?.id} startsAt={cancelTarget?.startsAt} mode="workshop" vehicle={cancelTarget?.vehicle}/>
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

 return <Shell onHome={()=>setView('home')} onSettings={live.identity?.role==='owner'?()=>setView('branding'):undefined} onNavigate={next=>{if(next==='Werkstatt')return;sessionStorage.setItem('motoratlas_office_section',next);setView('office')}} notifications={live.notifications} onNotificationOpen={()=>{sessionStorage.setItem('motoratlas_office_section','Termine');setView('office')}} onNotificationsChanged={live.reload} title={title} mode="Werkstatt" active="Werkstatt"><div className="page workshop-page"><PageHead title="Werkstattboard" subtitle="Nächsten Auftrag nehmen. Arbeiten. Ergebnis eintragen."><span className="realtime"><i/> {live.isLive?'Live mit dem Büro':'Demo-Modus'}</span></PageHead>
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
 const live=useCustomerWorkspace();
 const [section,setSection]=useState<ShellSection>('Übersicht');
 const [approved,setApproved]=useState(false); const [chat,setChat]=useState(false); const [vehicleModal,setVehicleModal]=useState(false); const [requestModal,setRequestModal]=useState(false); const [directory,setDirectory]=useState(false); const [profileModal,setProfileModal]=useState(false);
 const [cancelTarget,setCancelTarget]=useState<(typeof live.appointments)[number]|null>(null);
 const [now,setNow]=useState(()=>new Date());
 const [documents,setDocuments]=useState<any[]>([]); const [docError,setDocError]=useState<string|null>(null); const [busy,setBusy]=useState(false);
 const activeOrder=live.isLive?live.orders.find(order=>order.rawStage!=='closed'&&order.rawStage!=='cancelled'):null;
 const activeRequest=live.isLive&&!activeOrder?live.requests.find(request=>!['cancelled','converted'].includes(request.status)):null;
 const requestIsActive=Boolean(activeRequest&&activeRequest.status!=='declined');
 const proposedAppointment=requestIsActive&&activeRequest?live.appointments.find(item=>item.serviceRequestId===activeRequest.id&&item.status==='proposed'):null;
 const activeOrderAppointment=activeOrder?.serviceRequestId?live.appointments.find(item=>item.serviceRequestId===activeOrder.serviceRequestId&&item.status==='confirmed'):null;
 const activeOrderWorkshop=activeOrder?live.workshops.find(item=>item.workshopId===activeOrder.workshopId):null;
 const relationshipNotice=live.isLive?live.relationshipRequests.find(request=>request.status==='pending'||request.status==='rejected')??null:null;
 const activeVehicleId=activeOrder?.vehicleId??(requestIsActive?activeRequest?.vehicleId:undefined);
 const activeVehicle=activeVehicleId?live.vehicles.find(vehicle=>vehicle.id===activeVehicleId):live.vehicles[0];
 const customerNav:ShellNavItem[]=[
   ['Übersicht',Home,'Status'],
   ['Termine',CalendarDays,'Anfragen'],
   ['Fahrzeuge',Car,'Garage'],
   ['Dokumente',FileText,'Dokumente']
 ];

 useEffect(()=>{
   const timer=window.setInterval(()=>setNow(new Date()),60_000);
   return()=>window.clearInterval(timer);
 },[]);

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

 const answerAppointment=async(decision:'confirmed'|'declined')=>{
   if(!proposedAppointment||busy)return;
   setBusy(true);setDocError(null);
   try{await respondAppointment(proposedAppointment.id,decision);await live.reload()}
   catch(err){setDocError(err instanceof Error?err.message:'Terminantwort konnte nicht gespeichert werden.')}
   finally{setBusy(false)}
 };

 const requestStatusText=(request=activeRequest)=>{
   if(!request)return'';
   if(request.status==='submitted')return'Deine Werkstatt prüft die Anfrage.';
   if(request.status==='accepted')return'Die Werkstatt bereitet die Terminabstimmung vor.';
   if(request.status==='appointment_pending')return request.id===activeRequest?.id&&proposedAppointment?'Ein neuer Terminvorschlag wartet auf deine Entscheidung.':'Die Terminabstimmung läuft.';
   if(request.status==='appointment_confirmed')return'Der Termin ist bestätigt.';
   if(request.status==='declined')return request.declineReason||'Die Werkstatt kann diese Anfrage derzeit nicht annehmen.';
   if(request.status==='cancelled')return'Der Termin wurde storniert.';
   if(request.status==='converted')return'Aus der Anfrage wurde ein Werkstatttermin.';
   return'Anfrage wird bearbeitet.';
 };

 const relationshipCard=relationshipNotice&&<div className={'relationship-notice '+relationshipNotice.status}>
   <div><ShieldCheck/><span><small>{relationshipNotice.status==='rejected'?'KUNDENANFRAGE ABGELEHNT':'KUNDENANFRAGE LÄUFT'}</small><b>{relationshipNotice.workshopName}</b><p>{relationshipNotice.status==='rejected'?'Die Werkstatt hat deine Anfrage zur Kundenaufnahme abgelehnt. Du kannst eine andere Werkstatt auswählen oder später erneut anfragen.':'Deine Anfrage wurde an die Werkstatt übermittelt. Sobald sie antwortet, aktualisiert sich diese Seite automatisch.'}</p></span></div>
   {relationshipNotice.status==='rejected'&&<button className="btn secondary" onClick={()=>setDirectory(true)}>Andere Werkstatt finden</button>}
 </div>;

 const garage=<div className="garage customer-garage-full">{live.vehicles.length?live.vehicles.map((vehicle,index)=><VehicleCard key={vehicle.id} name={[vehicle.make,vehicle.model,vehicle.variant].filter(Boolean).join(' ')} plate={vehicle.licensePlate} detail={`${vehicle.firstRegistration?new Date(vehicle.firstRegistration).getFullYear():'—'} · ${vehicle.mileage?.toLocaleString('de-DE')??'—'} km`} active={activeVehicleId===vehicle.id} stage={activeOrder?.vehicleId===vehicle.id?(activeOrder.rawStage==='appointment_confirmed'?undefined:activeOrder.stage):requestIsActive&&activeRequest?.vehicleId===vehicle.id?'arrived':undefined} tone={index} photoPath={vehicle.photoPath}/>):<section className="panel vehicle-card empty-card"><Car size={30}/><h3>Noch kein Fahrzeug hinterlegt.</h3><small>Lege deinen ersten PKW an, um eine Werkstattanfrage zu starten.</small></section>}</div>;

 const statusPanel=<section className="panel timeline">
   <div className="panel-title"><div><span className="overline">{activeOrder?`AUFTRAG #${activeOrder.orderNumber}`:activeRequest?'WERKSTATTANFRAGE':'KEIN AKTIVER VORGANG'}</span><h3>{activeOrder?(activeOrder.rawStage==='appointment_confirmed'?'Bestätigter Termin':'Aktueller Auftrag'):activeRequest?'Deine Anfrage':'Alles erledigt'}</h3></div>{activeOrder&&activeOrder.rawStage!=='appointment_confirmed'&&<Status stage={activeOrder.stage}/>}</div>
   {activeOrder?<>
     {activeOrder.rawStage==='appointment_confirmed'?<>
       <Timeline title="Termin bestätigt" detail={activeOrderAppointment?`${relativeDayLabel(new Date(activeOrderAppointment.startsAt),now)} · ${new Date(activeOrderAppointment.startsAt).toLocaleString('de-DE',{dateStyle:'full',timeStyle:'short'})}`:'Der Termin wurde bestätigt.'} current/>
       <Timeline title="Fahrzeug wird erwartet" detail="Das Fahrzeug gilt erst als eingetroffen, wenn die Werkstatt es vor Ort eincheckt."/>
       {activeOrderAppointment&&<div className="customer-cancel-window">
         {customerCancellationOpen(activeOrderAppointment.startsAt,now)?<>
           <div><CalendarDays/><span><small>ONLINE-STORNIERUNG</small><b>Bis 12 Stunden vor dem Termin möglich</b><p>Danach muss eine kurzfristige Absage direkt telefonisch mit {activeOrderWorkshop?.name||'der Werkstatt'} geklärt werden.</p></span></div>
           <button className="btn secondary cancel-appointment" onClick={()=>setCancelTarget(activeOrderAppointment)}>Termin stornieren</button>
         </>:<>
           <div><Phone/><span><small>KURZFRISTIGE ÄNDERUNG</small><b>Online-Stornierung nicht mehr möglich</b><p>Der Termin ist in weniger als 12 Stunden bzw. bereits fällig. Bitte kontaktiere {activeOrderWorkshop?.name||'die Werkstatt'} telefonisch. Die Werkstatt kann den Termin jederzeit stornieren.</p></span></div>
         </>}
       </div>}
     </>:<>
       <Timeline title="Auftrag aktiv" detail={`Zuletzt aktualisiert: ${new Date(activeOrder.updatedAt).toLocaleString('de-DE')}`} current/>
       {quote&&<div className="customer-document-card"><div><FileText/><span><small>KOSTENVORANSCHLAG</small><b>{quote.document_number||'Dokument'}</b></span><strong>{quote.amount_total!=null?Number(quote.amount_total).toLocaleString('de-DE',{style:'currency',currency:quote.currency||'EUR'}):''}</strong></div><div><button className="btn secondary" onClick={()=>void openDocument(quote)}>PDF öffnen</button>{activeOrder.rawStage==='awaiting_customer_approval'&&<button className="btn primary" disabled={busy} onClick={()=>void approve('approved')}>{busy?'Wird gespeichert …':'Reparatur freigeben'}</button>}<button className="btn secondary" onClick={()=>void approve('question_requested')}>Rückfrage</button></div></div>}
       {invoice&&<div className="customer-document-card invoice-card"><div><FileText/><span><small>RECHNUNG</small><b>{invoice.document_number||'Dokument'}</b></span><strong>{invoice.amount_total!=null?Number(invoice.amount_total).toLocaleString('de-DE',{style:'currency',currency:invoice.currency||'EUR'}):''}</strong></div><div><button className="btn primary" onClick={()=>void openDocument(invoice)}>Rechnung öffnen</button></div></div>}
       <Timeline title="Nächster Schritt" detail={activeOrder.stage==='approval'?'Kostenvoranschlag prüfen und freigeben.':activeOrder.stage==='repair'?'Die Werkstatt bearbeitet den freigegebenen Auftrag.':activeOrder.stage==='pickup'?'Fahrzeug ist abholbereit. Rechnung steht im Dokumentbereich bereit.':'Status wird automatisch mit der Werkstatt synchronisiert.'}/>
     </>}
   </>:activeRequest?<>
     <Timeline title="Anfrage gesendet" detail={`${new Date(activeRequest.createdAt).toLocaleString('de-DE')} · ${activeRequest.complaint}`} current={requestIsActive&&!proposedAppointment}/>
     {activeRequest.desiredStart&&<Timeline title="Dein Wunschtermin" detail={new Date(activeRequest.desiredStart).toLocaleString('de-DE')}/>}
     {activeRequest.status==='declined'?<div className="request-declined-card"><ShieldCheck/><div><small>ANFRAGE ABGELEHNT</small><b>Die Werkstatt kann diese Anfrage nicht annehmen.</b><p>{requestStatusText()}</p>{activeRequest.declinedAt&&<span>{new Date(activeRequest.declinedAt).toLocaleString('de-DE')}</span>}</div><button className="btn secondary" onClick={()=>setRequestModal(true)}>Neue Anfrage</button></div>:<>
       {proposedAppointment&&<div className="appointment-card"><div><CalendarDays/><span><small>TERMINVORSCHLAG DER WERKSTATT</small><b>{new Date(proposedAppointment.startsAt).toLocaleString('de-DE',{dateStyle:'medium',timeStyle:'short'})}</b>{proposedAppointment.note&&<p>{proposedAppointment.note}</p>}</span></div><div><button className="btn secondary" disabled={busy} onClick={()=>void answerAppointment('declined')}>Passt nicht</button><button className="btn primary" disabled={busy} onClick={()=>void answerAppointment('confirmed')}>{busy?'Speichert …':'Termin bestätigen'}</button></div></div>}
       <Timeline title="Aktueller Stand" detail={requestStatusText()} current={Boolean(proposedAppointment)}/>
     </>}
   </>:<div className="timeline-empty"><b>Kein laufender Werkstattvorgang.</b><span>Mit „Anfrage starten“ meldest du einen Wunsch oder ein Problem für eines deiner Fahrzeuge.</span></div>}
 </section>;

 const title=section==='Übersicht'?'Status':section==='Termine'?'Anfragen & Termine':section==='Fahrzeuge'?'Meine Garage':'Dokumente';
 const subtitle=section==='Übersicht'?'Aktueller Stand zwischen dir und deiner Werkstatt.'
   :section==='Termine'?'Werkstattanfragen, Entscheidungen und Terminvorschläge.'
   :section==='Fahrzeuge'?'Deine hinterlegten Fahrzeuge und Fahrzeugdaten.'
   :'Kostenvoranschläge und Rechnungen zu deinem aktuellen Auftrag.';

 return <Shell
   onHome={()=>setView('home')}
   onNavigate={next=>{setSection(next);window.scrollTo({top:0,behavior:'auto'})}}
   navItems={customerNav}
   notifications={live.notifications}
   onNotificationOpen={notification=>{if(notification.kind==='appointment'||notification.kind==='request')setSection('Termine');else if(notification.kind==='document')setSection('Dokumente');else setSection('Übersicht')}}
   onNotificationsChanged={live.reload}
   title="Mein MotorAtlas"
   mode="Kundenportal"
   active={section}
 ><div className="page">
   <PageHead title={title} subtitle={live.isLive?subtitle:'Produktdemo des Kundenportals.'}>
     <div className="head-actions">
       <button className="btn secondary" onClick={()=>setDirectory(true)}><MapPin size={16}/> Werkstatt finden</button>
       {section==='Fahrzeuge'&&<><button className="btn secondary" onClick={()=>setProfileModal(true)}><UserRound size={16}/> Meine Daten</button><button className="btn secondary" onClick={()=>setVehicleModal(true)}><Plus size={16}/> Fahrzeug</button></>}
       <button className="btn secondary" onClick={()=>setChat(true)} disabled={live.isLive&&!activeOrder}><MessageCircle size={16}/> Chat</button>
       <button className="btn primary" onClick={()=>setRequestModal(true)}><Plus size={16}/> Anfrage starten</button>
     </div>
   </PageHead>

   {(live.error||docError)&&<div className="workspace-alert">{live.error??docError}</div>}
   {section!=='Dokumente'&&relationshipCard}

   {live.isLive?<>
     {section==='Übersicht'&&<div className="customer-layout">{garage}{statusPanel}</div>}
     {section==='Fahrzeuge'&&garage}
     {section==='Termine'&&<div className="customer-request-list">
       {live.relationshipRequests.length===0&&live.requests.length===0&&live.appointments.length===0?<section className="panel timeline-empty"><b>Noch keine Anfragen.</b><span>Starte eine Anfrage und wähle dabei das Fahrzeug aus, um das es geht.</span></section>:<>
         {live.relationshipRequests.map(request=><article className={'panel customer-request-row '+request.status} key={'relationship-'+request.id}><ShieldCheck/><div><small>KUNDENAUFNAHME · {request.status==='pending'?'OFFEN':request.status==='accepted'?'ANGENOMMEN':'ABGELEHNT'}</small><b>{request.workshopName}</b><p>{request.status==='pending'?'Die Werkstatt prüft deine Kundenanfrage.':request.status==='accepted'?'Du bist als Kunde dieser Werkstatt freigeschaltet.':'Die Werkstatt hat deine Kundenaufnahme abgelehnt.'}</p></div></article>)}
         {live.requests.map(request=>{
           const vehicle=live.vehicles.find(item=>item.id===request.vehicleId);
           const appointment=live.appointments.find(item=>item.serviceRequestId===request.id);
           return <article className={'panel customer-request-row '+request.status} key={request.id}><Car/><div><small>WERKSTATTANFRAGE · {requestStatusLabel(request.status).toUpperCase()}</small><b>{vehicle?[vehicle.make,vehicle.model,vehicle.variant].filter(Boolean).join(' '):'Fahrzeug'} · {vehicle?.licensePlate??'—'}</b><p>{request.complaint}</p><span>{requestStatusText(request)}{appointment?` · Termin: ${relativeDayLabel(new Date(appointment.startsAt),now)}, ${new Date(appointment.startsAt).toLocaleString('de-DE',{dateStyle:'short',timeStyle:'short'})}`:''}{appointment?.status==='cancelled'&&appointment.cancellationReason?` · ${appointment.cancellationReason}`:''}</span></div></article>
         })}
       </>}
     </div>}
     {section==='Dokumente'&&<section className="panel customer-documents-panel">
       <div className="panel-title"><div><span className="overline">DOKUMENTE</span><h3>{documents.length?documents.length+' Dokumente':'Noch keine Dokumente'}</h3></div></div>
       {documents.length?documents.map(document=><div className={'customer-document-card '+(document.document_type==='invoice'?'invoice-card':'')} key={document.id}><div><FileText/><span><small>{document.document_type==='quote'?'KOSTENVORANSCHLAG':document.document_type==='invoice'?'RECHNUNG':'DOKUMENT'}</small><b>{document.document_number||document.title||'Dokument'}</b></span><strong>{document.amount_total!=null?Number(document.amount_total).toLocaleString('de-DE',{style:'currency',currency:document.currency||'EUR'}):''}</strong></div><div><button className="btn primary" onClick={()=>void openDocument(document)}>Dokument öffnen</button></div></div>):<div className="timeline-empty"><FileText size={28}/><b>Noch keine Dokumente vorhanden.</b><span>Kostenvoranschläge und Rechnungen erscheinen hier automatisch.</span></div>}
     </section>}
   </>:<div className="customer-layout"><div className="garage"><VehicleCard name="BMW X3 3.0i" plate="SAD XX 123" detail="2005 · 247.318 km" active tone={0} demo/><VehicleCard name="VW Golf VII" plate="SAD VW 407" detail="2016 · 128.140 km" tone={1} demo/></div><section className="panel timeline"><div className="panel-title"><div><span className="overline">BMW X3 · AUFTRAG #184</span><h3>Aktueller Auftrag</h3></div><Status stage={approved?'repair':'approval'}/></div><Timeline title="Fahrzeug eingetroffen" detail="08:41 · Carplus Service Center"/><Timeline title="Diagnose abgeschlossen" detail="09:12 · Lambdasonde Bank 1 vor Kat"/><Timeline current title={approved?'Reparatur freigegeben':'Deine Freigabe ist erforderlich'} detail={approved?'09:31 · an Werkstatt übermittelt':'09:26 · Kostenvoranschlag bereitgestellt'}/></section></div>}
 </div>
 <CustomerProfileModal open={profileModal} onClose={()=>setProfileModal(false)} onSaved={live.reload}/>
 <VehicleCreateModal open={vehicleModal} onClose={()=>setVehicleModal(false)} onDone={live.reload}/>
 <WorkshopDirectoryModal open={directory} onClose={()=>setDirectory(false)} onChanged={live.reload} relationships={live.workshops}/>
 <ServiceRequestModal open={requestModal} onClose={()=>setRequestModal(false)} onDone={live.reload} vehicles={live.vehicles} workshops={live.workshops}/>
 <VehicleChat open={chat} onClose={()=>setChat(false)} audience="customer" workOrderId={live.isLive?activeOrder?.id:null} vehicleLabel={live.isLive&&activeVehicle?[activeVehicle.make,activeVehicle.model,activeVehicle.variant].filter(Boolean).join(' '):'BMW X3 3.0i'} plate={live.isLive&&activeVehicle?activeVehicle.licensePlate:'SAD XX 123'} orderNumber={live.isLive&&activeOrder?activeOrder.orderNumber:'184'}/>
 <AppointmentCancelModal open={Boolean(cancelTarget)} onClose={()=>setCancelTarget(null)} onDone={live.reload} appointmentId={cancelTarget?.id} startsAt={cancelTarget?.startsAt} mode="customer" vehicle={activeVehicle?[activeVehicle.make,activeVehicle.model,activeVehicle.variant].filter(Boolean).join(' '):'Fahrzeug'}/>
 </Shell>;
}

function Timeline({title,detail,current=false,last=false,children}:{title:string;detail:string;current?:boolean;last?:boolean;children?:React.ReactNode}){return <div className={`timeline-row ${current?'current':''} ${last?'last':''}`}><i/><div><b>{title}</b><small>{detail}</small>{children}</div></div>}

export function BrandingPage({setView}:{setView:(v:AppView)=>void}){
 const live=useWorkshopWorkspace();
 const [url,setUrl]=useState<string>(); const [logoFile,setLogoFile]=useState<File|null>(null); const [palette,setPalette]=useState<Awaited<ReturnType<typeof paletteFromLogo>>|null>(null);
 const [mode,setMode]=useState<'solo'|'team'>('solo'); const [name,setName]=useState(''); const [legalName,setLegalName]=useState('');
 const [street,setStreet]=useState(''); const [postalCode,setPostalCode]=useState(''); const [city,setCity]=useState('');
 const [phone,setPhone]=useState(''); const [email,setEmail]=useState(''); const [website,setWebsite]=useState('');
 const [description,setDescription]=useState(''); const [accepts,setAccepts]=useState(true); const [verified,setVerified]=useState(false);
 const [services,setServices]=useState<string[]>([]);
 const [verificationStatus,setVerificationStatus]=useState<string>('not_requested');
 const [verificationReviewNote,setVerificationReviewNote]=useState<string|null>(null);
 const [busy,setBusy]=useState(false); const [error,setError]=useState<string|null>(null);

 useEffect(()=>{
   if(!live.identity)return;
   let cancelled=false;
   getWorkshopProfile(live.identity.workshopId).then(profile=>{
     if(cancelled)return;
     setName(profile.name??'');setLegalName(profile.legal_name??'');setStreet(profile.street??'');setPostalCode(profile.postal_code??'');
     setCity(profile.city??'');setPhone(profile.phone??'');setEmail(profile.email??'');setWebsite(profile.website??'');
     setDescription(profile.description??'');setMode((profile.operating_mode??'solo') as 'solo'|'team');
     setAccepts(Boolean(profile.accepts_new_customers));setVerified(Boolean(profile.verified_at));
     setServices(Array.isArray(profile.services)?profile.services.filter((item:unknown):item is string=>typeof item==='string'):[]);
     setVerificationStatus(profile.verification_status??(profile.verified_at?'verified':'not_requested'));
     setVerificationReviewNote(profile.verification_review_note??null);
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

 const persistProfile=async(navigateAfter:boolean)=>{
   if(!name.trim()||!street.trim()||!postalCode.trim()||!city.trim())throw new Error('Name und vollständige Werkstattanschrift sind erforderlich.');
   let workshopId=live.identity?.workshopId;
   if(!workshopId){
     const slugBase=name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,45)||'werkstatt';
     const created=await createWorkshop({name,slug:slugBase+'-'+crypto.randomUUID().slice(0,6),street,postalCode,city,legalName,description});
     workshopId=created.id;
   }
   if(!workshopId)throw new Error('Werkstatt konnte nicht angelegt werden.');
   const resolvedWorkshopId:string=workshopId;
   await updateWorkshopProfile({
     workshopId:resolvedWorkshopId,name,legalName,street,postalCode,city,phone,email,website,description,
     operatingMode:mode,acceptsNewCustomers:accepts,services
   });
   if(logoFile&&palette)await uploadWorkshopLogo({workshopId:resolvedWorkshopId,file:logoFile,primary:palette.primary,secondary:palette.dark});
   await live.reload();
   if(navigateAfter)setView('office');
   return resolvedWorkshopId;
 };

 const save=async()=>{
   if(busy)return;
   setBusy(true);setError(null);
   try{await persistProfile(true)}
   catch(err){setError(err instanceof Error?err.message:'Werkstattprofil konnte nicht gespeichert werden.')}
   finally{setBusy(false)}
 };

 const saveBeforeVerification=async()=>{
   setError(null);
   try{await persistProfile(false)}
   catch(err){
     const message=err instanceof Error?err.message:'Werkstattprofil konnte nicht gespeichert werden.';
     setError(message);
     throw err;
   }
 };

 const toggleService=(code:string)=>{
   setServices(current=>current.includes(code)?current.filter(item=>item!==code):[...current,code]);
 };

 const title=name.trim()||'Deine Werkstatt';
 const openVerification=()=>document.getElementById('verification-panel')?.scrollIntoView({behavior:'smooth',block:'start'});

 return <Shell onHome={()=>setView('home')} onSettings={()=>setView('branding')} onNavigate={next=>{if(next==='Werkstatt'){setView('workshop');return}sessionStorage.setItem('motoratlas_office_section',next);setView('office')}} title={title} mode="Werkstattprofil" active=""><div className="page"><PageHead title={live.identity?'Werkstattprofil':'Werkstatt einrichten'} subtitle="Deine Marke bleibt erkennbar – MotorAtlas sorgt für die professionelle, ruhige Darstellung."><div className="head-actions">
   {live.identity?.role==='owner'&&<button className="btn secondary" onClick={openVerification}>{verificationStatus==='verified'?'Verifizierung ansehen':'Verifizierung starten'}</button>}
   <button className="btn primary" disabled={busy} onClick={()=>void save()}>{busy?'Speichert …':live.identity?'Änderungen speichern':'Werkstatt anlegen'}</button>
 </div></PageHead>
 {error&&<div className="workspace-alert">{error}</div>}
 {!live.identity&&<div className="onboarding-note"><ShieldCheck/><div><b>Neue Werkstatt</b><span>Lege die Werkstatt zuerst an. Danach kannst du direkt im Werkstattprofil die Verifizierung starten.</span></div></div>}
 {live.identity?.role==='owner'&&<div className={'verification-entry '+verificationStatus}>
   <div><ShieldCheck/><span><b>{verificationStatus==='verified'?'Werkstatt verifiziert':'Werkstatt noch nicht verifiziert'}</b><small>{verificationStatus==='verified'?'Die Werkstatt ist öffentlich freigegeben. Geprüfte Meisterqualifikationen werden Kunden automatisch als „Meisterwerkstatt“ angezeigt.':'Betriebsnachweis und – je nach Leistungsumfang – Fachnachweise hochladen und anschließend einmalig die MotorAtlas-Verifizierung beantragen.'}</small></span></div>
   <button className="btn primary" onClick={openVerification}>{verificationStatus==='verified'?'Prüfung ansehen':'Jetzt Verifizierung starten'}</button>
 </div>}
 <div className="branding-fields">
  <section className="panel profile-form"><span className="overline">STAMMDATEN</span><h3>Die Werkstatt hinter dem Profil.</h3><div className="form-two"><label><span>Werkstattname</span><input value={name} onChange={e=>setName(e.target.value)} placeholder="z. B. Carplus Service Center"/></label><label><span>Rechtlicher Firmenname</span><input value={legalName} onChange={e=>setLegalName(e.target.value)} placeholder="optional"/></label></div><label><span>Straße & Hausnummer</span><input value={street} onChange={e=>setStreet(e.target.value)} placeholder="Musterstraße 12"/></label><div className="address-grid"><label><span>PLZ</span><input value={postalCode} onChange={e=>setPostalCode(e.target.value)} inputMode="numeric" placeholder="92421"/></label><label><span>Ort</span><input value={city} onChange={e=>setCity(e.target.value)} placeholder="Schwandorf"/></label></div><div className="form-two"><label><span>Telefon</span><input type="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+49 …"/></label><label><span>E-Mail</span><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="service@werkstatt.de"/></label></div><label><span>Website</span><input value={website} onChange={e=>setWebsite(e.target.value)} placeholder="https://www.meine-werkstatt.de"/></label><label><span>Beschreibung</span><textarea rows={4} value={description} onChange={e=>setDescription(e.target.value)} placeholder="Leistungen, Spezialisierung und das, was deine Werkstatt besonders macht."/></label><label className="toggle-row"><input type="checkbox" checked={accepts} onChange={e=>setAccepts(e.target.checked)}/><span><b>Neue Kunden annehmen</b><small>Kann jederzeit deaktiviert werden, wenn die Werkstatt ausgelastet ist.</small></span></label></section>
  <div className="branding-stack"><section className="panel"><span className="overline">ADAPTIVES BRANDING</span><h3>Logo rein. Premium-Farbsystem raus.</h3><p>MotorAtlas analysiert die dominante Markenfarbe und erzeugt daraus kontraststarke, dezente UI-Akzente.</p><label className="logo-upload"><Sparkles/><b>{url?'Logo ändern':'Werkstattlogo hochladen'}</b><span>PNG, JPG oder WebP</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>void logo(e.target.files?.[0])}/></label><div className="swatches"><i/><i/><i/></div></section>
  <section className="panel preview"><span className="overline">LIVE-VORSCHAU</span><div className="profile-preview"><div className="preview-logo">{url?<img src={url} alt="Werkstattlogo"/>:<span>{title.slice(0,2).toUpperCase()}</span>}</div><div><b>{title}</b><small className={verified?'verified-copy':'pending-copy'}><ShieldCheck size={14}/> {verified?'Verifizierte Werkstatt':'Verifizierung ausstehend'}</small></div></div><div className="preview-order"><Status stage="repair"/><h3>BMW X3 3.0i</h3><small>Auftrag #184 · Reparatur freigegeben</small><button className="btn primary full">Auftrag öffnen</button></div></section></div>
 </div>
 <section className="panel service-selection">
   <span className="overline">LEISTUNGSUMFANG</span>
   <h3>Was bietet deine Werkstatt tatsächlich an?</h3>
   <p>Der Leistungsumfang steuert automatisch, welche fachlichen Nachweise MotorAtlas für die Verifizierung verlangt.</p>
   <div className="service-option-grid">
     {WORKSHOP_SERVICE_OPTIONS.map(service=><button
       type="button"
       key={service.code}
       className={services.includes(service.code)?'selected':''}
       onClick={()=>toggleService(service.code)}
     >
       <span>{services.includes(service.code)?'✓':'+'}</span>
       <div><b>{service.label}</b><small>{service.description}</small></div>
       {service.qualificationScope!=='none'&&<em>Fachnachweis</em>}
     </button>)}
   </div>
   <small className="service-legal-note">MotorAtlas nutzt diese Einstufung als Prüfregel. Die endgültige handwerksrechtliche Berechtigung wird bei zulassungspflichtigen Tätigkeiten anhand des Handwerksrollen-/HWK-Nachweises geprüft.</small>
 </section>
 {live.identity?.role==='owner'&&<VerificationPanel
   workshopId={live.identity.workshopId}
   services={services}
   initialStatus={verificationStatus}
   reviewNote={verificationReviewNote}
   onBeforeSubmit={saveBeforeVerification}
 />}
 <section className="panel org-mode"><span className="overline">ORGANISATION</span><h3>Die Oberfläche passt sich an deinen Betrieb an.</h3><div><button className={mode==='solo'?'selected':''} onClick={()=>setMode('solo')}><Building2/><b>Einzelbetrieb</b><span>Eine Person sieht Büro und Werkstatt in einem flüssigen Ablauf.</span></button><button className={mode==='team'?'selected':''} onClick={()=>setMode('team')}><Users/><b>Team-Betrieb</b><span>Büro, Mechaniker und individuelle Berechtigungen arbeiten synchron.</span></button></div></section>
 {live.identity?.role==='owner'&&mode==='team'&&<TeamManager workshopId={live.identity.workshopId} currentUserId={live.identity.userId}/>}
 </div></Shell>;
}
