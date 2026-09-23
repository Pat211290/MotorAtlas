import { useCallback, useEffect, useState } from 'react';
import {
  getCurrentWorkshopIdentity,getSignedInUserId,listMyCustomerDocuments,listMyNotifications,listMyWorkshopNotifications,listPendingCustomerRequests,listWorkshopAppointments,listWorkshopJobs,listWorkshopServiceRequests,loadCustomerWorkspace,
  subscribeCustomerOrders,subscribeWorkshop,
  type AppNotification,type CustomerAppointment,type CustomerOrder,type CustomerRelationshipRequest,type CustomerServiceRequest,type CustomerVehicle,type CustomerWorkshop,
  type LiveJob,type WorkshopAppointment,type WorkshopIdentity,type WorkshopServiceRequest
} from './api';
import { backendConfigured } from './lib';

export function useWorkshopWorkspace(){
  const [identity,setIdentity]=useState<WorkshopIdentity|null>(null);
  const [jobs,setJobs]=useState<LiveJob[]>([]);
  const [serviceRequests,setServiceRequests]=useState<WorkshopServiceRequest[]>([]);
  const [customerRequests,setCustomerRequests]=useState<any[]>([]);
  const [appointments,setAppointments]=useState<WorkshopAppointment[]>([]);
  const [notifications,setNotifications]=useState<AppNotification[]>([]);
  const [loading,setLoading]=useState(backendConfigured);
  const [error,setError]=useState<string|null>(null);

  const reload=useCallback(async()=>{
    if(!backendConfigured){setLoading(false);return;}
    try{
      const current=await getCurrentWorkshopIdentity();
      setIdentity(current);
      if(!current){
        setJobs([]);setServiceRequests([]);setCustomerRequests([]);setAppointments([]);setNotifications([]);setLoading(false);return;
      }
      const [nextJobs,nextServiceRequests,nextCustomerRequests,nextAppointments,nextNotifications]=await Promise.all([
        listWorkshopJobs(current.workshopId),
        listWorkshopServiceRequests(current.workshopId),
        listPendingCustomerRequests(current.workshopId),
        listWorkshopAppointments(current.workshopId),
        listMyWorkshopNotifications(current.workshopId)
      ]);
      setJobs(nextJobs);setServiceRequests(nextServiceRequests);setCustomerRequests(nextCustomerRequests);
      setAppointments(nextAppointments);setNotifications(nextNotifications);
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

  return{identity,jobs,serviceRequests,customerRequests,appointments,notifications,loading,error,reload,isLive:Boolean(identity)};
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
  const [loading,setLoading]=useState(backendConfigured);
  const [error,setError]=useState<string|null>(null);

  const clear=()=>{setVehicles([]);setOrders([]);setWorkshops([]);setRequests([]);setAppointments([]);setRelationshipRequests([]);setDocuments([]);setNotifications([])};

  const reload=useCallback(async()=>{
    if(!backendConfigured){setLoading(false);return;}
    try{
      const id=await getSignedInUserId();
      setUserId(id);
      if(!id){clear();setLoading(false);return;}
      const [data,nextDocuments,nextNotifications]=await Promise.all([loadCustomerWorkspace(),listMyCustomerDocuments(),listMyNotifications()]);
      setVehicles(data.vehicles);setOrders(data.orders);setWorkshops(data.workshops);
      setRequests(data.requests);setAppointments(data.appointments);setRelationshipRequests(data.relationshipRequests);
      setDocuments(nextDocuments);setNotifications(nextNotifications);setError(null);
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

  return{userId,vehicles,orders,workshops,requests,appointments,relationshipRequests,documents,notifications,loading,error,reload,isLive:Boolean(userId)};
}
