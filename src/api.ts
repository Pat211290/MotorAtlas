import { backendConfigured, supabase } from './lib';

function db(){if(!backendConfigured||!supabase)throw new Error('MotorAtlas backend is not configured.');return supabase;}

export async function signUpCustomer(email:string,password:string,fullName:string){
  const {data,error}=await db().auth.signUp({email,password,options:{data:{full_name:fullName}}});
  if(error)throw error;return data;
}

export async function createVehicle(input:{make:string;model:string;variant?:string;firstRegistration?:string;licensePlate:string;hsn?:string;tsn?:string;vin?:string;mileage?:number;photoPath:string}){
  const client=db();const {data:auth}=await client.auth.getUser();if(!auth.user)throw new Error('Not signed in');
  const {data,error}=await client.from('vehicles').insert({
    owner_user_id:auth.user.id,make:input.make,model:input.model,variant:input.variant??null,
    first_registration:input.firstRegistration??null,license_plate:input.licensePlate,
    hsn:input.hsn??null,tsn:input.tsn??null,vin:input.vin??null,mileage:input.mileage??null,photo_path:input.photoPath
  }).select().single();if(error)throw error;return data;
}

export async function createWorkshop(input:{name:string;slug:string;street:string;postalCode:string;city:string;legalName?:string;description?:string}){
  const {data,error}=await db().rpc('create_workshop',{
    p_name:input.name,p_slug:input.slug,p_street:input.street,p_postal_code:input.postalCode,p_city:input.city,
    p_legal_name:input.legalName??null,p_description:input.description??null
  });if(error)throw error;return data;
}

export async function requestWorkshop(workshopId:string,message?:string){
  const {data,error}=await db().rpc('request_workshop_relationship',{p_workshop_id:workshopId,p_message:message?.trim()||null});
  if(error)throw error;return data;
}
export async function decideCustomerRequest(requestId:string,decision:'accepted'|'rejected'){
  const {data,error}=await db().rpc('decide_customer_request',{p_request_id:requestId,p_decision:decision});
  if(error)throw error;return data;
}
export async function setPrimaryWorkshop(workshopId:string){
  const {data,error}=await db().rpc('set_primary_workshop',{p_workshop_id:workshopId});if(error)throw error;return data;
}

export async function createServiceRequestDraft(input:{
  workshopId:string;vehicleId:string;complaint:string;customerNotes?:string;desiredStart?:string;desiredEnd?:string;
  driveable?:boolean;warningLevel?:'none'|'yellow'|'red'|'unknown';
}){
  const client=db();const {data:auth}=await client.auth.getUser();if(!auth.user)throw new Error('Not signed in');
  const {data,error}=await client.from('service_requests').insert({
    customer_user_id:auth.user.id,workshop_id:input.workshopId,vehicle_id:input.vehicleId,
    complaint:input.complaint.trim(),customer_notes:input.customerNotes?.trim()||null,
    desired_start:input.desiredStart??null,desired_end:input.desiredEnd??null,driveable:input.driveable??null,
    warning_level:input.warningLevel??null,status:'draft'
  }).select().single();if(error)throw error;return data;
}

export async function uploadRequestImage(serviceRequestId:string,file:File){
  if(!file.type.startsWith('image/'))throw new Error('An image is required.');
  const client=db();const {data:auth}=await client.auth.getUser();if(!auth.user)throw new Error('Not signed in');
  const mediaId=crypto.randomUUID(),safeName=file.name.replace(/[^a-zA-Z0-9._-]+/g,'_');
  const path=`${auth.user.id}/${serviceRequestId}/${mediaId}/${safeName}`;
  const {error:uploadError}=await client.storage.from('request-media').upload(path,file,{upsert:false,contentType:file.type});
  if(uploadError)throw uploadError;
  try{
    const {data,error}=await client.from('request_media').insert({
      id:mediaId,service_request_id:serviceRequestId,uploaded_by:auth.user.id,media_type:'image',storage_path:path,mime_type:file.type
    }).select().single();if(error)throw error;return data;
  }catch(error){await client.storage.from('request-media').remove([path]);throw error;}
}
export async function submitServiceRequest(serviceRequestId:string){
  const {data,error}=await db().rpc('submit_service_request',{p_service_request_id:serviceRequestId});if(error)throw error;return data;
}

export async function proposeAppointment(input:{serviceRequestId:string;startsAt:string;endsAt?:string;note?:string}){
  const {data,error}=await db().rpc('propose_appointment',{
    p_service_request_id:input.serviceRequestId,p_starts_at:input.startsAt,p_ends_at:input.endsAt??null,p_note:input.note?.trim()||null
  });if(error)throw error;return data;
}
export async function respondAppointment(appointmentId:string,decision:'confirmed'|'declined'){
  const {data,error}=await db().rpc('respond_appointment',{p_appointment_id:appointmentId,p_decision:decision});if(error)throw error;return data;
}
export async function declineServiceRequest(serviceRequestId:string,reason?:string){
  const {data,error}=await db().rpc('decline_service_request',{p_service_request_id:serviceRequestId,p_reason:reason?.trim()||null});
  if(error)throw error;return data;
}

export async function markVehicleArrived(workOrderId:string){
  const {data,error}=await db().rpc('mark_vehicle_arrived',{p_work_order_id:workOrderId});if(error)throw error;return data;
}
export async function claimWork(workOrderId:string,type:'diagnosis'|'repair'){
  const {data,error}=await db().rpc('claim_work',{p_work_order_id:workOrderId,p_type:type});if(error)throw error;return data;
}
export async function completeDiagnosis(workOrderId:string,summary:string,internalNote?:string){
  const {data,error}=await db().rpc('complete_diagnosis',{p_work_order_id:workOrderId,p_summary:summary,p_internal_note:internalNote??null});
  if(error)throw error;return data;
}
export async function recordApproval(input:{
  workOrderId:string;quoteDocumentId:string;decision:'approved'|'declined'|'question_requested';
  method:'portal'|'phone_recorded_by_workshop';note?:string;
}){
  const {data,error}=await db().rpc('record_customer_approval',{
    p_work_order_id:input.workOrderId,p_quote_document_id:input.quoteDocumentId,p_decision:input.decision,
    p_method:input.method,p_note:input.note??null
  });if(error)throw error;return data;
}

export async function sha256(file:File){
  const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
export async function uploadDocumentVersion(input:{
  workshopId:string;documentId:string;versionId:string;versionNumber:number;file:File;
  invoiceFormat?:'pdf'|'zugferd'|'xrechnung'|'xml'|'other';
}){
  const client=db(),safeName=input.file.name.replace(/[^a-zA-Z0-9._-]+/g,'_');
  const path=`${input.workshopId}/${input.documentId}/${input.versionId}/${safeName}`,hash=await sha256(input.file);
  const {error:uploadError}=await client.storage.from('documents').upload(path,input.file,{upsert:false,contentType:input.file.type});
  if(uploadError)throw uploadError;
  const {data:auth}=await client.auth.getUser();
  try{
    if(!auth.user)throw new Error('Not signed in');
    const {data,error}=await client.from('document_versions').insert({
      id:input.versionId,document_id:input.documentId,version_number:input.versionNumber,storage_path:path,
      file_name:input.file.name,mime_type:input.file.type||'application/octet-stream',sha256:hash,byte_size:input.file.size,
      invoice_format:input.invoiceFormat??(input.file.type==='application/pdf'?'pdf':'other'),uploaded_by:auth.user.id
    }).select().single();if(error)throw error;return data;
  }catch(err){await client.storage.from('documents').remove([path]);throw err;}
}
export async function completeRepair(workOrderId:string,note?:string){
  const {data,error}=await db().rpc('complete_repair',{p_work_order_id:workOrderId,p_note:note?.trim()||null});if(error)throw error;return data;
}
export async function markReadyForPickup(workOrderId:string){
  const {data,error}=await db().rpc('mark_ready_for_pickup',{p_work_order_id:workOrderId});if(error)throw error;return data;
}
export async function closeWorkOrder(workOrderId:string){
  const {data,error}=await db().rpc('close_work_order',{p_work_order_id:workOrderId});if(error)throw error;return data;
}
export async function publishDocument(documentId:string){
  const {data,error}=await db().rpc('publish_document',{p_document_id:documentId});if(error)throw error;return data;
}

export function subscribeWorkshop(workshopId:string,onChange:()=>void){
  const client=db();
  const channel=client.channel(`workshop:${workshopId}:orders`)
    .on('postgres_changes',{event:'*',schema:'public',table:'work_orders',filter:`workshop_id=eq.${workshopId}`},onChange)
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'work_order_events',filter:`workshop_id=eq.${workshopId}`},onChange)
    .subscribe();
  return()=>{void client.removeChannel(channel)};
}

export type ChatThread={
  id:string;workshop_id:string;customer_user_id:string;vehicle_id:string;service_request_id?:string|null;
  work_order_id?:string|null;subject?:string|null;status:'open'|'closed';last_message_at?:string|null;created_at:string;
};
export type ChatMessage={
  id:string;thread_id:string;sender_user_id:string;kind:'text'|'image'|'file'|'system';body?:string|null;
  attachment_path?:string|null;attachment_name?:string|null;attachment_mime?:string|null;attachment_size?:number|null;created_at:string;
};

export async function ensureVehicleChat(workshopId:string,vehicleId:string){
  const {data,error}=await db().rpc('ensure_vehicle_chat',{p_workshop_id:workshopId,p_vehicle_id:vehicleId});
  if(error)throw error;return data as ChatThread;
}
export async function ensureWorkOrderChat(workOrderId:string){
  const {data,error}=await db().rpc('ensure_work_order_chat',{p_work_order_id:workOrderId});if(error)throw error;return data as ChatThread;
}
export async function listChatMessages(threadId:string,limit=100){
  const {data,error}=await db().from('chat_messages').select('*').eq('thread_id',threadId).order('created_at',{ascending:true}).limit(limit);
  if(error)throw error;return(data??[])as ChatMessage[];
}
export async function sendChatMessage(threadId:string,body:string){
  const text=body.trim();if(!text)throw new Error('Message is empty');
  const client=db();const {data:auth}=await client.auth.getUser();if(!auth.user)throw new Error('Not signed in');
  const {data,error}=await client.from('chat_messages').insert({thread_id:threadId,sender_user_id:auth.user.id,kind:'text',body:text}).select().single();
  if(error)throw error;return data as ChatMessage;
}
export async function sendChatAttachment(threadId:string,file:File,body?:string){
  const client=db();const {data:auth}=await client.auth.getUser();if(!auth.user)throw new Error('Not signed in');
  const messageId=crypto.randomUUID(),safeName=file.name.replace(/[^a-zA-Z0-9._-]+/g,'_'),path=`${threadId}/${messageId}/${safeName}`;
  const {error:uploadError}=await client.storage.from('chat-media').upload(path,file,{upsert:false,contentType:file.type||'application/octet-stream'});
  if(uploadError)throw uploadError;
  try{
    const image=file.type.startsWith('image/');
    const {data,error}=await client.from('chat_messages').insert({
      id:messageId,thread_id:threadId,sender_user_id:auth.user.id,kind:image?'image':'file',body:body?.trim()||null,
      attachment_path:path,attachment_name:file.name,attachment_mime:file.type||'application/octet-stream',attachment_size:file.size
    }).select().single();if(error)throw error;return data as ChatMessage;
  }catch(err){await client.storage.from('chat-media').remove([path]);throw err;}
}
export async function markChatRead(threadId:string){
  const client=db();const {data:auth}=await client.auth.getUser();if(!auth.user)throw new Error('Not signed in');
  const {error}=await client.from('chat_read_state').upsert({
    thread_id:threadId,user_id:auth.user.id,last_read_at:new Date().toISOString()
  },{onConflict:'thread_id,user_id'});if(error)throw error;
}
export function subscribeChat(threadId:string,onMessage:(message:ChatMessage)=>void){
  const client=db();
  const channel=client.channel(`chat:${threadId}`)
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'chat_messages',filter:`thread_id=eq.${threadId}`},
      (payload:any)=>onMessage(payload.new as ChatMessage)).subscribe();
  return()=>{void client.removeChannel(channel)};
}


export type LiveStage='arrived'|'diagnosis'|'approval'|'repair'|'pickup';
export type LiveJob={
  id:string;
  orderNumber:string;
  vehicleId:string;
  customerUserId:string;
  serviceRequestId?:string|null;
  vehicle:string;
  plate:string;
  mileage?:number|null;
  complaint:string;
  stage:LiveStage;
  rawStage:string;
  priority:'normal'|'urgent'|'waiting_customer'|'immobile';
  assignee?:string|null;
  updatedAt:string;
};

export type WorkshopIdentity={
  userId:string;
  workshopId:string;
  role:string;
  displayName?:string|null;
  permissions:Record<string,unknown>;
  workshopName:string;
  brandPrimary?:string|null;
  brandSecondary?:string|null;
};

function mapOrderStage(stage:string):LiveStage{
  if(stage==='waiting_diagnosis'||stage==='appointment_confirmed')return'arrived';
  if(stage==='diagnosing'||stage==='awaiting_quote')return'diagnosis';
  if(stage==='awaiting_customer_approval')return'approval';
  if(stage==='ready_for_repair'||stage==='repairing'||stage==='repair_complete')return'repair';
  return'pickup';
}

export async function getCurrentWorkshopIdentity():Promise<WorkshopIdentity|null>{
  const client=db();
  const {data:auth}=await client.auth.getUser();
  if(!auth.user)return null;
  const {data:member,error}=await client.from('workshop_members')
    .select('workshop_id,role,display_name,permissions')
    .eq('user_id',auth.user.id).eq('active',true).limit(1).maybeSingle();
  if(error)throw error;
  if(!member)return null;
  const {data:workshop,error:workshopError}=await client.from('workshops')
    .select('id,name,brand_primary,brand_secondary')
    .eq('id',member.workshop_id).single();
  if(workshopError)throw workshopError;
  return{
    userId:auth.user.id,
    workshopId:member.workshop_id,
    role:member.role,
    displayName:member.display_name,
    permissions:(member.permissions??{}) as Record<string,unknown>,
    workshopName:workshop.name,
    brandPrimary:workshop.brand_primary,
    brandSecondary:workshop.brand_secondary
  };
}

export async function listWorkshopJobs(workshopId:string):Promise<LiveJob[]>{
  const client=db();
  const {data:orders,error}=await client.from('work_orders')
    .select('id,order_number,stage,priority,vehicle_id,service_request_id,customer_user_id,updated_at')
    .eq('workshop_id',workshopId)
    .not('stage','in','("closed","cancelled")')
    .order('updated_at',{ascending:false});
  if(error)throw error;
  const rows=(orders??[]) as any[];
  if(!rows.length)return[];

  const vehicleIds=[...new Set(rows.map(r=>r.vehicle_id).filter(Boolean))];
  const requestIds=[...new Set(rows.map(r=>r.service_request_id).filter(Boolean))];
  const orderIds=rows.map(r=>r.id);

  const vehicleResult=await client.from('vehicles').select('id,make,model,variant,license_plate,mileage').in('id',vehicleIds);
  if(vehicleResult.error)throw vehicleResult.error;
  const requestResult=requestIds.length
    ?await client.from('service_requests').select('id,complaint').in('id',requestIds)
    :{data:[],error:null} as any;
  if(requestResult.error)throw requestResult.error;
  const assignmentResult=await client.from('work_order_assignments')
    .select('work_order_id,member_user_id,status').in('work_order_id',orderIds).eq('status','active');
  if(assignmentResult.error)throw assignmentResult.error;

  const assigneeIds=[...new Set(((assignmentResult.data??[]) as any[]).map(a=>a.member_user_id).filter(Boolean))];
  const memberResult=assigneeIds.length
    ?await client.from('workshop_members').select('user_id,display_name').eq('workshop_id',workshopId).in('user_id',assigneeIds)
    :{data:[],error:null} as any;
  if(memberResult.error)throw memberResult.error;

  const vehicleMap=new Map(((vehicleResult.data??[]) as any[]).map(v=>[v.id,v]));
  const requestMap=new Map(((requestResult.data??[]) as any[]).map(r=>[r.id,r]));
  const memberMap=new Map(((memberResult.data??[]) as any[]).map(m=>[m.user_id,m.display_name]));
  const assignmentMap=new Map(((assignmentResult.data??[]) as any[]).map(a=>[a.work_order_id,memberMap.get(a.member_user_id)??null]));

  return rows.map(row=>{
    const vehicle=vehicleMap.get(row.vehicle_id) as any;
    const request=requestMap.get(row.service_request_id) as any;
    return{
      id:row.id,
      orderNumber:row.order_number,
      vehicleId:row.vehicle_id,
      customerUserId:row.customer_user_id,
      serviceRequestId:row.service_request_id,
      vehicle:vehicle?[vehicle.make,vehicle.model,vehicle.variant].filter(Boolean).join(' '):'Fahrzeug',
      plate:vehicle?.license_plate??'—',
      mileage:vehicle?.mileage??null,
      complaint:request?.complaint??'Kein Beanstandungstext hinterlegt.',
      stage:mapOrderStage(row.stage),
      rawStage:row.stage,
      priority:row.priority,
      assignee:assignmentMap.get(row.id)??null,
      updatedAt:row.updated_at
    } satisfies LiveJob;
  });
}

export type CustomerVehicle={
  id:string;make:string;model:string;variant?:string|null;licensePlate:string;mileage?:number|null;
  firstRegistration?:string|null;photoPath:string;
};
export type CustomerOrder={
  id:string;orderNumber:string;vehicleId:string;stage:LiveStage;rawStage:string;updatedAt:string;workshopId:string;
};

export async function loadCustomerWorkspace():Promise<{vehicles:CustomerVehicle[];orders:CustomerOrder[]}>{
  const client=db();
  const {data:auth}=await client.auth.getUser();
  if(!auth.user)throw new Error('Not signed in');
  const vehicleResult=await client.from('vehicles').select('id,make,model,variant,license_plate,mileage,first_registration,photo_path')
      .eq('owner_user_id',auth.user.id).is('archived_at',null).order('created_at',{ascending:true});
  if(vehicleResult.error)throw vehicleResult.error;
  const orderResult=await client.from('work_orders').select('id,order_number,vehicle_id,stage,updated_at,workshop_id')
      .eq('customer_user_id',auth.user.id).neq('stage','cancelled').order('updated_at',{ascending:false});
  if(orderResult.error)throw orderResult.error;
  return{
    vehicles:((vehicleResult.data??[]) as any[]).map(v=>({
      id:v.id,make:v.make,model:v.model,variant:v.variant,licensePlate:v.license_plate,mileage:v.mileage,
      firstRegistration:v.first_registration,photoPath:v.photo_path
    })),
    orders:((orderResult.data??[]) as any[]).map(o=>({
      id:o.id,orderNumber:o.order_number,vehicleId:o.vehicle_id,stage:mapOrderStage(o.stage),rawStage:o.stage,
      updatedAt:o.updated_at,workshopId:o.workshop_id
    }))
  };
}

export function subscribeCustomerOrders(userId:string,onChange:()=>void){
  const client=db();
  const channel=client.channel('customer:'+userId+':orders')
    .on('postgres_changes',{event:'*',schema:'public',table:'work_orders',filter:'customer_user_id=eq.'+userId},onChange)
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'notifications',filter:'user_id=eq.'+userId},onChange)
    .subscribe();
  return()=>{void client.removeChannel(channel)};
}

export async function getSignedInUserId(){
  const {data,error}=await db().auth.getUser();
  if(error)throw error;
  return data.user?.id??null;
}


export async function getChatAttachmentUrl(path:string,expiresIn=300){
  const {data,error}=await db().storage.from('chat-media').createSignedUrl(path,expiresIn);
  if(error)throw error;
  return data.signedUrl;
}
