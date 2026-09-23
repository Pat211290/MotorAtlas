import { useCallback, useEffect, useState } from 'react';
import {
  getCurrentWorkshopIdentity,getSignedInUserId,getWorkshopDashboardMetrics,getWorkshopResponseStats,listMyCustomerDocuments,listMyNotifications,listMyWorkshopNotifications,listPendingCustomerRequests,listWorkshopAppointments,listWorkshopChatInbox,listWorkshopJobs,listAssignableWorkshopMembers,listWorkshopServiceRequests,loadCustomerWorkspace,
  subscribeCustomerOrders,subscribeWorkshop,
  type AppNotification,type CustomerAppointment,type CustomerOrder,type CustomerRelationshipRequest,type CustomerServiceRequest,type CustomerVehicle,type CustomerWorkshop,
  type LiveJob,type WorkshopAppointment,type WorkshopChatInboxItem,type WorkshopDashboardMetrics,type WorkshopIdentity,type WorkshopMemberOption,type WorkshopResponseStats,type WorkshopServiceRequest
} from './api';
import { applyPalette, backendConfigured, paletteFromStoredColors } from './lib';

export function useWorkshopWorkspace(){
  const [identity,setIdentity]=useState<WorkshopIdentity|null>(null);
  const [jobs,setJobs]=useState<LiveJob[]>([]);
  const [serviceRequests,setServiceRequests]=useState<WorkshopServiceRequest[]>([]);
  const [customerRequests,setCustomerRequests]=useState<any[]>([]);
  const [appointments,setAppointments]=useState<WorkshopAppointment[]>([]);
  const [notifications,setNotifications]=useState<AppNotification[]>([]);
  const [chatInbox,setChatInbox]=useState<WorkshopChatInboxItem[]>([]);
  const [members,setMembers]=useState<WorkshopMemberOption[]>([]);
  const [metrics,setMetrics]=useState<WorkshopDashboardMetrics>({activeCustomerCount:0,primaryCustomerCount:0});
  const [responseStats,setResponseStats]=useState<WorkshopResponseStats>({medianResponseMinutes:null,averageResponseMinutes:null,sampleCount:0});
  const [loading,setLoading]=useState(backendConfigured);
  const [error,setError]=useState<string|null>(null);

  const reload=useCallback(async()=>{
    if(!backendConfigured){setLoading(false);return;}
    try{
      const current=await getCurrentWorkshopIdentity();
      setIdentity(current);
      if(current){
        const palette=paletteFromStoredColors({
          primary:current.brandPrimary,dark:current.brandSecondary,soft:current.brandSoft,rgb:current.brandRgb
        });
        if(palette)applyPalette(palette);
      }
      if(!current){
        setJobs([]);setServiceRequests([]);setCustomerRequests([]);setAppointments([]);setNotifications([]);setChatInbox([]);setMembers([]);
        setMetrics({activeCustomerCount:0,primaryCustomerCount:0});
        setResponseStats({medianResponseMinutes:null,averageResponseMinutes:null,sampleCount:0});
        setLoading(false);return;
      }
      const [nextJobs,nextServiceRequests,nextCustomerRequests,nextAppointments,nextNotifications,nextChatInbox,nextMembers,nextMetrics,nextResponseStats]=await Promise.all([
        listWorkshopJobs(current.workshopId),
        listWorkshopServiceRequests(current.workshopId),
        listPendingCustomerRequests(current.workshopId),
        listWorkshopAppointments(current.workshopId),
        listMyWorkshopNotifications(current.workshopId),
        listWorkshopChatInbox(current.workshopId).catch(()=>[]),
        listAssignableWorkshopMembers(current.workshopId).catch(()=>[]),
        getWorkshopDashboardMetrics(current.workshopId),
        getWorkshopResponseStats(current.workshopId)
      ]);
      setJobs(nextJobs);setServiceRequests(nextServiceRequests);setCustomerRequests(nextCustomerRequests);
      setAppointments(nextAppointments);setNotifications(nextNotifications);setChatInbox(nextChatInbox);setMembers(nextMembers);
      setMetrics(nextMetrics);setResponseStats(nextResponseStats);
      setError(null);
    }catch(err){
      setError(err instanceof Error?err.message:'Werkstattdaten konnten nicht geladen werden.');
    }finally{setLoading(false)}
  },[]);

  useEffect(()=>{void reload()},[reload]);
  useEffect(()=>{
    if(!identity)return;
    return subscribeWorkshop(identity.workshopId,()=>{void reload()});
  },[identity?.workshopId,reload]);
  useEffect(()=>{
    const refreshWhenActive=()=>{
      if(document.visibilityState==='visible')void reload();
    };
    window.addEventListener('focus',refreshWhenActive);
    window.addEventListener('online',refreshWhenActive);
    document.addEventListener('visibilitychange',refreshWhenActive);
    return()=>{
      window.removeEventListener('focus',refreshWhenActive);
      window.removeEventListener('online',refreshWhenActive);
      document.removeEventListener('visibilitychange',refreshWhenActive);
    };
  },[reload]);

  return{identity,jobs,serviceRequests,customerRequests,appointments,notifications,chatInbox,members,metrics,responseStats,loading,error,reload,isLive:Boolean(identity)};
}

export function useCustomerWorkspace(){
  const [userId,setUserId]=useState<string|null>(null);
  const [vehicles,setVehicles]=useState<CustomerVehicle[]>([]);
  const [orders,setOrders]=useState<CustomerOrder[]>([]);
  const [workshops,setWorkshops]=useState<CustomerWorkshop[]>([]);
  const [requests,setRequests]=useState<CustomerServiceRequest[]>([]);
  const [appointments,setAppointments]=useState<CustomerAppointment[]>([]);
  const [relationshipRequests,setRelationshipRequests]=useState<CustomerRelationshipRequest[]>([]);
  const [documents,setDocuments]=useState<Awaited<ReturnType<typeof listMyCustomerDocuments>>>([]);
  const [notifications,setNotifications]=useState<AppNotification[]>([]);
  const [responseStats,setResponseStats]=useState<Record<string,WorkshopResponseStats>>({});
  const [loading,setLoading]=useState(backendConfigured);
  const [error,setError]=useState<string|null>(null);

  const clear=()=>{setVehicles([]);setOrders([]);setWorkshops([]);setRequests([]);setAppointments([]);setRelationshipRequests([]);setDocuments([]);setNotifications([]);setResponseStats({})};

  const reload=useCallback(async()=>{
    if(!backendConfigured){setLoading(false);return;}
    try{
      const id=await getSignedInUserId();
      setUserId(id);
      if(!id){clear();setLoading(false);return;}
      const data=await loadCustomerWorkspace();
      const [nextDocuments,nextNotifications,statsPairs]=await Promise.all([
        listMyCustomerDocuments(),
        listMyNotifications(),
        Promise.all(data.workshops.map(async workshop=>[
          workshop.workshopId,
          await getWorkshopResponseStats(workshop.workshopId).catch(()=>({medianResponseMinutes:null,averageResponseMinutes:null,sampleCount:0}))
        ] as const))
      ]);
      setVehicles(data.vehicles);setOrders(data.orders);setWorkshops(data.workshops);
      setRequests(data.requests);setAppointments(data.appointments);setRelationshipRequests(data.relationshipRequests);
      setDocuments(nextDocuments);setNotifications(nextNotifications);setResponseStats(Object.fromEntries(statsPairs));setError(null);
    }catch(err){
      setError(err instanceof Error?err.message:'Kundendaten konnten nicht geladen werden.');
    }finally{setLoading(false)}
  },[]);

  useEffect(()=>{void reload()},[reload]);
  useEffect(()=>{
    if(!userId)return;
    return subscribeCustomerOrders(userId,()=>{void reload()});
  },[userId,reload]);
  useEffect(()=>{
    const refreshWhenActive=()=>{
      if(document.visibilityState==='visible')void reload();
    };
    window.addEventListener('focus',refreshWhenActive);
    window.addEventListener('online',refreshWhenActive);
    document.addEventListener('visibilitychange',refreshWhenActive);
    return()=>{
      window.removeEventListener('focus',refreshWhenActive);
      window.removeEventListener('online',refreshWhenActive);
      document.removeEventListener('visibilitychange',refreshWhenActive);
    };
  },[reload]);

  return{userId,vehicles,orders,workshops,requests,appointments,relationshipRequests,documents,notifications,responseStats,loading,error,reload,isLive:Boolean(userId)};
}
