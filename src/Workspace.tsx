import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Bell, Building2, CalendarDays, Car, Clock3, FileText, Home, Mail, MapPin, MessageCircle,
  Phone, Plus, Search, Settings, ShieldCheck, Sparkles, UserRound, Users, Wrench
} from 'lucide-react';
import { jobs, type Job, type Stage } from './demo';
import { applyPalette, paletteFromLogo, paletteFromStoredColors } from './lib';
import { Brand, CarArt, Status, stageLabels, type AppView } from './components';
import { assignWorkToMember, closeWorkOrder, completeRepair, createWorkshop, customerResolveAfterDiagnosis, getDocumentVersionUrl, getWorkshopLogoPublicUrl, getWorkshopProfile, listWorkOrderDocuments, markNoCostsAndReadyForPickup, markNotificationRead, markReadyForPickup, markVehicleArrived, recordApproval, resolveWorkOrderNextStep, respondAppointment, updateWorkshopProfile, uploadWorkshopLogo, type AppNotification, type LiveJob, type ServiceRequestIntent, type WorkNextStepDecision, type WorkshopAppointment, type WorkshopChatInboxItem } from './api';
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
import { WorkDecisionModal } from './WorkDecisionModal';
import { WORKSHOP_SERVICE_OPTIONS } from './verification';

type ShellSection='Übersicht'|'Werkstatt'|'Termine'|'Kunden'|'Fahrzeuge'|'Dokumente'|'Stammwerkstatt';
type ShellNavItem=[ShellSection,typeof Home,string?];

function Shell({
  children,title,mode,active,onHome,onSettings,onNavigate,navItems,notifications=[],onNotificationOpen,onNotificationsChanged,logoUrl
}:{
  children:React.ReactNode;title:string;mode:string;active:string;onHome:()=>void;
  onSettings?:()=>void;onNavigate?:(section:ShellSection)=>void;navItems?:ShellNavItem[];
  notifications?:AppNotification[];onNotificationOpen?:(notification:AppNotification)=>void;
  onNotificationsChanged?:()=>Promise<void>|void;
  logoUrl?:string|null;
}){
  const items:ShellNavItem[]=navItems??[
    ['Übersicht',Home],['Werkstatt',Wrench],['Termine',CalendarDays],['Kunden',Users],['Fahrzeuge',Car],['Dokumente',FileText]
  ];
  const [notificationOpen,setNotificationOpen]=useState(false);
  const unread=notifications.filter(item=>!item.readAt).length;
  const initials=title.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]?.toUpperCase()).join('')||'MA';

  const openNotification=(notification:AppNotification)=>{
    // Open the target immediately. Waiting for the read-status roundtrip first
    // can remove/reload the notification context on slower mobile connections.
    setNotificationOpen(false);
    onNotificationOpen?.(notification);
    if(!notification.readAt){
      void (async()=>{
        try{
          await markNotificationRead(notification.id);
          await onNotificationsChanged?.();
        }catch{}
      })();
    }
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
        <button className="profile"><span className="identity-logo">{logoUrl?<img src={logoUrl} alt="Werkstattlogo"/>:initials}</span><div><b>{title}</b><small>{mode}</small></div></button>
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
            <div>{notifications.length?notifications.slice(0,12).map(item=><button key={item.id} className={item.readAt?'':'unread'} onClick={()=>openNotification(item)}>
              <span className="notification-dot"/><div><b>{item.title}</b><p>{item.body||'Neue Aktivität in MotorAtlas.'}</p><small>{new Date(item.createdAt).toLocaleString('de-DE',{dateStyle:'short',timeStyle:'short'})}</small></div>
            </button>):<div className="notification-empty"><Bell/><b>Keine neuen Meldungen.</b><span>Neue Anfragen und Terminantworten erscheinen hier automatisch.</span></div>}</div>
          </div>}
        </div>
        <div className="top-identity"><span className="top-workshop-logo">{logoUrl?<img src={logoUrl} alt="Werkstattlogo"/>:initials}</span><div><b>{title}</b><small>{mode}</small></div></div>
      </div>
      {children}
    </main>
  </div>;
}

function PageHead({title,subtitle,children}:{title:string;subtitle:string;children?:React.ReactNode}){return <div className="page-head"><div><h1>{title}</h1><p>{subtitle}</p></div>{children}</div>}

const orderStages:Stage[]=['arrived','diagnosis','approval','repair','pickup'];
type DisplayJob=Job&Partial<LiveJob>;
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

function customerOrderTitle(rawStage:string,commercialState?:string|null){
  if(rawStage==='appointment_confirmed')return'Bevorstehender Werkstatttermin';
  if(rawStage==='waiting_diagnosis')return'Dein Fahrzeug ist eingetroffen';
  if(rawStage==='diagnosing')return'Diagnose läuft';
  if(rawStage==='awaiting_quote')return'Kostenvoranschlag wird vorbereitet';
  if(rawStage==='awaiting_customer_decision')return'Deine Entscheidung ist gefragt';
  if(rawStage==='awaiting_customer_approval')return'Deine Freigabe wird benötigt';
  if(rawStage==='ready_for_repair')return'Reparatur ist freigegeben';
  if(rawStage==='repairing')return'Reparatur läuft';
  if(rawStage==='repair_complete'){
    if(commercialState==='no_repair')return'Ohne Reparatur abgeschlossen';
    if(commercialState==='deferred')return'Reparatur auf später verschoben';
    if(commercialState==='diagnosis_only')return'Diagnose abgeschlossen';
    return'Arbeiten abgeschlossen';
  }
  if(rawStage==='ready_for_pickup')return'Dein Fahrzeug ist abholbereit';
  return'Aktueller Werkstattauftrag';
}

function customerOrderDetail(rawStage:string,commercialState?:string|null,invoiceRequired=true){
  if(rawStage==='waiting_diagnosis')return'Die Werkstatt hat dein Fahrzeug angenommen. Es wartet jetzt auf die Zuordnung zur Diagnose.';
  if(rawStage==='diagnosing')return'Die Diagnose wurde einem Mitarbeiter zugeordnet und hat begonnen.';
  if(rawStage==='awaiting_quote')return'Die Werkstatt bereitet den Kostenvoranschlag bzw. den nächsten vereinbarten Schritt vor.';
  if(rawStage==='awaiting_customer_decision')return'Die Diagnose ist abgeschlossen. Du kannst jetzt einen Kostenvoranschlag anfordern, auf die Reparatur verzichten oder sie auf später verschieben.';
  if(rawStage==='awaiting_customer_approval')return'Prüfe den Kostenvoranschlag und entscheide über die Reparatur.';
  if(rawStage==='ready_for_repair')return commercialState==='direct_order'
    ?'Du hast die beschriebene Leistung direkt beauftragt. Die Werkstatt ordnet die Arbeit jetzt einem Mitarbeiter zu.'
    :commercialState==='external_approved'
      ?'Die außerhalb von MotorAtlas getroffene Vereinbarung ist dokumentiert. Die Werkstatt kann die Arbeit starten.'
      :'Die Reparatur ist freigegeben. Die Werkstatt ordnet die Arbeit jetzt einem Mitarbeiter zu.';
  if(rawStage==='repairing')return'Die Reparatur wurde einem Mitarbeiter zugeordnet und wird durchgeführt.';
  if(rawStage==='repair_complete'){
    if(commercialState==='no_repair')return'Der Auftrag endet ohne Reparatur. Eine eventuelle Diagnose- oder Prüfungsrechnung und die Abholung werden vorbereitet.';
    if(commercialState==='deferred')return'Die Reparatur wird in diesem Auftrag nicht durchgeführt. Du kannst sie später als neuen Auftrag planen.';
    if(commercialState==='diagnosis_only')return'Die gewünschte Diagnose/Prüfung ist beendet. Eine Reparatur wurde nicht automatisch beauftragt.';
    return'Die Arbeiten sind abgeschlossen. Rechnung und Abholung werden vorbereitet.';
  }
  if(rawStage==='ready_for_pickup')return invoiceRequired===false
    ?'Für diesen Auftrag sind keine Kosten entstanden. Dein Fahrzeug ist fertig und kann abgeholt werden.'
    :'Dein Fahrzeug ist fertig und kann abgeholt werden.';
  return'Der Status wird automatisch mit der Werkstatt synchronisiert.';
}

function requestIntentLabel(intent?:ServiceRequestIntent|null){
  if(intent==='direct_work')return'Direktauftrag';
  if(intent==='diagnosis_only')return'Nur Diagnose / Prüfung';
  if(intent==='diagnosis_then_decide')return'Diagnose · danach entscheiden';
  if(intent==='quote_before_work')return'Kostenvoranschlag vor Arbeit';
  return'Diagnose + Kostenvoranschlag';
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
 const [notificationChatThreadId,setNotificationChatThreadId]=useState<string|null>(null);
 const [chatInboxTarget,setChatInboxTarget]=useState<WorkshopChatInboxItem|null>(null);
 const [workshopOverviewOpen,setWorkshopOverviewOpen]=useState(false);
 const [selectedId,setSelectedId]=useState<string>(displayJobs[0]?.id??jobs[0].id);
 const [docType,setDocType]=useState<'quote'|'invoice'|null>(null);
 const [workDecision,setWorkDecision]=useState<WorkNextStepDecision|null>(null);
 const [noCostConfirm,setNoCostConfirm]=useState(false);
 const [serviceRequest,setServiceRequest]=useState<(typeof live.serviceRequests)[number]|null>(null);
 const [customerRequest,setCustomerRequest]=useState<any|null>(null);
 const [busy,setBusy]=useState(false);
 const [arrivalBusy,setArrivalBusy]=useState<string|null>(null);
 const [cancelTarget,setCancelTarget]=useState<WorkshopAppointment|null>(null);
 const [actionError,setActionError]=useState<string|null>(null);
 const [documents,setDocuments]=useState<any[]>([]);
 const [documentsBusy,setDocumentsBusy]=useState(false);
 const [notificationScrollId,setNotificationScrollId]=useState<string|null>(null);
 const [notificationAppointmentId,setNotificationAppointmentId]=useState<string|null>(null);
 const [pendingNotification,setPendingNotification]=useState<AppNotification|null>(()=>{
   const raw=sessionStorage.getItem('motoratlas_pending_notification');
   if(!raw)return null;
   try{return JSON.parse(raw) as AppNotification}catch{sessionStorage.removeItem('motoratlas_pending_notification');return null}
 });
 const selected=displayJobs.find(job=>job.id===selectedId)??displayJobs[0];
 const inWorkshopJobs=useMemo(()=>displayJobs
   .filter(job=>!live.isLive||Boolean(job.arrivedAt))
   .sort((a,b)=>new Date(a.arrivedAt??a.updatedAt??0).getTime()-new Date(b.arrivedAt??b.updatedAt??0).getTime()),[displayJobs,live.isLive]);
 const counts=useMemo(()=>Object.fromEntries(orderStages.map(stage=>[stage,displayJobs.filter(job=>job.stage===stage).length])),[displayJobs]);
 const title=live.identity?.workshopName??'Carplus Service';
 const unreadChats=live.chatInbox.reduce((sum,item)=>sum+item.unreadCount,0);
 const responseTimeLabel=live.responseStats.sampleCount<3||live.responseStats.medianResponseMinutes==null
   ?'Noch nicht genug Daten'
   :live.responseStats.medianResponseMinutes<60
     ?`Antwortet meist in ca. ${Math.max(1,Math.round(live.responseStats.medianResponseMinutes))} Min.`
     :live.responseStats.medianResponseMinutes<1440
       ?`Antwortet meist in ca. ${Math.round(live.responseStats.medianResponseMinutes/60*10)/10} Std.`
       :`Antwortet meist in ca. ${Math.round(live.responseStats.medianResponseMinutes/1440*10)/10} Tagen`;

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
       if(notificationAppointmentId&&item.id===notificationAppointmentId)return true;
       const phase=appointmentPhase(item,now);
       if(phase==='late')return true;
       const startDate=new Date(item.startsAt);
       return startDate>=begin&&startDate<endDate;
     })
     .sort((a,b)=>new Date(a.startsAt).getTime()-new Date(b.startsAt).getTime());
 },[live.appointments,scheduleRange,now,notificationAppointmentId]);

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
     case'awaiting_quote':return'Nächsten Schritt festlegen';
     case'awaiting_customer_decision':return'Nächsten Schritt festlegen';
     case'awaiting_customer_approval':return'Wartet auf Kundenfreigabe';
     case'repair_complete':return selected.invoiceRequired===false?'Abholbereit setzen':'Rechnung hochladen';
     case'ready_for_pickup':return'Fahrzeug abgeholt';
     default:return'Vorgang öffnen';
   }
 };

 const runPrimary=async()=>{
   if(!selected||busy||!live.isLive)return;
   setActionError(null);
   if(selected.rawStage==='awaiting_quote'||selected.rawStage==='awaiting_customer_decision')return;
   if(selected.rawStage==='repair_complete'&&selected.invoiceRequired!==false){setDocType('invoice');return;}
   if(selected.rawStage==='awaiting_customer_approval')return;
   setBusy(true);
   try{
     if(selected.rawStage==='repair_complete'&&selected.invoiceRequired===false)await markReadyForPickup(selected.id);
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

 const confirmNoCosts=async()=>{
   if(!selected||busy||!live.isLive)return;
   setBusy(true);setActionError(null);
   try{
     await markNoCostsAndReadyForPickup(selected.id);
     setNoCostConfirm(false);
     await live.reload();
   }catch(err){
     setActionError(err instanceof Error?err.message:'Der Auftrag konnte nicht ohne Rechnung abgeschlossen werden.');
   }finally{
     setBusy(false);
   }
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
   const targetType=notification.targetType;
   if(targetType==='customer_request'||notification.kind==='customer_request'){
     openSection('Kunden');
     if(notification.targetId){
       const target=live.customerRequests.find(item=>item.id===notification.targetId);
       if(target)setCustomerRequest(target);
     }
     return true;
   }
   if(targetType==='service_request'||notification.kind==='request'){
     openSection('Termine');
     if(notification.targetId){
       const target=live.serviceRequests.find(item=>item.id===notification.targetId);
       if(target)setServiceRequest(target);
     }
     return true;
   }
   if(targetType==='appointment'||notification.kind==='appointment'){
     openSection('Termine');
     setScheduleRange('month');
     if(notification.targetId){
       setNotificationAppointmentId(notification.targetId);
       setNotificationScrollId('appointment-'+notification.targetId);
     }
     return true;
   }
   if(targetType==='chat_thread'||notification.kind==='chat'){
     openSection('Übersicht');
     if(notification.workOrderId)setSelectedId(notification.workOrderId);
     if(targetType==='chat_thread'&&notification.targetId){
       setNotificationChatThreadId(notification.targetId);
       setChat(false);
       setChatInboxTarget(null);
       return true;
     }
     if(notification.workOrderId){
       setNotificationChatThreadId(null);
       setChat(true);
     }
     return true;
   }
   if(targetType==='document'||notification.kind==='document'){
     openSection('Dokumente');
     if(notification.targetId)setNotificationScrollId('office-document-'+notification.targetId);
     return true;
   }
   if(targetType==='work_order'||notification.kind==='order'||notification.workOrderId){
     const orderId=notification.targetId??notification.workOrderId;
     if(orderId)setSelectedId(orderId);
     openSection('Übersicht');
     return true;
   }
   openSection('Übersicht');
   return true;
 };

 useEffect(()=>{
   if(!pendingNotification)return;
   if(!openNotification(pendingNotification))return;
   sessionStorage.removeItem('motoratlas_pending_notification');
   setPendingNotification(null);
 },[pendingNotification,live.chatInbox,live.serviceRequests,live.customerRequests,live.jobs]);

 useEffect(()=>{
   if(!notificationScrollId)return;
   const timer=window.setTimeout(()=>{
     const node=document.getElementById(notificationScrollId);
     if(!node)return;
     node.scrollIntoView({behavior:'smooth',block:'center'});
     node.classList.add('notification-target');
     window.setTimeout(()=>node.classList.remove('notification-target'),1800);
     setNotificationScrollId(null);
   },100);
   return()=>window.clearTimeout(timer);
 },[notificationScrollId,section,visibleAppointments.length,documents.length]);

 const appointmentCard=(item:WorkshopAppointment)=>{
   const phase=appointmentPhase(item,now);
   const start=new Date(item.startsAt);
   const dayLabel=relativeDayLabel(start,now);
   const canArrive=item.status==='confirmed'&&!item.arrivedAt&&item.rawOrderStage==='appointment_confirmed'&&Boolean(item.workOrderId);
   const canCancel=!item.arrivedAt&&(item.status==='confirmed'||item.status==='proposed')&&(!item.rawOrderStage||item.rawOrderStage==='appointment_confirmed');
   return <article id={'appointment-'+item.id} key={item.id} className={'schedule-card '+phase}>
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
   logoUrl={live.identity?.logoPath?getWorkshopLogoPublicUrl(live.identity.logoPath):undefined}
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
     <div className="metrics workshop-metrics">
       <button className="metric-card metric-clickable" onClick={()=>setWorkshopOverviewOpen(true)}><small>IN DER WERKSTATT</small><b>{inWorkshopJobs.length}</b><span>anwesende Fahrzeuge · öffnen</span></button>
       <article className={appointmentStats.today?'attention':''}><small>HEUTE ERWARTET</small><b>{appointmentStats.today}</b><span>{appointmentStats.due?'davon '+appointmentStats.due+' jetzt fällig':'geplante Ankünfte'}</span></article>
       <article className={appointmentStats.late?'danger':''}><small>VERSPÄTET</small><b>{appointmentStats.late}</b><span>Termin überschritten</span></article>
       <article><small>NEUE ANFRAGEN</small><b>{live.isLive?live.serviceRequests.length:3}</b><span>zu bearbeiten</span></article>
       <article className="primary-customers"><small>STAMMWERKSTATT FÜR</small><b>{live.isLive?live.metrics.primaryCustomerCount:0}</b><span>{live.metrics.activeCustomerCount} aktive Kunden insgesamt</span></article>
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

     {live.isLive&&<section className="panel workshop-chat-inbox">
       <header>
         <div><span className="overline">CHAT-EINGANG</span><h3>Nachrichten von Kunden</h3><small>{live.identity?.chatEnabled?responseTimeLabel:'Chat ist derzeit deaktiviert – vorhandene Verläufe bleiben lesbar.'}</small></div>
         <div className="chat-inbox-count"><MessageCircle/><b>{unreadChats}</b><span>ungelesen</span></div>
       </header>
       <div className="chat-inbox-list">
         {live.chatInbox.length?live.chatInbox.slice(0,6).map(item=><button key={item.threadId} className={item.unreadCount?'chat-inbox-row unread':'chat-inbox-row'} onClick={()=>setChatInboxTarget(item)}>
           <VehiclePhoto path={item.photoPath} alt={item.vehicleName}/>
           <span className="chat-inbox-main"><b>{item.customerName}</b><small>{item.vehicleName} · {item.plate}</small><p>{item.lastMessage}</p></span>
           <span className="chat-inbox-meta"><small>{new Date(item.lastMessageAt).toLocaleString('de-DE',{dateStyle:'short',timeStyle:'short'})}</small>{item.unreadCount>0&&<b>{item.unreadCount}</b>}</span>
         </button>):<div className="inbox-empty">Noch keine Chatnachrichten vorhanden.</div>}
       </div>
     </section>}

     <div className="board">{orderStages.map(stage=><section key={stage}><header><span>{stageLabels[stage]}</span><b>{counts[stage]??0}</b></header><div>{displayJobs.filter(job=>job.stage===stage).map(job=><button className="card-button" onClick={()=>setSelectedId(job.id)} key={job.id}><JobCard job={job}/></button>)}</div></section>)}</div>
     <div className="lower-grid">{selected?<section className="panel focus-card workflow-focus-card">
       <div><span className="overline">AUSGEWÄHLTER VORGANG</span><h3>{selected.vehicle}</h3><small>{selected.plate} · Auftrag #{selected.orderNumber??selected.id.slice(-6)}</small>{selected.workflowPath&&<span className="workflow-path-label">{selected.workflowPath==='direct_work'?'Direktauftrag':selected.workflowPath==='diagnosis_only'?'Nur Diagnose':selected.workflowPath==='diagnosis_then_decide'?'Diagnose → Entscheidung':selected.workflowPath==='quote_before_work'?'Kostenvoranschlag vor Arbeit':'Diagnose → Kostenvoranschlag'}</span>}</div>
       <div className="focus-action"><Status stage={selected.stage}/><button className="btn secondary" onClick={()=>{setNotificationChatThreadId(null);setChat(true)}}><MessageCircle size={16}/> Fahrzeugchat</button>{!['awaiting_quote','awaiting_customer_decision'].includes(selected.rawStage??'')&&!(selected.rawStage==='repair_complete'&&selected.invoiceRequired!==false)&&<button className="btn primary" disabled={busy||Boolean(live.isLive&&selected.rawStage==='awaiting_customer_approval')} onClick={()=>void runPrimary()}>{busy?'Bitte warten …':actionLabel()}</button>}</div>
       {['awaiting_quote','awaiting_customer_decision'].includes(selected.rawStage??'')&&<div className="workflow-next-steps">
         <div className="workflow-choice-grid">
           <button className="workflow-choice primary" onClick={async()=>{setBusy(true);setActionError(null);try{if(selected.rawStage==='awaiting_customer_decision')await resolveWorkOrderNextStep({workOrderId:selected.id,decision:'motoratlas_quote'});setDocType('quote');await live.reload()}catch(err){setActionError(err instanceof Error?err.message:'Kostenvoranschlag konnte nicht vorbereitet werden.')}finally{setBusy(false)}}}>
             <FileText/><span><b>KVA in MotorAtlas</b><small>Kostenvoranschlag hier erstellen und freigeben lassen</small></span>
           </button>
           <button className="workflow-choice" onClick={()=>setWorkDecision('external_approved')}>
             <ShieldCheck/><span><b>Bereits extern vereinbart</b><small>Freigabe liegt bereits per Telefon, E-Mail oder persönlich vor</small></span>
           </button>
           <button className="workflow-choice" onClick={()=>setWorkDecision('external_waiting')}>
             <Clock3/><span><b>Externes Angebot · Entscheidung offen</b><small>Angebot oder Abstimmung erfolgte extern</small></span>
           </button>
           <button className="workflow-choice" onClick={()=>setWorkDecision('no_repair')}>
             <Car/><span><b>Keine Reparatur</b><small>Auftrag ohne weitere Reparatur abschließen</small></span>
           </button>
           <button className="workflow-choice" onClick={()=>setWorkDecision('deferred')}>
             <CalendarDays/><span><b>Reparatur später</b><small>Aktuellen Auftrag beenden und später neu planen</small></span>
           </button>
         </div>
       </div>}
       {selected.rawStage==='repair_complete'&&selected.invoiceRequired!==false&&<div className="workflow-next-steps billing-next-steps">
         <div className="workflow-choice-grid billing-choice-grid">
           <button className="workflow-choice primary" disabled={busy} onClick={()=>setDocType('invoice')}>
             <FileText/><span><b>Rechnung hochladen</b><small>Rechnung bereitstellen und das Fahrzeug anschließend zur Abholung freigeben</small></span>
           </button>
           <button className="workflow-choice no-cost-choice" disabled={busy} onClick={()=>{setActionError(null);setNoCostConfirm(true)}}>
             <ShieldCheck/><span><b>Keine Kosten entstanden</b><small>Keine Rechnung erforderlich – Fahrzeug direkt abholbereit setzen</small></span>
           </button>
         </div>
       </div>}
     </section>:<section className="panel focus-card"><div><span className="overline">KEINE FAHRZEUGE IN DER WERKSTATT</span><h3>Die Werkstatt-Queue ist leer.</h3><small>Bestätigte Termine bleiben in der Terminplanung, bis das Fahrzeug tatsächlich eintrifft.</small></div></section>}</div>
   </>}

   {section==='Termine'&&<>
     <PageHead title="Terminplanung & Auslastung" subtitle="Bestätigte Termine bleiben geplant. Erst der echte Check-in verschiebt das Fahrzeug in die Werkstatt.">
       <div className="schedule-range">
         <button className={scheduleRange==='day'?'active':''} onClick={()=>{setNotificationAppointmentId(null);setScheduleRange('day')}}>Heute</button>
         <button className={scheduleRange==='week'?'active':''} onClick={()=>{setNotificationAppointmentId(null);setScheduleRange('week')}}>7 Tage</button>
         <button className={scheduleRange==='month'?'active':''} onClick={()=>{setNotificationAppointmentId(null);setScheduleRange('month')}}>31 Tage</button>
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
       {!documentsBusy&&documents.length?documents.map(document=><button id={'office-document-'+document.id} key={document.id} className="inbox-row" onClick={()=>void openDocument(document)}>
         <span className="inbox-icon"><FileText/></span>
         <span><b>{document.title||document.document_number||'Dokument'}</b><small>{document.job?.vehicle} · {document.job?.plate}</small><p>{document.document_type==='quote'?'Kostenvoranschlag':document.document_type==='invoice'?'Rechnung':'Dokument'} · {document.status}</p></span>
         <strong>{document.amount_total!=null?Number(document.amount_total).toLocaleString('de-DE',{style:'currency',currency:document.currency||'EUR'}):'Öffnen'}</strong>
       </button>):!documentsBusy&&<div className="inbox-empty">Noch keine Dokumente vorhanden.</div>}
     </section>
   </>}
 </div>
 {selected&&<VehicleChat open={chat} onClose={()=>setChat(false)} audience="workshop" workOrderId={live.isLive?selected.id:null} vehicleLabel={selected.vehicle} plate={selected.plate} orderNumber={selected.orderNumber??selected.id.slice(-6)} chatEnabled={live.identity?.chatEnabled}/>}
 <VehicleChat
   open={Boolean(notificationChatThreadId)}
   onClose={()=>setNotificationChatThreadId(null)}
   audience="workshop"
   chatThreadId={notificationChatThreadId}
   workOrderId={selected?.id??null}
   vehicleLabel={live.chatInbox.find(item=>item.threadId===notificationChatThreadId)?.vehicleName??selected?.vehicle??'Fahrzeug'}
   plate={live.chatInbox.find(item=>item.threadId===notificationChatThreadId)?.plate??selected?.plate??'—'}
   orderNumber={selected?.orderNumber??selected?.id?.slice(-6)??''}
   chatEnabled={live.identity?.chatEnabled}
 />
 <VehicleChat open={Boolean(chatInboxTarget)} onClose={()=>setChatInboxTarget(null)} audience="workshop" chatThreadId={chatInboxTarget?.threadId} workshopId={live.identity?.workshopId} vehicleId={chatInboxTarget?.vehicleId} vehicleLabel={chatInboxTarget?.vehicleName??'Fahrzeug'} plate={chatInboxTarget?.plate??'—'} chatEnabled={live.identity?.chatEnabled}/>
 {selected&&live.identity&&docType&&<DocumentUploadModal open={Boolean(docType)} onClose={()=>setDocType(null)} onDone={documentDone} workOrderId={selected.id} workshopId={live.identity.workshopId} vehicle={selected.vehicle} type={docType}/>}
 {selected&&<WorkDecisionModal open={Boolean(workDecision)} onClose={()=>setWorkDecision(null)} onDone={live.reload} workOrderId={selected.id} vehicle={selected.vehicle} decision={workDecision}/>}
 {selected&&noCostConfirm&&<div className="modal-backdrop" onMouseDown={()=>{if(!busy)setNoCostConfirm(false)}}>
   <section className="workflow-modal no-cost-modal" onMouseDown={event=>event.stopPropagation()}>
     <header><div className="modal-icon"><ShieldCheck/></div><div><span>ABRECHNUNG</span><h2>Keine Kosten entstanden</h2><small>{selected.vehicle} · Auftrag #{selected.orderNumber??selected.id.slice(-6)}</small></div><button disabled={busy} onClick={()=>setNoCostConfirm(false)} aria-label="Schließen">×</button></header>
     <div className="workflow-decision-note"><ShieldCheck/><p>Für diesen Auftrag wird dem Kunden nichts berechnet. Es ist keine Rechnung erforderlich und das Fahrzeug wird direkt auf „abholbereit“ gesetzt.</p></div>
     {actionError&&<div className="modal-error">{actionError}</div>}
     <div className="modal-actions"><button type="button" className="btn secondary" disabled={busy} onClick={()=>setNoCostConfirm(false)}>Abbrechen</button><button type="button" className="btn primary" disabled={busy} onClick={()=>void confirmNoCosts()}>{busy?'Wird gespeichert …':'Keine Kosten · abholbereit'}</button></div>
   </section>
 </div>}
 <ServiceRequestOfficeModal open={Boolean(serviceRequest)} onClose={()=>setServiceRequest(null)} onDone={live.reload} request={serviceRequest}/>
 <CustomerAdmissionModal open={Boolean(customerRequest)} onClose={()=>setCustomerRequest(null)} onDone={live.reload} request={customerRequest}/>
 <AppointmentCancelModal open={Boolean(cancelTarget)} onClose={()=>setCancelTarget(null)} onDone={live.reload} appointmentId={cancelTarget?.id} startsAt={cancelTarget?.startsAt} mode="workshop" vehicle={cancelTarget?.vehicle}/>
 {workshopOverviewOpen&&<div className="modal-backdrop" onMouseDown={()=>setWorkshopOverviewOpen(false)}>
   <section className="workflow-modal in-workshop-modal" onMouseDown={event=>event.stopPropagation()}>
     <header><div className="modal-icon"><Car/></div><div><span>IN DER WERKSTATT</span><h2>{inWorkshopJobs.length} anwesende Fahrzeuge</h2><small>Nur tatsächlich eingecheckte, noch nicht abgeschlossene Fahrzeuge.</small></div><button onClick={()=>setWorkshopOverviewOpen(false)} aria-label="Schließen">×</button></header>
     <div className="in-workshop-list">
       {inWorkshopJobs.length?inWorkshopJobs.map(job=><button key={job.id} className="in-workshop-row" onClick={()=>{
         sessionStorage.setItem('motoratlas_workshop_selected_order',job.id);
         setWorkshopOverviewOpen(false);
         setView('workshop');
       }}>
         <div className="in-workshop-photo">{job.photoPath?<VehiclePhoto path={job.photoPath} alt={job.vehicle}/>:<CarArt tone={toneFor(job.id)}/>}</div>
         <div className="in-workshop-main"><b>{job.vehicle}</b><small>{job.plate} · Auftrag #{job.orderNumber??job.id.slice(-6)}</small><p>{job.customerName??'Kunde'} · {job.complaint}</p></div>
         <div className="in-workshop-meta"><Status stage={job.stage}/><small>{job.arrivedAt?'Eingetroffen '+new Date(job.arrivedAt).toLocaleString('de-DE',{dateStyle:'short',timeStyle:'short'}):'Anwesend'}</small><strong>{job.assignee?'Bei '+job.assignee:'Auftrag öffnen'}</strong></div>
       </button>):<div className="inbox-empty">Aktuell ist kein Fahrzeug eingecheckt.</div>}
     </div>
   </section>
 </div>}
 </Shell>;
}

export function WorkshopBoard({setView}:{setView:(v:AppView)=>void}){
 const live=useWorkshopWorkspace();
 const allJobs=(live.isLive?live.jobs:jobs) as DisplayJob[];
 const queue=live.isLive
   ?allJobs.filter(job=>Boolean(job.arrivedAt)&&!['closed','cancelled'].includes(job.rawStage??''))
   :allJobs.filter(job=>job.stage==='arrived'||job.stage==='diagnosis'||job.stage==='approval'||job.stage==='repair'||job.stage==='pickup');
 const [selectedId,setSelectedId]=useState<string>(()=>sessionStorage.getItem('motoratlas_workshop_selected_order')??queue[0]?.id??'');
 const selected=queue.find(job=>job.id===selectedId)??queue[0];
 const [chat,setChat]=useState(false);
 const [notificationChatThreadId,setNotificationChatThreadId]=useState<string|null>(null);
 const [diagnosis,setDiagnosis]=useState(false);
 const [busy,setBusy]=useState(false);
 const [actionError,setActionError]=useState<string|null>(null);
 const [memberId,setMemberId]=useState('');
 const title=live.identity?.workshopName??'Carplus Service';

 useEffect(()=>{
   if(!selected)return;
   if(selected.assigneeUserId){setMemberId(selected.assigneeUserId);return}
   const type=selected.rawStage==='ready_for_repair'||selected.rawStage==='repairing'?'repair':'diagnosis';
   const eligible=live.members.filter(member=>type==='diagnosis'?member.canDiagnosis:member.canRepair);
   const preferred=eligible.find(member=>member.userId===live.identity?.userId)??eligible[0];
   setMemberId(preferred?.userId??'');
 },[selected?.id,selected?.assigneeUserId,selected?.rawStage,live.identity?.userId,live.members]);

 useEffect(()=>{
   if(selectedId&&queue.some(job=>job.id===selectedId)){
     sessionStorage.removeItem('motoratlas_workshop_selected_order');
     return;
   }
   setSelectedId(queue[0]?.id??'');
 },[queue,selectedId]);

 const owned=(job:DisplayJob)=>Boolean(live.isLive&&job.assigneeUserId===live.identity?.userId);
 const workType=(job:DisplayJob):'diagnosis'|'repair'=>job.rawStage==='ready_for_repair'||job.rawStage==='repairing'?'repair':'diagnosis';
 const canAssign=(job:DisplayJob)=>job.rawStage==='waiting_diagnosis'||job.rawStage==='ready_for_repair';
 const assignmentLabel=(job:DisplayJob)=>workType(job)==='diagnosis'?'Diagnose':'Reparatur';
 const workshopState=(job:DisplayJob)=>{
   switch(job.rawStage){
     case'waiting_diagnosis':return{label:'Eingetroffen',detail:'Wartet auf Diagnose-Zuordnung',tone:'waiting'};
     case'diagnosing':return{label:'Diagnose läuft',detail:job.assignee?'Bei '+job.assignee:'In Arbeit',tone:'active'};
     case'awaiting_quote':return{label:'Nächster Schritt',detail:'Kostenvoranschlag oder externe Vereinbarung festlegen',tone:'office'};
     case'awaiting_customer_decision':return{label:'Entscheidung offen',detail:'Kunde entscheidet über das weitere Vorgehen',tone:'office'};
     case'awaiting_customer_approval':return{label:'Freigabe offen',detail:'Wartet auf Kundenentscheidung',tone:'office'};
     case'ready_for_repair':return{label:'Reparatur bereit',detail:'Wartet auf Reparatur-Zuordnung',tone:'waiting'};
     case'repairing':return{label:'Reparatur läuft',detail:job.assignee?'Bei '+job.assignee:'In Arbeit',tone:'active'};
     case'repair_complete':return{label:'Arbeit fertig',detail:'Rechnung / Abholung vorbereiten',tone:'done'};
     case'ready_for_pickup':return{label:'Abholbereit',detail:'Fahrzeug wartet auf Abholung',tone:'done'};
     default:return{label:'In der Werkstatt',detail:'Vorgang öffnen',tone:'office'};
   }
 };

 const assign=async()=>{
   if(!selected||!memberId||busy||!canAssign(selected))return;
   setBusy(true);setActionError(null);
   try{
     await assignWorkToMember(selected.id,workType(selected),memberId);
     await live.reload();
   }catch(err){setActionError(err instanceof Error?err.message:'Auftrag konnte nicht zugeordnet werden.')}
   finally{setBusy(false)}
 };

 const runOwnedAction=async()=>{
   if(!selected||busy||!owned(selected))return;
   setActionError(null);
   if(selected.rawStage==='diagnosing'){setDiagnosis(true);return}
   if(selected.rawStage==='repairing'){
     setBusy(true);
     try{await completeRepair(selected.id);await live.reload()}
     catch(err){setActionError(err instanceof Error?err.message:'Reparatur konnte nicht abgeschlossen werden.')}
     finally{setBusy(false)}
   }
 };

 const roleLabel=(role?:string)=>{
   if(role==='owner')return'Inhaber';
   if(role==='office')return'Büro';
   if(role==='mechanic')return'Mechaniker';
   return'Mitarbeiter';
 };

 const arrivedLabel=selected?.arrivedAt
   ?new Date(selected.arrivedAt).toLocaleString('de-DE',{dateStyle:'medium',timeStyle:'short'})
   :'—';

 const openWorkshopNotification=(notification:AppNotification)=>{
   const targetType=notification.targetType;
   const orderId=(targetType==='work_order'?notification.targetId:null)??notification.workOrderId;
   if((targetType==='chat_thread'||notification.kind==='chat')&&orderId&&queue.some(job=>job.id===orderId)){
     setSelectedId(orderId);
     setNotificationChatThreadId(targetType==='chat_thread'?notification.targetId??null:null);
     setChat(true);
     return;
   }
   if((targetType==='work_order'||notification.kind==='order')&&orderId&&queue.some(job=>job.id===orderId)){
     setSelectedId(orderId);
     return;
   }
   const targetSection:ShellSection=targetType==='customer_request'||notification.kind==='customer_request'
     ?'Kunden'
     :targetType==='document'||notification.kind==='document'
       ?'Dokumente'
       :targetType==='service_request'||targetType==='appointment'||notification.kind==='request'||notification.kind==='appointment'
         ?'Termine'
         :'Übersicht';
   sessionStorage.setItem('motoratlas_pending_notification',JSON.stringify(notification));
   sessionStorage.setItem('motoratlas_office_section',targetSection);
   setView('office');
 };

 return <Shell
   onHome={()=>setView('home')}
   onSettings={live.identity?.role==='owner'?()=>setView('branding'):undefined}
   onNavigate={next=>{if(next==='Werkstatt')return;sessionStorage.setItem('motoratlas_office_section',next);setView('office')}}
   notifications={live.notifications}
   onNotificationOpen={openWorkshopNotification}
   onNotificationsChanged={live.reload}
   logoUrl={live.identity?.logoPath?getWorkshopLogoPublicUrl(live.identity.logoPath):undefined}
   title={title}
   mode="Werkstatt"
   active="Werkstatt"
 ><div className="page workshop-page">
   <PageHead title="Werkstattboard" subtitle="Fahrzeug öffnen, Angaben prüfen, Mitarbeiter zuordnen und Arbeit starten.">
     <span className="realtime"><i/> {live.isLive?'Live mit Büro und Kunde':'Demo-Modus'}</span>
   </PageHead>
   {(live.error||actionError)&&<div className="workspace-alert">{live.error??actionError}</div>}

   <div className="workshop-grid workshop-flow-grid">
     <section className="panel queue workshop-queue">
       <div className="panel-title"><div><span className="overline">FAHRZEUGE IN DER WERKSTATT</span><h3>{queue.length} offene Arbeiten</h3></div><b>{queue.length}</b></div>
       {queue.length===0&&<div className="queue-empty"><b>Aktuell nichts offen.</b><span>Nach dem Check-in erscheint das Fahrzeug hier automatisch.</span></div>}
       {queue.map((job,index)=>{
         const state=workshopState(job);
         return <button key={job.id} className={selected?.id===job.id?'workshop-queue-card selected':'workshop-queue-card'} onClick={()=>setSelectedId(job.id)}>
           <span className={'queue-index '+(workType(job)==='repair'?'repair':'')}>{job.rawStage==='ready_for_repair'||job.rawStage==='repairing'?'R':index+1}</span>
           <span className="queue-copy">
             <b>{job.vehicle}</b>
             <small>{job.plate} · Auftrag #{job.orderNumber??job.id.slice(-6)}</small>
             <p>{state.detail}</p>
           </span>
           <span className={'queue-state '+state.tone}>{state.label}</span>
         </button>;
       })}
     </section>

     <section className="panel work-card work-order-detail">
       {selected?<>
         <div className="work-detail-head">
           <div className="work-detail-photo">{selected.photoPath?<VehiclePhoto path={selected.photoPath} alt={selected.vehicle}/>:<CarArt large tone={toneFor(selected.id)}/>}</div>
           <div>
             <span className="overline">AUFTRAG #{selected.orderNumber??selected.id.slice(-6)}</span>
             <h2>{selected.vehicle}</h2>
             <div className="work-detail-tags"><span className="plate">{selected.plate}</span><span>Eingetroffen: {arrivedLabel}</span></div>
           </div>
         </div>

         <div className="work-detail-grid">
           <section>
             <small>KUNDE</small>
             <b>{selected.customerName??'Kunde'}</b>
             <span>{selected.customerPhone||'Keine Telefonnummer hinterlegt'}</span>
             {selected.customerEmail&&<span>{selected.customerEmail}</span>}
             <span>{[selected.customerStreet,selected.customerPostalCode,selected.customerCity].filter(Boolean).join(', ')||'Keine Anschrift hinterlegt'}</span>
           </section>
           <section>
             <small>FAHRZEUGDATEN</small>
             <b>{selected.plate}</b>
             <span>EZ: {selected.firstRegistration?new Date(selected.firstRegistration).toLocaleDateString('de-DE'):'—'}</span>
             <span>km: {selected.mileage!=null?selected.mileage.toLocaleString('de-DE'):'—'}</span>
             <span>HSN/TSN: {[selected.hsn,selected.tsn].filter(Boolean).join(' / ')||'—'}</span>
             <span>VIN: {selected.vin||'—'}</span>
           </section>
         </div>

         <div className="work-order-route">
           <small>AUFTRAGSWEG</small>
           <b>{requestIntentLabel(selected.workflowPath as ServiceRequestIntent|undefined)}</b>
           <span>{selected.commercialState==='direct_order'?'Direkt durch den Kunden beauftragt – kein automatischer Kostenvoranschlag erforderlich.':selected.commercialState==='external_approved'?'Freigabe außerhalb von MotorAtlas dokumentiert'+(selected.agreementMethod?' · '+selected.agreementMethod:'')+'.':selected.commercialState==='external_waiting'?'Externe Abstimmung vorhanden, Kundenentscheidung noch offen.':selected.commercialState==='no_repair'?'Keine Reparatur in diesem Auftrag.':selected.commercialState==='deferred'?'Reparatur auf später verschoben.':'Der weitere Ablauf folgt der Kundenauswahl.'}</span>
           {selected.agreementNote&&<p>{selected.agreementNote}</p>}
         </div>

         <div className="work-incident">
           <div><small>KUNDENANGABE / SCHADEN / ANLIEGEN</small><p>{selected.complaint||'Keine Beschreibung hinterlegt.'}</p></div>
           {selected.customerNotes&&<div><small>ZUSÄTZLICHE ANGABE</small><p>{selected.customerNotes}</p></div>}
           <div className="incident-flags">
             <span>{selected.driveable===false?'Nicht fahrbereit':selected.driveable===true?'Fahrbereit':'Fahrbereitschaft nicht angegeben'}</span>
             <span>{selected.warningLevel==='red'?'Rote Warnleuchte':selected.warningLevel==='yellow'?'Gelbe Warnleuchte':selected.warningLevel==='none'?'Keine Warnleuchte':'Warnleuchte nicht angegeben'}</span>
           </div>
         </div>

         {canAssign(selected)?<div className="work-assignment-box">
           <div><span className="overline">NÄCHSTER SCHRITT</span><h3>{assignmentLabel(selected)} zuordnen und starten</h3><p>Mit der Zuordnung beginnt die Arbeit offiziell. Der Kunde sieht Mitarbeiter und Startzeit sofort in seinem Status.</p></div>
           <label><span>Zuständiger Mitarbeiter</span><select value={memberId} onChange={event=>setMemberId(event.target.value)}>
             {live.members.filter(member=>workType(selected)==='diagnosis'?member.canDiagnosis:member.canRepair).map(member=><option key={member.userId} value={member.userId}>{member.displayName} · {roleLabel(member.role)}{member.userId===live.identity?.userId?' · Ich':''}</option>)}
           </select></label>
           <button className="btn primary xl full" disabled={busy||!memberId} onClick={()=>void assign()}>{busy?'Wird zugeordnet …':memberId===live.identity?.userId?(workType(selected)==='diagnosis'?'Auftrag annehmen & Diagnose starten':'Reparatur übernehmen & starten'):(workType(selected)==='diagnosis'?'Zuordnen & Diagnose starten':'Zuordnen & Reparatur starten')}</button>
         </div>:selected.rawStage==='diagnosing'||selected.rawStage==='repairing'?<div className="work-assignment-active">
           <UserRound/>
           <div><small>{assignmentLabel(selected).toUpperCase()} IN ARBEIT</small><b>{selected.assignee??'Werkstattteam'}</b><span>{selected.assignmentClaimedAt?new Date(selected.assignmentClaimedAt).toLocaleString('de-DE',{dateStyle:'medium',timeStyle:'short'}):'Startzeit wird synchronisiert'}</span></div>
           {owned(selected)?<button className="btn primary" disabled={busy} onClick={()=>void runOwnedAction()}>{selected.rawStage==='diagnosing'?'Diagnose eintragen':busy?'Bitte warten …':'Reparatur abschließen'}</button>:<span className="assigned-other">Zugeordnet</span>}
         </div>:<div className="work-stage-handoff">
           <div><span className="overline">AKTUELLER STATUS</span><h3>{workshopState(selected).label}</h3><p>{workshopState(selected).detail}. Das Fahrzeug bleibt in der Übersicht „In der Werkstatt“, bis es abgeholt und der Auftrag geschlossen wurde.</p></div>
           <button className="btn secondary" onClick={()=>{sessionStorage.setItem('motoratlas_office_section','Übersicht');setView('office')}}>Zum Büro-Vorgang</button>
         </div>}

         <div className="work-detail-actions">
           <button className="btn secondary" onClick={()=>{setNotificationChatThreadId(null);setChat(true)}} disabled={live.identity?.chatEnabled===false}><MessageCircle size={17}/> Fahrzeugchat</button>
         </div>
       </>:<div className="work-empty"><Car size={34}/><b>Kein Fahrzeug ausgewählt.</b><span>Klicke links auf ein eingetroffenes Fahrzeug, um alle Daten und den Auftrag zu öffnen.</span></div>}
     </section>
   </div>
 </div>
 {selected&&<VehicleChat open={chat} onClose={()=>{setChat(false);setNotificationChatThreadId(null)}} audience="workshop" chatThreadId={notificationChatThreadId} workOrderId={live.isLive?selected.id:null} vehicleLabel={selected.vehicle} plate={selected.plate} orderNumber={selected.orderNumber??selected.id.slice(-6)} chatEnabled={live.identity?.chatEnabled}/>}
 {selected&&<DiagnosisModal open={diagnosis} onClose={()=>setDiagnosis(false)} onDone={live.reload} workOrderId={selected.id} vehicle={selected.vehicle}/>}
 </Shell>;
}

function VehicleCard({name,plate,detail,active,tone,stage='approval',demo=false,photoPath}:{name:string;plate:string;detail:string;active?:boolean;tone:number;stage?:Stage;demo?:boolean;photoPath?:string|null}){return <article className="panel vehicle-card">{demo||!photoPath?<CarArt large tone={tone}/>:<VehiclePhoto path={photoPath} alt={name}/>} <div className="vehicle-title"><div><h3>{name}</h3><small>{detail}</small></div><span className="plate">{plate}</span></div>{active?<div className="vehicle-current"><Status stage={stage}/><b>Aktiver Werkstattauftrag</b><small>Status wird automatisch synchronisiert.</small></div>:demo?<div className="vehicle-current neutral"><span>LETZTER SERVICE</span><b>Inspektion</b><small>17.06.2026</small></div>:<div className="vehicle-current neutral"><span>STATUS</span><b>Kein aktiver Auftrag</b><small>Fahrzeug ist in deiner Garage gespeichert.</small></div>}</article>}

export function CustomerPortal({setView}:{setView:(v:AppView)=>void}){
 const live=useCustomerWorkspace();
 const [section,setSection]=useState<ShellSection>('Übersicht');
 const [chatTarget,setChatTarget]=useState<'order'|'workshop'|null>(null);
 const [notificationChatThreadId,setNotificationChatThreadId]=useState<string|null>(null);
 const [notificationOrderId,setNotificationOrderId]=useState<string|null>(null);
 const [notificationScrollId,setNotificationScrollId]=useState<string|null>(null);
 const [vehicleModal,setVehicleModal]=useState(false);
 const [requestModal,setRequestModal]=useState(false);
 const [directory,setDirectory]=useState(false);
 const [profileModal,setProfileModal]=useState(false);
 const [cancelTarget,setCancelTarget]=useState<(typeof live.appointments)[number]|null>(null);
 const [now,setNow]=useState(()=>new Date());
 const [actionError,setActionError]=useState<string|null>(null);
 const [busy,setBusy]=useState(false);

 const activeOrder=live.isLive
   ?(notificationOrderId?live.orders.find(order=>order.id===notificationOrderId):null)
     ??live.orders.find(order=>order.rawStage!=='closed'&&order.rawStage!=='cancelled')
     ??null
   :null;
 const activeRequest=live.isLive&&!activeOrder?live.requests.find(request=>['submitted','accepted','appointment_pending'].includes(request.status)):null;
 const activeOrderAppointment=activeOrder?.serviceRequestId
   ?live.appointments.find(item=>item.serviceRequestId===activeOrder.serviceRequestId&&item.status==='confirmed')
   :null;
 const proposedAppointment=activeRequest
   ?live.appointments.find(item=>item.serviceRequestId===activeRequest.id&&item.status==='proposed')
   :null;
 const primaryWorkshop=live.workshops.find(item=>item.isPrimary)??live.workshops[0]??null;
 const activeWorkshop=activeOrder
   ?live.workshops.find(item=>item.workshopId===activeOrder.workshopId)??primaryWorkshop
   :activeRequest
     ?live.workshops.find(item=>item.workshopId===activeRequest.workshopId)??primaryWorkshop
     :primaryWorkshop;
 const activeVehicleId=activeOrder?.vehicleId??activeRequest?.vehicleId??undefined;
 const activeVehicle=(activeVehicleId?live.vehicles.find(vehicle=>vehicle.id===activeVehicleId):null)??live.vehicles[0]??null;

 const customerNav:ShellNavItem[]=[
   ['Übersicht',Home,'Status'],
   ['Termine',CalendarDays,'Termine'],
   ['Fahrzeuge',Car,'Garage'],
   ['Dokumente',FileText,'Dokumente'],
   ['Stammwerkstatt',Building2,'Werkstatt']
 ];

 useEffect(()=>{
   const timer=window.setInterval(()=>setNow(new Date()),30_000);
   return()=>window.clearInterval(timer);
 },[]);

 useEffect(()=>{
   if(!notificationScrollId)return;
   const timer=window.setTimeout(()=>{
     const node=document.getElementById(notificationScrollId);
     if(!node)return;
     node.scrollIntoView({behavior:'smooth',block:'center'});
     node.classList.add('notification-target');
     window.setTimeout(()=>node.classList.remove('notification-target'),1800);
     setNotificationScrollId(null);
   },100);
   return()=>window.clearTimeout(timer);
 },[notificationScrollId,section,live.appointments.length,live.requests.length,live.documents.length]);

 const activeDocuments=activeOrder?live.documents.filter(document=>document.work_order_id===activeOrder.id):[];
 const quote=activeDocuments.find(document=>document.document_type==='quote'&&document.status==='published');
 const invoice=activeDocuments.find(document=>document.document_type==='invoice'&&document.status==='published');

 const openDocument=async(document:any)=>{
   const version=document?.versions?.[0];if(!version)return;
   try{const url=await getDocumentVersionUrl(version.storage_path);window.open(url,'_blank','noopener,noreferrer')}
   catch(err){setActionError(err instanceof Error?err.message:'Dokument konnte nicht geöffnet werden.')}
 };

 const answerQuote=async(decision:'approved'|'declined'|'question_requested'|'deferred')=>{
   if(!activeOrder||!quote||busy)return;
   setBusy(true);setActionError(null);
   try{
     await recordApproval({workOrderId:activeOrder.id,quoteDocumentId:quote.id,decision,method:'portal'});
     await live.reload();
   }catch(err){setActionError(err instanceof Error?err.message:'Entscheidung konnte nicht gespeichert werden.')}
   finally{setBusy(false)}
 };

 const decideAfterDiagnosis=async(decision:'quote'|'no_repair'|'deferred')=>{
   if(!activeOrder||busy)return;
   setBusy(true);setActionError(null);
   try{await customerResolveAfterDiagnosis(activeOrder.id,decision);await live.reload()}
   catch(err){setActionError(err instanceof Error?err.message:'Entscheidung konnte nicht gespeichert werden.')}
   finally{setBusy(false)}
 };

 const answerAppointment=async(appointmentId:string,decision:'confirmed'|'declined')=>{
   if(busy)return;
   setBusy(true);setActionError(null);
   try{await respondAppointment(appointmentId,decision);await live.reload()}
   catch(err){setActionError(err instanceof Error?err.message:'Terminantwort konnte nicht gespeichert werden.')}
   finally{setBusy(false)}
 };

 const requestStatusText=(request:(typeof live.requests)[number])=>{
   if(request.status==='submitted')return'Deine Werkstatt prüft die Anfrage.';
   if(request.status==='accepted')return'Die Werkstatt bereitet die Terminabstimmung vor.';
   if(request.status==='appointment_pending')return'Ein Terminvorschlag wird abgestimmt.';
   if(request.status==='appointment_confirmed')return'Der Termin ist bestätigt.';
   if(request.status==='declined')return request.declineReason||'Die Werkstatt kann diese Anfrage derzeit nicht annehmen.';
   if(request.status==='cancelled')return'Der Termin bzw. die Anfrage wurde storniert.';
   if(request.status==='converted')return'Die Anfrage wurde in einen Werkstattauftrag übernommen.';
   return'Anfrage wird bearbeitet.';
 };

 const sectionTitle=section==='Übersicht'?'Status'
   :section==='Termine'?'Anfragen & Termine'
   :section==='Fahrzeuge'?'Meine Garage'
   :section==='Dokumente'?'Dokumente'
   :'Stammwerkstatt';
 const sectionSubtitle=section==='Übersicht'?'Was jetzt als Nächstes wichtig ist.'
   :section==='Termine'?'Alle Anfragen, Vorschläge und bestätigten Werkstatttermine.'
   :section==='Fahrzeuge'?'Deine Fahrzeuge – übersichtlich mit den wichtigsten Daten.'
   :section==='Dokumente'?'Angebote, Rechnungen und weitere Werkstattdokumente.'
   :'Dein direkter Draht zur Werkstatt.';

 const phoneHref=(phone?:string|null)=>phone?'tel:'+phone.replace(/[^+\d]/g,''):undefined;
 const mailHref=(email?:string|null)=>email?'mailto:'+email:undefined;
 const websiteHref=(website?:string|null)=>website?(website.startsWith('http://')||website.startsWith('https://')?website:'https://'+website):undefined;

 const relationshipNotice=live.relationshipRequests.find(request=>request.status==='pending'||request.status==='rejected')??null;

 const renderStatus=()=>{
   if(activeOrder){
     const workshop=activeWorkshop;
     const vehicle=live.vehicles.find(item=>item.id===activeOrder.vehicleId)??activeVehicle;
     const appointment=activeOrderAppointment;
     const isAppointment=activeOrder.rawStage==='appointment_confirmed'&&appointment;
     const overdue=isAppointment&&new Date(appointment.startsAt).getTime()<now.getTime()-60_000;
     const diagnosisRequired=!['direct_work','quote_before_work'].includes(activeOrder.workflowPath??'diagnosis_then_quote');
     const noRepairFlow=['no_repair','deferred','diagnosis_only'].includes(activeOrder.commercialState??'');
     return <div className="customer-status-stack">
       <section className={'panel customer-focus '+(overdue?'overdue':'')}>
         <div className="customer-focus-media">{vehicle?<VehiclePhoto path={vehicle.photoPath} alt={[vehicle.make,vehicle.model].filter(Boolean).join(' ')}/>:<CarArt large tone={0}/>}</div>
         <div className="customer-focus-copy">
           <div className="customer-focus-kicker">
             <span>{isAppointment?'BEVORSTEHENDER TERMIN':`AUFTRAG #${activeOrder.orderNumber}`}</span>
             {isAppointment?<b className={overdue?'late':''}>{overdue?'VERSPÄTET':'BESTÄTIGT'}</b>:<Status stage={activeOrder.stage}/>}
           </div>
           <h2>{isAppointment&&appointment?appointmentCountdownText(appointment.startsAt,now):customerOrderTitle(activeOrder.rawStage,activeOrder.commercialState)}</h2>
           {isAppointment&&appointment?<>
             <p className="customer-focus-date">{relativeDayLabel(new Date(appointment.startsAt),now)} · {new Date(appointment.startsAt).toLocaleString('de-DE',{weekday:'long',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})} Uhr</p>
             <p>{workshop?.name??'Werkstatt'} erwartet dein Fahrzeug. Erst der Check-in vor Ort setzt den Status auf „eingetroffen“.</p>
           </>:<p>{customerOrderDetail(activeOrder.rawStage,activeOrder.commercialState,activeOrder.invoiceRequired)}</p>}
           <div className="customer-focus-vehicle">
             <Car/><span><b>{vehicle?[vehicle.make,vehicle.model,vehicle.variant].filter(Boolean).join(' '):'Fahrzeug'}</b><small>{vehicle?.licensePlate??'—'}{activeOrder.orderNumber?` · Auftrag #${activeOrder.orderNumber}`:''}</small></span>
           </div>
           <div className="customer-focus-actions">
             {workshop?.phone&&<a className="btn secondary" href={phoneHref(workshop.phone)}><Phone size={16}/> Werkstatt anrufen</a>}
             {workshop?.chatEnabled!==false&&<button className="btn secondary" onClick={()=>{setNotificationChatThreadId(null);setChatTarget('order')}}><MessageCircle size={16}/> Chat</button>}
             {isAppointment&&<button className="btn primary" onClick={()=>setSection('Termine')}><CalendarDays size={16}/> Termin ansehen</button>}
           </div>
         </div>
       </section>

       {!isAppointment&&activeOrder.progress&&<section className="panel customer-work-progress">
         <header><div><span className="overline">LIVE-AUFTRAGSVERLAUF</span><h3>Was passiert mit deinem Fahrzeug?</h3></div><span>Auftrag #{activeOrder.orderNumber}</span></header>
         <div className="customer-progress-steps">
           <div className={activeOrder.progress.arrivedAt?'done':'pending'}>
             <i/><div><b>Fahrzeug eingetroffen</b><span>{activeOrder.progress.arrivedAt?new Date(activeOrder.progress.arrivedAt).toLocaleString('de-DE',{dateStyle:'medium',timeStyle:'short'}):'Noch nicht eingetroffen'}</span></div>
           </div>
           {diagnosisRequired&&<>
             <div className={activeOrder.progress.diagnosisStartedAt?'done':activeOrder.rawStage==='waiting_diagnosis'?'current':'pending'}>
               <i/><div><b>Diagnose gestartet</b><span>{activeOrder.progress.diagnosisStartedAt?<>{new Date(activeOrder.progress.diagnosisStartedAt).toLocaleString('de-DE',{dateStyle:'medium',timeStyle:'short'})}{activeOrder.progress.diagnosisStaffName?' · '+activeOrder.progress.diagnosisStaffName:''}</>:'Wartet auf Zuordnung'}</span></div>
             </div>
             <div className={activeOrder.progress.diagnosisCompletedAt?'done':['diagnosing'].includes(activeOrder.rawStage)?'current':'pending'}>
               <i/><div><b>Diagnose abgeschlossen</b><span>{activeOrder.progress.diagnosisCompletedAt?<>{new Date(activeOrder.progress.diagnosisCompletedAt).toLocaleString('de-DE',{dateStyle:'medium',timeStyle:'short'})}{activeOrder.progress.diagnosisStaffName?' · durch '+activeOrder.progress.diagnosisStaffName:''}</>:'Noch offen'}</span></div>
             </div>
           </>}
           {!noRepairFlow&&<>
             <div className={activeOrder.progress.repairStartedAt?'done':activeOrder.rawStage==='ready_for_repair'?'current':'pending'}>
               <i/><div><b>{activeOrder.workflowPath==='direct_work'?'Arbeit gestartet':'Reparatur gestartet'}</b><span>{activeOrder.progress.repairStartedAt?<>{new Date(activeOrder.progress.repairStartedAt).toLocaleString('de-DE',{dateStyle:'medium',timeStyle:'short'})}{activeOrder.progress.repairStaffName?' · '+activeOrder.progress.repairStaffName:''}</>:'Noch nicht gestartet'}</span></div>
             </div>
             <div className={activeOrder.progress.repairCompletedAt?'done':activeOrder.rawStage==='repairing'?'current':'pending'}>
               <i/><div><b>{activeOrder.workflowPath==='direct_work'?'Arbeit abgeschlossen':'Reparatur abgeschlossen'}</b><span>{activeOrder.progress.repairCompletedAt?<>{new Date(activeOrder.progress.repairCompletedAt).toLocaleString('de-DE',{dateStyle:'medium',timeStyle:'short'})}{activeOrder.progress.repairStaffName?' · durch '+activeOrder.progress.repairStaffName:''}</>:'Noch offen'}</span></div>
             </div>
           </>}
           {noRepairFlow&&<div className="done skipped">
             <i/><div><b>{activeOrder.commercialState==='deferred'?'Reparatur verschoben':activeOrder.commercialState==='diagnosis_only'?'Nur Diagnose beauftragt':'Keine Reparatur'}</b><span>{activeOrder.commercialState==='deferred'?'Für später vorgemerkt – nicht Teil dieses Auftrags.':activeOrder.commercialState==='diagnosis_only'?'Die Diagnose war der vereinbarte Leistungsumfang.':'Der Auftrag wird ohne Reparatur beendet.'}</span></div>
           </div>}
           <div className={activeOrder.progress.readyForPickupAt?'done':activeOrder.rawStage==='repair_complete'?'current':'pending'}>
             <i/><div><b>Abholbereit</b><span>{activeOrder.progress.readyForPickupAt?new Date(activeOrder.progress.readyForPickupAt).toLocaleString('de-DE',{dateStyle:'medium',timeStyle:'short'}):'Noch nicht freigegeben'}</span></div>
           </div>
         </div>
       </section>}

       {isAppointment&&appointment&&<section className="panel customer-action-strip">
         {customerCancellationOpen(appointment.startsAt,now)?<>
           <div><CalendarDays/><span><b>Terminänderung?</b><small>Online-Stornierung ist bis 12 Stunden vor dem Termin möglich.</small></span></div>
           <button className="btn secondary cancel-appointment" onClick={()=>setCancelTarget(appointment)}>Termin stornieren</button>
         </>:<>
           <div><Phone/><span><b>Kurzfristige Änderung</b><small>Weniger als 12 Stunden: Bitte telefonisch mit {workshop?.name??'der Werkstatt'} klären.</small></span></div>
           {workshop?.phone&&<a className="btn secondary" href={phoneHref(workshop.phone)}>Jetzt anrufen</a>}
         </>}
       </section>}

       {activeOrder.rawStage==='awaiting_customer_decision'&&<section className="panel customer-decision-card">
         <div className="customer-decision-copy"><ShieldCheck/><span><small>DIAGNOSE ABGESCHLOSSEN</small><b>Wie soll es weitergehen?</b><p>Du musst jetzt keine Reparatur beauftragen. Wähle nur den nächsten Schritt für diesen Auftrag.</p></span></div>
         <div className="customer-decision-actions">
           <button className="btn primary" disabled={busy} onClick={()=>void decideAfterDiagnosis('quote')}><FileText size={15}/> Kostenvoranschlag anfordern</button>
           <button className="btn secondary" disabled={busy} onClick={()=>void decideAfterDiagnosis('no_repair')}>Keine Reparatur</button>
           <button className="btn secondary" disabled={busy} onClick={()=>void decideAfterDiagnosis('deferred')}>Später reparieren</button>
         </div>
       </section>}

       {quote&&activeOrder.rawStage==='awaiting_customer_approval'&&<section className="panel customer-priority-card">
         <div><FileText/><span><small>DEINE ENTSCHEIDUNG</small><b>Kostenvoranschlag liegt vor</b><p>{quote.amount_total!=null?Number(quote.amount_total).toLocaleString('de-DE',{style:'currency',currency:quote.currency||'EUR'}):'Betrag im Dokument'}</p></span></div>
         <div><button className="btn secondary" onClick={()=>void openDocument(quote)}>Angebot öffnen</button>{activeWorkshop?.chatEnabled!==false&&<button className="btn secondary" disabled={busy} onClick={()=>void answerQuote('question_requested')}>Rückfrage</button>}<button className="btn secondary" disabled={busy} onClick={()=>void answerQuote('declined')}>Keine Reparatur</button><button className="btn secondary" disabled={busy} onClick={()=>void answerQuote('deferred')}>Später</button><button className="btn primary" disabled={busy} onClick={()=>void answerQuote('approved')}>{busy?'Speichert …':'Reparatur freigeben'}</button></div>
       </section>}

       {invoice&&<section className="panel customer-priority-card invoice">
         <div><FileText/><span><small>RECHNUNG</small><b>{invoice.document_number||'Rechnung verfügbar'}</b><p>{invoice.amount_total!=null?Number(invoice.amount_total).toLocaleString('de-DE',{style:'currency',currency:invoice.currency||'EUR'}):'Dokument liegt bereit'}</p></span></div>
         <button className="btn primary" onClick={()=>void openDocument(invoice)}>Rechnung öffnen</button>
       </section>}
     </div>;
   }

   if(activeRequest){
     const vehicle=live.vehicles.find(item=>item.id===activeRequest.vehicleId);
     const workshop=live.workshops.find(item=>item.workshopId===activeRequest.workshopId)??primaryWorkshop;
     return <section className={'panel customer-focus request '+(activeRequest.status==='declined'?'declined':'')}>
       <div className="customer-focus-media">{vehicle?<VehiclePhoto path={vehicle.photoPath} alt={[vehicle.make,vehicle.model].filter(Boolean).join(' ')}/>:<CarArt large tone={1}/>}</div>
       <div className="customer-focus-copy">
         <div className="customer-focus-kicker"><span>WERKSTATTANFRAGE</span><b>{requestStatusLabel(activeRequest.status)}</b></div>
         <h2>{activeRequest.status==='declined'?'Die Werkstatt hat deine Anfrage abgelehnt.':'Deine Anfrage läuft.'}</h2>
         <p>{requestStatusText(activeRequest)}</p>
         <span className="customer-request-intent">{requestIntentLabel(activeRequest.requestIntent)}</span>
         <div className="customer-focus-vehicle"><Car/><span><b>{vehicle?[vehicle.make,vehicle.model,vehicle.variant].filter(Boolean).join(' '):'Fahrzeug'}</b><small>{vehicle?.licensePlate??'—'} · {workshop?.name??'Werkstatt'}</small></span></div>
         <div className="customer-focus-actions"><button className="btn primary" onClick={()=>setSection('Termine')}><CalendarDays size={16}/> Anfrage ansehen</button>{workshop?.phone&&<a className="btn secondary" href={phoneHref(workshop.phone)}><Phone size={16}/> Werkstatt anrufen</a>}</div>
       </div>
     </section>;
   }

   return <section className="panel customer-empty-status">
     <ShieldCheck/><div><span className="overline">ALLES IM BLICK</span><h2>Aktuell ist kein Werkstattvorgang offen.</h2><p>Wenn du etwas prüfen oder erledigen lassen möchtest, kannst du direkt eine Anfrage für eines deiner Fahrzeuge starten.</p><button className="btn primary" onClick={()=>setRequestModal(true)}><Plus size={16}/> Anfrage starten</button></div>
   </section>;
 };

 const renderAppointments=()=>{
   const sortedAppointments=[...live.appointments].sort((a,b)=>{
     const aCancelled=a.status==='cancelled'?1:0,bCancelled=b.status==='cancelled'?1:0;
     if(aCancelled!==bCancelled)return aCancelled-bCancelled;
     return new Date(a.startsAt).getTime()-new Date(b.startsAt).getTime();
   });
   const requestIdsWithAppointment=new Set(sortedAppointments.map(item=>item.serviceRequestId));

   return <div className="customer-appointments-view">
     {sortedAppointments.map(appointment=>{
       const request=live.requests.find(item=>item.id===appointment.serviceRequestId);
       const relatedOrder=live.orders.find(item=>item.serviceRequestId===appointment.serviceRequestId);
       const arrivedAt=relatedOrder?.progress?.arrivedAt??null;
       const arrived=Boolean(arrivedAt);
       const vehicle=request?live.vehicles.find(item=>item.id===request.vehicleId):relatedOrder?live.vehicles.find(item=>item.id===relatedOrder.vehicleId):null;
       const workshop=live.workshops.find(item=>item.workshopId===appointment.workshopId)??primaryWorkshop;
       const start=new Date(appointment.startsAt);
       const confirmed=appointment.status==='confirmed'&&!arrived;
       const proposed=appointment.status==='proposed'&&!arrived;
       const cancelled=appointment.status==='cancelled';
       const displayState=arrived?'arrived':appointment.status;
       return <article id={'customer-appointment-'+appointment.id} className={'panel customer-appointment-card '+displayState} key={appointment.id}>
         <div className="customer-appointment-date">
           <span>{relativeDayLabel(start,now)}</span><b>{start.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'})}</b><small>{start.toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})} Uhr</small>
         </div>
         <div className="customer-appointment-main">
           <div className="customer-appointment-title"><div><small>{arrived?'FAHRZEUG EINGETROFFEN':proposed?'TERMINVORSCHLAG':cancelled?'STORNIERT':'BESTÄTIGTER TERMIN'}</small><h3>{request?.complaint&&request.complaint!=='Keine Fehlerbeschreibung angegeben.'?request.complaint:'Werkstatttermin'}</h3>{request&&<em className="request-intent-inline">{requestIntentLabel(request.requestIntent)}</em>}</div><span>{arrived?'Eingetroffen':proposed?'Antwort nötig':cancelled?'Storniert':'Bestätigt'}</span></div>
           <p>{arrived
             ?<>Dein Fahrzeug <b>{vehicle?[vehicle.make,vehicle.model,vehicle.variant].filter(Boolean).join(' '):'Fahrzeug'} · {vehicle?.licensePlate??'—'}</b> wurde am <b>{new Date(arrivedAt!).toLocaleString('de-DE',{dateStyle:'medium',timeStyle:'short'})}</b> von der Werkstatt als eingetroffen erfasst. Der Termin ist damit abgeschlossen; der weitere Fortschritt läuft über den Auftrag.</>
             :confirmed
               ?<>Dein Termin ist am <b>{start.toLocaleDateString('de-DE',{weekday:'long',day:'2-digit',month:'long',year:'numeric'})}</b> um <b>{start.toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})} Uhr</b> mit deinem KFZ <b>{vehicle?[vehicle.make,vehicle.model,vehicle.variant].filter(Boolean).join(' '):'Fahrzeug'} · {vehicle?.licensePlate??'—'}</b>.</>
               :proposed
                 ?<>Die Werkstatt schlägt dir <b>{start.toLocaleDateString('de-DE',{weekday:'long',day:'2-digit',month:'long'})}</b> um <b>{start.toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})} Uhr</b> für <b>{vehicle?[vehicle.make,vehicle.model].filter(Boolean).join(' '):'dein Fahrzeug'}</b> vor.</>
                 :<>Dieser Termin wurde storniert.{appointment.cancellationReason?' Grund: '+appointment.cancellationReason:''}</>}</p>
           <div className="customer-appointment-meta"><span><Car/> {vehicle?.licensePlate??'—'}</span><span><Building2/> {workshop?.name??'Werkstatt'}</span></div>
           {confirmed&&<strong className={start.getTime()<now.getTime()-60_000?'late':''}>{appointmentCountdownText(appointment.startsAt,now)}</strong>}
           {arrived&&<strong className="arrived">Check-in abgeschlossen · kein Terminüberzug mehr</strong>}
         </div>
         <div className="customer-appointment-actions">
           {proposed&&<><button className="btn secondary" disabled={busy} onClick={()=>void answerAppointment(appointment.id,'declined')}>Passt nicht</button><button className="btn primary" disabled={busy} onClick={()=>void answerAppointment(appointment.id,'confirmed')}>{busy?'Speichert …':'Termin bestätigen'}</button></>}
           {confirmed&&customerCancellationOpen(appointment.startsAt,now)&&<button className="btn secondary cancel-appointment" onClick={()=>setCancelTarget(appointment)}>Stornieren</button>}
           {confirmed&&!customerCancellationOpen(appointment.startsAt,now)&&workshop?.phone&&<a className="btn secondary" href={phoneHref(workshop.phone)}><Phone size={15}/> Anrufen</a>}
         </div>
       </article>;
     })}

     {live.requests.filter(request=>!requestIdsWithAppointment.has(request.id)).map(request=>{
       const vehicle=live.vehicles.find(item=>item.id===request.vehicleId);
       const workshop=live.workshops.find(item=>item.workshopId===request.workshopId)??primaryWorkshop;
       return <article id={'customer-request-'+request.id} className={'panel customer-request-clean '+request.status} key={request.id}>
         <div className="customer-request-icon"><Car/></div>
         <div><small>{requestStatusLabel(request.status).toUpperCase()}</small><h3>{vehicle?[vehicle.make,vehicle.model,vehicle.variant].filter(Boolean).join(' '):'Fahrzeug'} · {vehicle?.licensePlate??'—'}</h3><p>{request.complaint==='Keine Fehlerbeschreibung angegeben.'?'Keine zusätzliche Beschreibung angegeben.':request.complaint}</p><span>{requestStatusText(request)} · {requestIntentLabel(request.requestIntent)} · {workshop?.name??'Werkstatt'}</span></div>
       </article>;
     })}

     {relationshipNotice&&<article id={'customer-relationship-'+relationshipNotice.id} className={'panel customer-request-clean relationship '+relationshipNotice.status}><div className="customer-request-icon"><Building2/></div><div><small>{relationshipNotice.status==='pending'?'WERKSTATTANFRAGE OFFEN':'WERKSTATTANFRAGE ABGELEHNT'}</small><h3>{relationshipNotice.workshopName}</h3><p>{relationshipNotice.status==='pending'?'Die Werkstatt prüft deine Aufnahme als Kunde.':'Die Werkstatt hat die Kundenaufnahme abgelehnt.'}</p></div></article>}

     {!sortedAppointments.length&&!live.requests.length&&!relationshipNotice&&<section className="panel customer-simple-empty"><CalendarDays/><h3>Noch keine Anfragen oder Termine.</h3><p>Starte eine Anfrage für eines deiner Fahrzeuge.</p></section>}
   </div>;
 };

 const renderGarage=()=>live.vehicles.length?<div className="customer-garage-deck">{live.vehicles.map(vehicle=><article className="panel customer-garage-card" key={vehicle.id}>
   <div className="garage-card-image"><VehiclePhoto path={vehicle.photoPath} alt={[vehicle.make,vehicle.model].filter(Boolean).join(' ')}/><span className="plate">{vehicle.licensePlate}</span></div>
   <div className="garage-card-head"><small>MEIN FAHRZEUG</small><h3>{[vehicle.make,vehicle.model].filter(Boolean).join(' ')}</h3>{vehicle.variant&&<p>{vehicle.variant}</p>}</div>
   <div className="garage-specs">
     <span><small>ERSTZULASSUNG</small><b>{vehicle.firstRegistration?new Date(vehicle.firstRegistration).toLocaleDateString('de-DE',{month:'2-digit',year:'numeric'}):'—'}</b></span>
     <span><small>KILOMETER</small><b>{vehicle.mileage!=null?vehicle.mileage.toLocaleString('de-DE')+' km':'—'}</b></span>
     <span><small>HSN</small><b>{vehicle.hsn||'—'}</b></span>
     <span><small>TSN</small><b>{vehicle.tsn||'—'}</b></span>
     <span className="wide"><small>FIN / VIN</small><b>{vehicle.vin||'Nicht hinterlegt'}</b></span>
   </div>
 </article>)}</div>:<section className="panel customer-simple-empty"><Car/><h3>Noch kein Fahrzeug in deiner Garage.</h3><p>Lege deinen ersten PKW an.</p><button className="btn primary" onClick={()=>setVehicleModal(true)}>Fahrzeug hinzufügen</button></section>;

 const renderDocuments=()=>live.documents.length?<div className="customer-document-list">{live.documents.map(document=>{
   const order=live.orders.find(item=>item.id===document.work_order_id);
   const vehicle=order?live.vehicles.find(item=>item.id===order.vehicleId):null;
   return <article id={'customer-document-'+document.id} className={'panel customer-document-row '+document.document_type} key={document.id}>
     <div className="customer-document-type"><FileText/><span><small>{documentTypeLabel(document.document_type).toUpperCase()}</small><b>{document.document_number||document.title||documentTypeLabel(document.document_type)}</b></span></div>
     <div className="customer-document-context"><span>{vehicle?[vehicle.make,vehicle.model].filter(Boolean).join(' ')+' · '+vehicle.licensePlate:'Werkstattdokument'}</span><small>{new Date(document.published_at||document.created_at).toLocaleDateString('de-DE')}</small></div>
     <strong>{document.amount_total!=null?Number(document.amount_total).toLocaleString('de-DE',{style:'currency',currency:document.currency||'EUR'}):''}</strong>
     <button className="btn secondary" onClick={()=>void openDocument(document)}>Öffnen</button>
   </article>;
 })}</div>:<section className="panel customer-simple-empty"><FileText/><h3>Noch keine Dokumente vorhanden.</h3><p>Angebote, Rechnungen, Gutschriften und weitere Werkstattdokumente erscheinen automatisch hier.</p></section>;

 const renderWorkshop=()=>{
   const workshop=primaryWorkshop;
   if(!workshop)return <section className="panel customer-simple-empty"><Building2/><h3>Noch keine Stammwerkstatt.</h3><p>Wähle eine Werkstatt aus der MotorAtlas-Karte und sende eine Kundenanfrage.</p><button className="btn primary" onClick={()=>setDirectory(true)}>Werkstatt finden</button></section>;
   const logo=workshop.logoPath?getWorkshopLogoPublicUrl(workshop.logoPath):null;
   const stats=live.responseStats[workshop.workshopId];
   const responseText=stats&&stats.sampleCount>=3&&stats.medianResponseMinutes!=null
     ?stats.medianResponseMinutes<60
       ?`Antwortet in der Regel in ca. ${Math.max(1,Math.round(stats.medianResponseMinutes))} Min.`
       :stats.medianResponseMinutes<1440
         ?`Antwortet in der Regel in ca. ${Math.round(stats.medianResponseMinutes/60*10)/10} Std.`
         :`Antwortet in der Regel in ca. ${Math.round(stats.medianResponseMinutes/1440*10)/10} Tagen.`
     :'Noch nicht genug Chat-Antworten für eine belastbare Analyse.';
   return <div className="customer-workshop-view">
     <section className="panel customer-workshop-hero">
       <div className="customer-workshop-logo">{logo?<img src={logo} alt={workshop.name}/>:<Building2/>}</div>
       <div><span className="overline">DEINE STAMMWERKSTATT</span><h2>{workshop.name}</h2><p>{workshop.description||'Direkt mit deiner Werkstatt verbunden.'}</p><div className="customer-workshop-address"><MapPin/>{workshop.street}, {workshop.postalCode} {workshop.city}</div></div>
     </section>
     {!workshop.chatEnabled&&<div className="workshop-chat-disabled"><MessageCircle/><div><b>MotorAtlas-Chat nicht angeboten</b><span>Diese Werkstatt hat den Chat deaktiviert. Nutze bitte Telefon oder E-Mail.</span></div></div>}
     <section className="customer-workshop-contact-grid">
       <article className="panel"><Phone/><small>TELEFON</small><b>{workshop.phone||'Nicht hinterlegt'}</b>{workshop.phone&&<a className="btn primary" href={phoneHref(workshop.phone)}>Anrufen</a>}</article>
       <article className="panel"><Mail/><small>E-MAIL</small><b>{workshop.email||'Nicht hinterlegt'}</b>{workshop.email&&<a className="btn secondary" href={mailHref(workshop.email)}>E-Mail schreiben</a>}</article>
       <article className="panel"><MessageCircle/><small>CHAT</small><b>{workshop.chatEnabled?'Direkt in MotorAtlas':'Von der Werkstatt deaktiviert'}</b>{workshop.chatEnabled?<button className="btn secondary" disabled={!live.vehicles.length} onClick={()=>{setNotificationChatThreadId(null);setChatTarget('workshop')}}>Chat öffnen</button>:<span className="contact-muted">Telefon oder E-Mail verwenden</span>}</article>
       <article className="panel"><Clock3/><small>ANTWORTZEIT</small><b>{responseText}</b><span className="contact-muted">{stats?.sampleCount??0} ausgewertete Antwort{(stats?.sampleCount??0)===1?'':'en'}</span></article>
       <article className="panel"><Building2/><small>WEBSITE</small><b>{workshop.website||'Nicht hinterlegt'}</b>{workshop.website&&<a className="btn secondary" href={websiteHref(workshop.website)} target="_blank" rel="noreferrer">Website öffnen</a>}</article>
     </section>
   </div>;
 };

 const headerActions=section==='Termine'
   ?<button className="btn primary" onClick={()=>setRequestModal(true)}><Plus size={16}/> Neue Anfrage</button>
   :section==='Fahrzeuge'
     ?<div className="head-actions"><button className="btn secondary" onClick={()=>setProfileModal(true)}><UserRound size={16}/> Meine Daten</button><button className="btn primary" onClick={()=>setVehicleModal(true)}><Plus size={16}/> Fahrzeug hinzufügen</button></div>
     :section==='Stammwerkstatt'
       ?<button className="btn secondary" onClick={()=>setDirectory(true)}><MapPin size={16}/> Andere Werkstatt finden</button>
       :undefined;

 return <Shell
   onHome={()=>setView('home')}
   onNavigate={next=>{setNotificationOrderId(null);setNotificationScrollId(null);setSection(next);window.scrollTo({top:0,behavior:'auto'})}}
   navItems={customerNav}
   notifications={live.notifications}
   onNotificationOpen={notification=>{
     const targetType=notification.targetType;
     if(targetType==='chat_thread'||notification.kind==='chat'){
       setNotificationOrderId(notification.workOrderId??null);
       setNotificationChatThreadId(targetType==='chat_thread'?notification.targetId??null:null);
       setSection('Übersicht');
       setChatTarget(notification.workOrderId?'order':'workshop');
       return;
     }
     setNotificationChatThreadId(null);
     if(targetType==='work_order'||notification.kind==='order'){
       setNotificationOrderId((targetType==='work_order'?notification.targetId:null)??notification.workOrderId??null);
       setSection('Übersicht');
       return;
     }
     setNotificationOrderId(null);
     if(targetType==='appointment'||notification.kind==='appointment'){
       setSection('Termine');
       if(notification.targetId)setNotificationScrollId('customer-appointment-'+notification.targetId);
       return;
     }
     if(targetType==='service_request'||notification.kind==='request'){
       setSection('Termine');
       if(notification.targetId)setNotificationScrollId('customer-request-'+notification.targetId);
       return;
     }
     if(targetType==='document'||notification.kind==='document'){
       setSection('Dokumente');
       if(notification.targetId)setNotificationScrollId('customer-document-'+notification.targetId);
       return;
     }
     if(targetType==='customer_request'||notification.kind==='customer_request'){
       setSection('Stammwerkstatt');
       if(notification.targetId)setNotificationScrollId('customer-relationship-'+notification.targetId);
       return;
     }
     setSection('Übersicht');
   }}
   onNotificationsChanged={live.reload}
   title="Mein MotorAtlas"
   mode="Kundenportal"
   active={section}
 ><div className="page customer-app-page">
   <PageHead title={sectionTitle} subtitle={sectionSubtitle}>{headerActions}</PageHead>
   {(live.error||actionError)&&<div className="workspace-alert">{live.error??actionError}</div>}

   {live.isLive?<>
     {section==='Übersicht'&&<>
       {relationshipNotice&&<div className={'relationship-notice '+relationshipNotice.status}><div><ShieldCheck/><span><small>{relationshipNotice.status==='rejected'?'WERKSTATTANFRAGE ABGELEHNT':'WERKSTATTANFRAGE LÄUFT'}</small><b>{relationshipNotice.workshopName}</b><p>{relationshipNotice.status==='rejected'?'Die Werkstatt hat deine Kundenaufnahme abgelehnt.':'Die Werkstatt prüft deine Aufnahme als Kunde.'}</p></span></div></div>}
       {renderStatus()}
     </>}
     {section==='Termine'&&renderAppointments()}
     {section==='Fahrzeuge'&&renderGarage()}
     {section==='Dokumente'&&renderDocuments()}
     {section==='Stammwerkstatt'&&renderWorkshop()}
   </>:<section className="panel customer-empty-status"><Car/><div><span className="overline">PRODUKTDEMO</span><h2>Dein MotorAtlas-Kundenportal</h2><p>Nach der Anmeldung erscheinen hier echte Termine, Fahrzeuge, Dokumente und deine Stammwerkstatt.</p></div></section>}
 </div>
 <CustomerProfileModal open={profileModal} onClose={()=>setProfileModal(false)} onSaved={live.reload}/>
 <VehicleCreateModal open={vehicleModal} onClose={()=>setVehicleModal(false)} onDone={live.reload}/>
 <WorkshopDirectoryModal open={directory} onClose={()=>setDirectory(false)} onChanged={live.reload} relationships={live.workshops}/>
 <ServiceRequestModal open={requestModal} onClose={()=>setRequestModal(false)} onDone={live.reload} vehicles={live.vehicles} workshops={live.workshops}/>
 <VehicleChat
   open={chatTarget!==null}
   onClose={()=>{setChatTarget(null);setNotificationChatThreadId(null)}}
   audience="customer"
   chatThreadId={notificationChatThreadId}
   workOrderId={chatTarget==='order'?activeOrder?.id:null}
   workshopId={chatTarget==='workshop'?primaryWorkshop?.workshopId:null}
   vehicleId={chatTarget==='workshop'?(activeVehicle?.id??live.vehicles[0]?.id):null}
   vehicleLabel={activeVehicle?[activeVehicle.make,activeVehicle.model,activeVehicle.variant].filter(Boolean).join(' '):'Fahrzeug'}
   plate={activeVehicle?.licensePlate??'—'}
   orderNumber={activeOrder?.orderNumber??''}
   chatEnabled={(chatTarget==='order'?activeWorkshop:primaryWorkshop)?.chatEnabled}
 />
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
 const [description,setDescription]=useState(''); const [accepts,setAccepts]=useState(true); const [chatEnabled,setChatEnabled]=useState(true); const [verified,setVerified]=useState(false);
 const [services,setServices]=useState<string[]>([]);
 const [verificationStatus,setVerificationStatus]=useState<string>('not_requested');
 const [verificationMode,setVerificationMode]=useState<string>('standard');
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
     setAccepts(Boolean(profile.accepts_new_customers));setChatEnabled(profile.chat_enabled!==false);setVerified(Boolean(profile.verified_at));
     setServices(Array.isArray(profile.services)?profile.services.filter((item:unknown):item is string=>typeof item==='string'):[]);
     setVerificationStatus(profile.verification_status??(profile.verified_at?'verified':'not_requested'));
     setVerificationMode(profile.verification_mode??'standard');
     setVerificationReviewNote(profile.verification_review_note??null);
     if(profile.logo_path)setUrl(getWorkshopLogoPublicUrl(profile.logo_path));
     const storedPalette=paletteFromStoredColors({
       primary:profile.brand_primary,dark:profile.brand_secondary,soft:profile.brand_soft,rgb:profile.brand_rgb
     });
     if(storedPalette){setPalette(storedPalette);applyPalette(storedPalette)}
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
     workshopId:resolvedWorkshopId,name,legalName,street,postalCode,city,phone,email,website,chatEnabled,description,
     operatingMode:mode,acceptsNewCustomers:accepts,services
   });
   if(logoFile&&palette)await uploadWorkshopLogo({workshopId:resolvedWorkshopId,file:logoFile,primary:palette.primary,secondary:palette.dark,soft:palette.soft,rgb:palette.rgb});
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

 return <Shell onHome={()=>setView('home')} onSettings={()=>setView('branding')} onNavigate={next=>{if(next==='Werkstatt'){setView('workshop');return}sessionStorage.setItem('motoratlas_office_section',next);setView('office')}} logoUrl={url??(live.identity?.logoPath?getWorkshopLogoPublicUrl(live.identity.logoPath):undefined)} title={title} mode="Werkstattprofil" active=""><div className="page"><PageHead title={live.identity?'Werkstattprofil':'Werkstatt einrichten'} subtitle="Deine Marke bleibt erkennbar – MotorAtlas sorgt für die professionelle, ruhige Darstellung."><div className="head-actions">
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
  <section className="panel profile-form"><span className="overline">STAMMDATEN</span><h3>Die Werkstatt hinter dem Profil.</h3><div className="form-two"><label><span>Werkstattname</span><input value={name} onChange={e=>setName(e.target.value)} placeholder="z. B. Carplus Service Center"/></label><label><span>Rechtlicher Firmenname</span><input value={legalName} onChange={e=>setLegalName(e.target.value)} placeholder="optional"/></label></div><label><span>Straße & Hausnummer</span><input value={street} onChange={e=>setStreet(e.target.value)} placeholder="Musterstraße 12"/></label><div className="address-grid"><label><span>PLZ</span><input value={postalCode} onChange={e=>setPostalCode(e.target.value)} inputMode="numeric" placeholder="92421"/></label><label><span>Ort</span><input value={city} onChange={e=>setCity(e.target.value)} placeholder="Schwandorf"/></label></div><div className="form-two"><label><span>Telefon</span><input type="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+49 …"/></label><label><span>E-Mail</span><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="service@werkstatt.de"/></label></div><label><span>Website</span><input value={website} onChange={e=>setWebsite(e.target.value)} placeholder="https://www.meine-werkstatt.de"/></label><label><span>Beschreibung</span><textarea rows={4} value={description} onChange={e=>setDescription(e.target.value)} placeholder="Leistungen, Spezialisierung und das, was deine Werkstatt besonders macht."/></label><label className="toggle-row"><input type="checkbox" checked={accepts} onChange={e=>setAccepts(e.target.checked)}/><span><b>Neue Kunden annehmen</b><small>Kann jederzeit deaktiviert werden, wenn die Werkstatt ausgelastet ist.</small></span></label><label className="toggle-row"><input type="checkbox" checked={chatEnabled} onChange={e=>setChatEnabled(e.target.checked)}/><span><b>MotorAtlas-Chat anbieten</b><small>Wenn deaktiviert, bleiben vorhandene Verläufe lesbar. Kunden sehen stattdessen Telefon und E-Mail als Kontaktweg.</small></span></label></section>
  <div className="branding-stack"><section className="panel"><span className="overline">ADAPTIVES BRANDING</span><h3>Logo rein. Premium-Farbsystem raus.</h3><p>MotorAtlas analysiert die dominante Markenfarbe und erzeugt daraus kontraststarke, dezente UI-Akzente.</p><label className="logo-upload"><Sparkles/><b>{url?'Logo ändern':'Werkstattlogo hochladen'}</b><span>PNG, JPG oder WebP</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>void logo(e.target.files?.[0])}/></label><div className="swatches"><i/><i/><i/></div></section>
  <section className="panel preview"><span className="overline">MARKENVORSCHAU</span><div className="profile-preview"><div className="preview-logo">{url?<img src={url} alt="Werkstattlogo"/>:<span>{title.slice(0,2).toUpperCase()}</span>}</div><div><b>{title}</b><small className={verified?'verified-copy':'pending-copy'}><ShieldCheck size={14}/> {verified?'Verifizierte Werkstatt':'Verifizierung ausstehend'}</small></div></div></section></div>
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
   verificationMode={verificationMode}
   reviewNote={verificationReviewNote}
   onBeforeSubmit={saveBeforeVerification}
 />}
 <section className="panel org-mode"><span className="overline">ORGANISATION</span><h3>Die Oberfläche passt sich an deinen Betrieb an.</h3><div><button className={mode==='solo'?'selected':''} onClick={()=>setMode('solo')}><Building2/><b>Einzelbetrieb</b><span>Eine Person sieht Büro und Werkstatt in einem flüssigen Ablauf.</span></button><button className={mode==='team'?'selected':''} onClick={()=>setMode('team')}><Users/><b>Team-Betrieb</b><span>Büro, Mechaniker und individuelle Berechtigungen arbeiten synchron.</span></button></div></section>
 {live.identity?.role==='owner'&&mode==='team'&&<TeamManager workshopId={live.identity.workshopId} currentUserId={live.identity.userId}/>}
 </div></Shell>;
}
