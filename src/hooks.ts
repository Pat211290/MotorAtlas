import { useCallback, useEffect, useState } from 'react';
import {
  getCurrentWorkshopIdentity,getSignedInUserId,listWorkshopJobs,loadCustomerWorkspace,
  subscribeCustomerOrders,subscribeWorkshop,
  type CustomerOrder,type CustomerVehicle,type LiveJob,type WorkshopIdentity
} from './api';
import { backendConfigured } from './lib';

export function useWorkshopWorkspace(){
  const [identity,setIdentity]=useState<WorkshopIdentity|null>(null);
  const [jobs,setJobs]=useState<LiveJob[]>([]);
  const [loading,setLoading]=useState(backendConfigured);
  const [error,setError]=useState<string|null>(null);

  const reload=useCallback(async()=>{
    if(!backendConfigured){setLoading(false);return;}
    try{
      const current=await getCurrentWorkshopIdentity();
      setIdentity(current);
      if(!current){setJobs([]);setLoading(false);return;}
      setJobs(await listWorkshopJobs(current.workshopId));
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

  return{identity,jobs,loading,error,reload,isLive:Boolean(identity)};
}

export function useCustomerWorkspace(){
  const [userId,setUserId]=useState<string|null>(null);
  const [vehicles,setVehicles]=useState<CustomerVehicle[]>([]);
  const [orders,setOrders]=useState<CustomerOrder[]>([]);
  const [loading,setLoading]=useState(backendConfigured);
  const [error,setError]=useState<string|null>(null);

  const reload=useCallback(async()=>{
    if(!backendConfigured){setLoading(false);return;}
    try{
      const id=await getSignedInUserId();
      setUserId(id);
      if(!id){setVehicles([]);setOrders([]);setLoading(false);return;}
      const data=await loadCustomerWorkspace();
      setVehicles(data.vehicles);setOrders(data.orders);setError(null);
    }catch(err){
      setError(err instanceof Error?err.message:'Kundendaten konnten nicht geladen werden.');
    }finally{setLoading(false)}
  },[]);

  useEffect(()=>{void reload()},[reload]);
  useEffect(()=>{
    if(!userId)return;
    return subscribeCustomerOrders(userId,()=>{void reload()});
  },[userId,reload]);

  return{userId,vehicles,orders,loading,error,reload,isLive:Boolean(userId)};
}
