import { useCallback, useEffect, useState } from 'react';
import {
  getCurrentWorkshopIdentity,getSignedInUserId,listPendingCustomerRequests,listWorkshopJobs,listWorkshopServiceRequests,loadCustomerWorkspace,
  subscribeCustomerOrders,subscribeWorkshop,
  type CustomerAppointment,type CustomerOrder,type CustomerServiceRequest,type CustomerVehicle,type CustomerWorkshop,
  type LiveJob,type WorkshopIdentity,type WorkshopServiceRequest
} from './api';
import { backendConfigured } from './lib';

export function useWorkshopWorkspace(){
  const [identity,setIdentity]=useState<WorkshopIdentity|null>(null);
  const [jobs,setJobs]=useState<LiveJob[]>([]);
  const [serviceRequests,setServiceRequests]=useState<WorkshopServiceRequest[]>([]);
  const [customerRequests,setCustomerRequests]=useState<any[]>([]);
  const [loading,setLoading]=useState(backendConfigured);
  const [error,setError]=useState<string|null>(null);

  const reload=useCallback(async()=>{
    if(!backendConfigured){setLoading(false);return;}
    try{
      const current=await getCurrentWorkshopIdentity();
      setIdentity(current);
      if(!current){
        setJobs([]);setServiceRequests([]);setCustomerRequests([]);setLoading(false);return;
      }
      const [nextJobs,nextServiceRequests,nextCustomerRequests]=await Promise.all([
        listWorkshopJobs(current.workshopId),
        listWorkshopServiceRequests(current.workshopId),
        listPendingCustomerRequests(current.workshopId)
      ]);
      setJobs(nextJobs);setServiceRequests(nextServiceRequests);setCustomerRequests(nextCustomerRequests);
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

  return{identity,jobs,serviceRequests,customerRequests,loading,error,reload,isLive:Boolean(identity)};
}

export function useCustomerWorkspace(){
  const [userId,setUserId]=useState<string|null>(null);
  const [vehicles,setVehicles]=useState<CustomerVehicle[]>([]);
  const [orders,setOrders]=useState<CustomerOrder[]>([]);
  const [workshops,setWorkshops]=useState<CustomerWorkshop[]>([]);
  const [requests,setRequests]=useState<CustomerServiceRequest[]>([]);
  const [appointments,setAppointments]=useState<CustomerAppointment[]>([]);
  const [loading,setLoading]=useState(backendConfigured);
  const [error,setError]=useState<string|null>(null);

  const clear=()=>{setVehicles([]);setOrders([]);setWorkshops([]);setRequests([]);setAppointments([])};

  const reload=useCallback(async()=>{
    if(!backendConfigured){setLoading(false);return;}
    try{
      const id=await getSignedInUserId();
      setUserId(id);
      if(!id){clear();setLoading(false);return;}
      const data=await loadCustomerWorkspace();
      setVehicles(data.vehicles);setOrders(data.orders);setWorkshops(data.workshops);
      setRequests(data.requests);setAppointments(data.appointments);setError(null);
    }catch(err){
      setError(err instanceof Error?err.message:'Kundendaten konnten nicht geladen werden.');
    }finally{setLoading(false)}
  },[]);

  useEffect(()=>{void reload()},[reload]);
  useEffect(()=>{
    if(!userId)return;
    return subscribeCustomerOrders(userId,()=>{void reload()});
  },[userId,reload]);

  return{userId,vehicles,orders,workshops,requests,appointments,loading,error,reload,isLive:Boolean(userId)};
}
