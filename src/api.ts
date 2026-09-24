import { backendConfigured, supabase } from './lib';

function db(){if(!backendConfigured||!supabase)throw new Error('MotorAtlas backend is not configured.');return supabase;}

export function authReturnUrl(path:string,query?:string){
  if(typeof window==='undefined')return undefined;
  const configured=(import.meta.env.VITE_PUBLIC_APP_URL as string|undefined)?.trim()||'https://motoratlas.de/';
  const base=new URL(configured);
  const normalized=path.startsWith('/')?path:`/${path}`;
  base.pathname=normalized;
  base.search=query??'';
  base.hash='';
  return base.toString();
}

export async function signUpCustomer(
  email:string,password:string,fullName:string,
  input?:{accountIntent?:'customer'|'workshop';phone?:string;street?:string;postalCode?:string;city?:string;emailRedirectQuery?:string}
){
  const {data,error}=await db().auth.signUp({
    email,password,
    options:{emailRedirectTo:authReturnUrl('/bestaetigung',input?.emailRedirectQuery),data:{
      full_name:fullName.trim(),
      account_intent:input?.accountIntent??'customer',
      phone:input?.phone?.trim()||null,
      street:input?.street?.trim()||null,
      postal_code:input?.postalCode?.trim()||null,
      city:input?.city?.trim()||null,
      country_code:'DE'
    }}
  });
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

export type ServiceRequestIntent='direct_work'|'diagnosis_then_quote'|'diagnosis_only'|'diagnosis_then_decide'|'quote_before_work';

export async function createServiceRequestDraft(input:{
  workshopId:string;vehicleId:string;complaint:string;customerNotes?:string;desiredStart?:string;desiredEnd?:string;
  driveable?:boolean;warningLevel?:'none'|'yellow'|'red'|'unknown';requestIntent:ServiceRequestIntent;
}){
  const client=db();const {data:auth}=await client.auth.getUser();if(!auth.user)throw new Error('Not signed in');
  const {data,error}=await client.from('service_requests').insert({
    customer_user_id:auth.user.id,workshop_id:input.workshopId,vehicle_id:input.vehicleId,
    complaint:input.complaint.trim()||'Keine Fehlerbeschreibung angegeben.',customer_notes:input.customerNotes?.trim()||null,
    desired_start:input.desiredStart??null,desired_end:input.desiredEnd??null,driveable:input.driveable??null,
    warning_level:input.warningLevel??null,request_intent:input.requestIntent,status:'draft'
  }).select().single();
  if(error){
    const message=error.message.includes('desired_appointment_in_past')
      ?'Der Wunschtermin muss in der Zukunft liegen.'
      :error.message.includes('invalid_desired_appointment_range')
        ?'Das gewünschte Terminende muss nach dem Beginn liegen.'
        :error.message;
    throw new Error(message);
  }
  return data;
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
  const {data,error}=await db().rpc('submit_service_request',{p_service_request_id:serviceRequestId});
  if(error){
    const message=error.message.includes('workshop_relationship_not_active')
      ?'Diese Werkstatt hat deine Kundenaufnahme noch nicht bestätigt.'
      :error.message.includes('service_request_not_found')
        ?'Die Anfrage konnte nicht gefunden werden.'
        :error.message.includes('request_not_draft')
          ?'Diese Anfrage wurde bereits gesendet oder bearbeitet.'
          :error.message;
    throw new Error(message);
  }
  return data;
}

export async function proposeAppointment(input:{serviceRequestId:string;startsAt:string;endsAt?:string;note?:string}){
  const {data,error}=await db().rpc('propose_appointment',{
    p_service_request_id:input.serviceRequestId,p_starts_at:input.startsAt,p_ends_at:input.endsAt??null,p_note:input.note?.trim()||null
  });
  if(error){
    const message=error.message.includes('appointment_in_past')
      ?'Termine in der Vergangenheit sind nicht möglich. Bitte wähle einen zukünftigen 15-Minuten-Slot.'
      :error.message.includes('appointment_must_use_15_minute_slots')
        ?'Termine können nur in 15-Minuten-Schritten gewählt werden.'
        :error.message.includes('invalid_appointment_range')
        ?'Das voraussichtliche Ende muss nach dem Terminbeginn liegen.'
        :error.message;
    throw new Error(message);
  }
  return data;
}
export async function respondAppointment(appointmentId:string,decision:'confirmed'|'declined'){
  const {data,error}=await db().rpc('respond_appointment',{p_appointment_id:appointmentId,p_decision:decision});if(error)throw error;return data;
}

export async function cancelAppointmentAsCustomer(appointmentId:string,reason?:string){
  const {data,error}=await db().rpc('cancel_appointment_as_customer',{
    p_appointment_id:appointmentId,p_reason:reason?.trim()||null
  });
  if(error){
    const message=error.message.includes('customer_cancellation_window_closed')
      ?'Online-Stornierung ist nur bis spätestens 12 Stunden vor dem Termin möglich. Bitte kläre eine kurzfristige Absage telefonisch mit der Werkstatt.'
      :error.message.includes('appointment_already_started')
        ?'Der Termin hat bereits begonnen bzw. das Fahrzeug wurde schon angenommen. Bitte kontaktiere die Werkstatt direkt.'
        :error.message.includes('appointment_not_confirmed')
          ?'Dieser Termin ist nicht mehr als bestätigter Termin stornierbar.'
          :error.message;
    throw new Error(message);
  }
  return data;
}

export async function cancelAppointmentAsWorkshop(appointmentId:string,reason?:string){
  const {data,error}=await db().rpc('cancel_appointment_as_workshop',{
    p_appointment_id:appointmentId,p_reason:reason?.trim()||null
  });
  if(error){
    const message=error.message.includes('appointment_already_started')
      ?'Das Fahrzeug wurde bereits angenommen. Der laufende Werkstattauftrag muss separat bearbeitet werden.'
      :error.message.includes('appointment_not_cancellable')
        ?'Dieser Termin kann nicht mehr storniert werden.'
        :error.message;
    throw new Error(message);
  }
  return data;
}
export async function declineServiceRequest(serviceRequestId:string,reason?:string){
  const {data,error}=await db().rpc('decline_service_request',{p_service_request_id:serviceRequestId,p_reason:reason?.trim()||null});
  if(error)throw error;return data;
}

export async function markVehicleArrived(workOrderId:string){
  const {data,error}=await db().rpc('mark_vehicle_arrived',{p_work_order_id:workOrderId});if(error)throw error;return data;
}
export type WorkshopMemberOption={
  userId:string;displayName:string;role:string;permissions:Record<string,unknown>;
  canDiagnosis:boolean;canRepair:boolean;
};

export async function listAssignableWorkshopMembers(workshopId:string):Promise<WorkshopMemberOption[]>{
  const {data,error}=await db().from('workshop_members')
    .select('user_id,display_name,role,permissions')
    .eq('workshop_id',workshopId).eq('active',true).order('created_at',{ascending:true});
  if(error)throw error;
  return((data??[]) as any[]).map(member=>{
    const permissions=(member.permissions??{}) as Record<string,unknown>;
    const role=member.role as string;
    return{
      userId:member.user_id,
      displayName:member.display_name||(
        role==='owner'?'Inhaber':
        role==='office'?'Büro':
        role==='mechanic'?'Mechaniker':'Mitarbeiter'
      ),
      role,
      permissions,
      canDiagnosis:role==='owner'||role==='mechanic'||(role==='custom'&&permissions.diagnosis===true),
      canRepair:role==='owner'||role==='mechanic'||(role==='custom'&&permissions.repair===true)
    };
  });
}

export async function assignWorkToMember(workOrderId:string,type:'diagnosis'|'repair',memberUserId:string){
  const {data,error}=await db().rpc('assign_work_to_member',{
    p_work_order_id:workOrderId,p_type:type,p_member_user_id:memberUserId
  });
  if(error){
    const message=error.message.includes('target_member_not_authorized')
      ?'Dieser Mitarbeiter hat für diese Arbeit keine Berechtigung.'
      :error.message.includes('work_already_assigned')
        ?'Dieser Auftrag wurde bereits einem Mitarbeiter zugeordnet.'
        :error.message.includes('assignment_not_authorized')
          ?'Du darfst Aufträge nicht anderen Mitarbeitern zuweisen.'
          :error.message;
    throw new Error(message);
  }
  return data;
}

export async function claimWork(workOrderId:string,type:'diagnosis'|'repair'){
  const {data,error}=await db().rpc('claim_work',{p_work_order_id:workOrderId,p_type:type});if(error)throw error;return data;
}
export async function completeDiagnosis(workOrderId:string,summary:string,internalNote?:string){
  const {data,error}=await db().rpc('complete_diagnosis',{p_work_order_id:workOrderId,p_summary:summary,p_internal_note:internalNote??null});
  if(error)throw error;return data;
}

export type WorkNextStepDecision='motoratlas_quote'|'external_approved'|'external_waiting'|'no_repair'|'deferred';
export type AgreementMethod='customer_order'|'portal'|'email'|'phone'|'in_person'|'other';

export async function resolveWorkOrderNextStep(input:{
  workOrderId:string;decision:WorkNextStepDecision;method?:AgreementMethod;note?:string;invoiceRequired?:boolean;
}){
  const {data,error}=await db().rpc('resolve_work_order_next_step',{
    p_work_order_id:input.workOrderId,
    p_decision:input.decision,
    p_method:input.method??null,
    p_note:input.note?.trim()||null,
    p_invoice_required:input.invoiceRequired??true
  });
  if(error){
    const message=error.message.includes('invalid_stage')
      ?'Dieser nächste Schritt passt nicht mehr zum aktuellen Auftragsstatus.'
      :error.message.includes('not_authorized')
        ?'Du darfst diesen Auftragsweg nicht ändern.'
        :error.message;
    throw new Error(message);
  }
  return data;
}
export async function recordApproval(input:{
  workOrderId:string;quoteDocumentId:string;decision:'approved'|'declined'|'question_requested'|'deferred';
  method:'portal'|'phone_recorded_by_workshop';note?:string;
}){
  const {data,error}=await db().rpc('record_customer_approval',{
    p_work_order_id:input.workOrderId,p_quote_document_id:input.quoteDocumentId,p_decision:input.decision,
    p_method:input.method,p_note:input.note??null
  });if(error)throw error;return data;
}

export async function customerResolveAfterDiagnosis(workOrderId:string,decision:'quote'|'no_repair'|'deferred'){
  const {data,error}=await db().rpc('customer_resolve_after_diagnosis',{
    p_work_order_id:workOrderId,p_decision:decision
  });
  if(error){
    const message=error.message.includes('invalid_stage')
      ?'Diese Entscheidung passt nicht mehr zum aktuellen Auftragsstatus.'
      :error.message;
    throw new Error(message);
  }
  return data;
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
export async function markNoCostsAndReadyForPickup(workOrderId:string){
  const {data,error}=await db().rpc('mark_no_costs_and_ready_for_pickup',{p_work_order_id:workOrderId});
  if(error){
    const message=error.message.includes('invoice_already_published')
      ?'Für diesen Auftrag wurde bereits eine Rechnung veröffentlicht.'
      :error.message.includes('invalid_stage')
        ?'Der Auftrag ist nicht mehr im Status „Arbeit fertig“.'
        :error.message.includes('not_authorized')
          ?'Du darfst diesen Auftrag nicht zur Abholung freigeben.'
          :error.message;
    throw new Error(message);
  }
  return data;
}
export async function closeWorkOrder(workOrderId:string){
  const {data,error}=await db().rpc('close_work_order',{p_work_order_id:workOrderId});if(error)throw error;return data;
}
export async function publishDocument(documentId:string){
  const {data,error}=await db().rpc('publish_document',{p_document_id:documentId});if(error)throw error;return data;
}

export function subscribeWorkshop(workshopId:string,onChange:()=>void){
  const client=db();
  let timer:number|undefined;
  const refresh=()=>{
    if(timer)window.clearTimeout(timer);
    timer=window.setTimeout(onChange,120);
  };
  const channel=client.channel(`workshop:${workshopId}:workspace`)
    .on('postgres_changes',{event:'*',schema:'public',table:'work_orders',filter:`workshop_id=eq.${workshopId}`},refresh)
    .on('postgres_changes',{event:'*',schema:'public',table:'work_order_events',filter:`workshop_id=eq.${workshopId}`},refresh)
    .on('postgres_changes',{event:'*',schema:'public',table:'service_requests',filter:`workshop_id=eq.${workshopId}`},refresh)
    .on('postgres_changes',{event:'*',schema:'public',table:'appointments',filter:`workshop_id=eq.${workshopId}`},refresh)
    .on('postgres_changes',{event:'*',schema:'public',table:'workshop_customer_requests',filter:`workshop_id=eq.${workshopId}`},refresh)
    .on('postgres_changes',{event:'*',schema:'public',table:'customer_workshop_links',filter:`workshop_id=eq.${workshopId}`},refresh)
    .on('postgres_changes',{event:'*',schema:'public',table:'documents',filter:`workshop_id=eq.${workshopId}`},refresh)
    .on('postgres_changes',{event:'*',schema:'public',table:'notifications',filter:`workshop_id=eq.${workshopId}`},refresh)
    .on('postgres_changes',{event:'*',schema:'public',table:'workshop_members',filter:`workshop_id=eq.${workshopId}`},refresh)
    .on('postgres_changes',{event:'*',schema:'public',table:'workshops',filter:`id=eq.${workshopId}`},refresh)
    .on('postgres_changes',{event:'*',schema:'public',table:'chat_threads',filter:`workshop_id=eq.${workshopId}`},refresh)
    .on('postgres_changes',{event:'*',schema:'public',table:'chat_messages'},refresh)
    .subscribe(status=>{if(status==='SUBSCRIBED')refresh()});
  return()=>{
    if(timer)window.clearTimeout(timer);
    void client.removeChannel(channel);
  };
}

export type ChatThread={
  id:string;workshop_id:string;customer_user_id:string;vehicle_id:string;service_request_id?:string|null;
  work_order_id?:string|null;subject?:string|null;status:'open'|'closed';last_message_at?:string|null;created_at:string;
};
export type ChatMessage={
  id:string;thread_id:string;sender_user_id:string;kind:'text'|'image'|'file'|'system';body?:string|null;
  attachment_path?:string|null;attachment_name?:string|null;attachment_mime?:string|null;attachment_size?:number|null;created_at:string;
};

export type ChatContext={
  threadId:string;
  workOrderId?:string|null;
  orderNumber?:string|null;
  customerUserId:string;
  customerName:string;
  customerEmail?:string|null;
  customerPhone?:string|null;
  customerStreet?:string|null;
  customerPostalCode?:string|null;
  customerCity?:string|null;
  vehicleId:string;
  vehicleMake:string;
  vehicleModel:string;
  vehicleVariant?:string|null;
  licensePlate:string;
  firstRegistration?:string|null;
  hsn?:string|null;
  tsn?:string|null;
  vin?:string|null;
  mileage?:number|null;
  photoPath?:string|null;
};

function chatErrorMessage(error:any){
  const message=String(error?.message??error??'');
  if(message.includes('chat_disabled'))return'Diese Werkstatt hat den MotorAtlas-Chat deaktiviert. Bitte nutze Telefon oder E-Mail.';
  if(message.includes('no_active_workshop_relationship'))return'Der Chat ist erst nach Freigabe durch die Werkstatt verfügbar.';
  if(message.includes('not_authorized'))return'Du hast keinen Zugriff auf diesen Chat.';
  return message||'Chat konnte nicht geöffnet werden.';
}

export async function ensureVehicleChat(workshopId:string,vehicleId:string){
  const {data,error}=await db().rpc('ensure_vehicle_chat',{p_workshop_id:workshopId,p_vehicle_id:vehicleId});
  if(error)throw new Error(chatErrorMessage(error));return data as ChatThread;
}
export async function ensureWorkOrderChat(workOrderId:string){
  const {data,error}=await db().rpc('ensure_work_order_chat',{p_work_order_id:workOrderId});
  if(error)throw new Error(chatErrorMessage(error));return data as ChatThread;
}
export async function listChatMessages(threadId:string,limit=100){
  const {data,error}=await db().from('chat_messages').select('*').eq('thread_id',threadId).order('created_at',{ascending:false}).limit(limit);
  if(error)throw error;
  return((data??[]) as ChatMessage[]).reverse();
}
export async function getChatContext(threadId:string):Promise<ChatContext>{
  const {data,error}=await db().rpc('get_chat_context',{p_thread_id:threadId});
  if(error)throw new Error(chatErrorMessage(error));
  const row=(Array.isArray(data)?data[0]:data) as any;
  if(!row)throw new Error('Fahrzeug- und Kundendaten konnten nicht geladen werden.');
  return{
    threadId:row.thread_id,
    workOrderId:row.work_order_id??null,
    orderNumber:row.order_number??null,
    customerUserId:row.customer_user_id,
    customerName:row.customer_name??'Kunde',
    customerEmail:row.customer_email??null,
    customerPhone:row.customer_phone??null,
    customerStreet:row.customer_street??null,
    customerPostalCode:row.customer_postal_code??null,
    customerCity:row.customer_city??null,
    vehicleId:row.vehicle_id,
    vehicleMake:row.vehicle_make??'',
    vehicleModel:row.vehicle_model??'',
    vehicleVariant:row.vehicle_variant??null,
    licensePlate:row.license_plate??'—',
    firstRegistration:row.first_registration??null,
    hsn:row.hsn??null,
    tsn:row.tsn??null,
    vin:row.vin??null,
    mileage:row.mileage??null,
    photoPath:row.photo_path??null
  };
}
export async function sendChatMessage(threadId:string,body:string){
  const text=body.trim();if(!text)throw new Error('Message is empty');
  const client=db();const {data:auth}=await client.auth.getUser();if(!auth.user)throw new Error('Not signed in');
  const {data,error}=await client.from('chat_messages').insert({thread_id:threadId,sender_user_id:auth.user.id,kind:'text',body:text}).select().single();
  if(error)throw new Error(chatErrorMessage(error));return data as ChatMessage;
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
    }).select().single();if(error)throw new Error(chatErrorMessage(error));return data as ChatMessage;
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

export type WorkshopChatInboxItem={
  threadId:string;customerUserId:string;customerName:string;vehicleId:string;vehicleName:string;plate:string;
  photoPath?:string|null;lastMessage:string;lastMessageKind:string;lastMessageAt:string;unreadCount:number;
};

export type WorkshopDashboardMetrics={
  activeCustomerCount:number;
  primaryCustomerCount:number;
};

export type WorkshopResponseStats={
  medianResponseMinutes:number|null;
  averageResponseMinutes:number|null;
  sampleCount:number;
};

export async function listWorkshopChatInbox(workshopId:string):Promise<WorkshopChatInboxItem[]>{
  const {data,error}=await db().rpc('get_workshop_chat_inbox',{p_workshop_id:workshopId});
  if(error)throw error;
  return((data??[]) as any[]).map(row=>({
    threadId:row.thread_id,customerUserId:row.customer_user_id,customerName:row.customer_name,
    vehicleId:row.vehicle_id,vehicleName:row.vehicle_name,plate:row.plate,photoPath:row.photo_path,
    lastMessage:row.last_message,lastMessageKind:row.last_message_kind,lastMessageAt:row.last_message_at,
    unreadCount:Number(row.unread_count??0)
  }));
}

export async function getWorkshopDashboardMetrics(workshopId:string):Promise<WorkshopDashboardMetrics>{
  const {data,error}=await db().rpc('get_workshop_dashboard_metrics',{p_workshop_id:workshopId});
  if(error)throw error;
  const row=Array.isArray(data)?data[0]:data;
  return{
    activeCustomerCount:Number(row?.active_customer_count??0),
    primaryCustomerCount:Number(row?.primary_customer_count??0)
  };
}

export async function getWorkshopResponseStats(workshopId:string):Promise<WorkshopResponseStats>{
  const {data,error}=await db().rpc('get_workshop_response_stats',{p_workshop_id:workshopId});
  if(error)throw error;
  const row=Array.isArray(data)?data[0]:data;
  return{
    medianResponseMinutes:row?.median_response_minutes==null?null:Number(row.median_response_minutes),
    averageResponseMinutes:row?.average_response_minutes==null?null:Number(row.average_response_minutes),
    sampleCount:Number(row?.sample_count??0)
  };
}


export type LiveStage='arrived'|'diagnosis'|'approval'|'repair'|'pickup';
export type LiveJob={
  id:string;
  orderNumber:string;
  vehicleId:string;
  customerUserId?:string|null;
  localCustomerId?:string|null;
  serviceRequestId?:string|null;
  vehicle:string;
  make?:string|null;
  model?:string|null;
  variant?:string|null;
  plate:string;
  mileage?:number|null;
  firstRegistration?:string|null;
  hsn?:string|null;
  tsn?:string|null;
  vin?:string|null;
  typeVariantVersion?:string|null;
  engineCode?:string|null;
  displacementCcm?:number|null;
  powerKw?:number|null;
  fuelType?:string|null;
  transmissionCode?:string|null;
  driveType?:string|null;
  identityVerifiedAt?:string|null;
  identityVerifiedWorkshopId?:string|null;
  photoPath?:string|null;
  complaint:string;
  customerNotes?:string|null;
  driveable?:boolean|null;
  warningLevel?:string|null;
  customerName?:string|null;
  customerEmail?:string|null;
  customerPhone?:string|null;
  customerStreet?:string|null;
  customerPostalCode?:string|null;
  customerCity?:string|null;
  arrivedAt?:string|null;
  stage:LiveStage;
  rawStage:string;
  priority:'normal'|'urgent'|'waiting_customer'|'immobile';
  assignee?:string|null;
  assigneeUserId?:string|null;
  assignmentType?:'diagnosis'|'repair'|null;
  assignmentClaimedAt?:string|null;
  workflowPath?:ServiceRequestIntent|null;
  commercialState?:string|null;
  agreementMethod?:string|null;
  agreementNote?:string|null;
  invoiceRequired:boolean;
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
  brandSoft?:string|null;
  brandRgb?:string|null;
  logoPath?:string|null;
  operatingMode?:'solo'|'team';
  chatEnabled:boolean;
};

function mapOrderStage(stage:string):LiveStage{
  if(stage==='waiting_diagnosis'||stage==='appointment_confirmed')return'arrived';
  if(stage==='diagnosing'||stage==='awaiting_quote')return'diagnosis';
  if(stage==='awaiting_customer_decision'||stage==='awaiting_customer_approval')return'approval';
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
    .select('id,name,brand_primary,brand_secondary,brand_soft,brand_rgb,logo_path,operating_mode,chat_enabled')
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
    brandSecondary:workshop.brand_secondary,
    brandSoft:workshop.brand_soft,
    brandRgb:workshop.brand_rgb,
    logoPath:workshop.logo_path,
    operatingMode:(workshop.operating_mode??'solo') as 'solo'|'team',
    chatEnabled:workshop.chat_enabled!==false
  };
}

export async function listWorkshopJobs(workshopId:string):Promise<LiveJob[]>{
  const client=db();
  const {data:orders,error}=await client.from('work_orders')
    .select('id,order_number,stage,priority,vehicle_id,service_request_id,customer_user_id,local_customer_id,arrived_at,workflow_path,commercial_state,agreement_method,agreement_note,invoice_required,work_description,updated_at')
    .eq('workshop_id',workshopId)
    .not('stage','in','("closed","cancelled","appointment_confirmed")')
    .order('updated_at',{ascending:false});
  if(error)throw error;
  const rows=(orders??[]) as any[];
  if(!rows.length)return[];

  const vehicleIds=[...new Set(rows.map(r=>r.vehicle_id).filter(Boolean))];
  const requestIds=[...new Set(rows.map(r=>r.service_request_id).filter(Boolean))];
  const orderIds=rows.map(r=>r.id);

  const vehicleResult=await client.from('vehicles').select('id,make,model,variant,first_registration,license_plate,hsn,tsn,vin,mileage,type_variant_version,engine_code,displacement_ccm,power_kw,fuel_type,transmission_code,drive_type,identity_verified_at,identity_verified_workshop_id,photo_path').in('id',vehicleIds);
  if(vehicleResult.error)throw vehicleResult.error;
  const requestResult=requestIds.length
    ?await client.from('service_requests').select('id,complaint,customer_notes,driveable,warning_level').in('id',requestIds)
    :{data:[],error:null} as any;
  if(requestResult.error)throw requestResult.error;
  const assignmentResult=await client.from('work_order_assignments')
    .select('work_order_id,member_user_id,assignment_type,status,claimed_at').in('work_order_id',orderIds).eq('status','claimed');
  if(assignmentResult.error)throw assignmentResult.error;

  const customerIds=[...new Set(rows.map(r=>r.customer_user_id).filter(Boolean))];
  const localCustomerIds=[...new Set(rows.map(r=>r.local_customer_id).filter(Boolean))];
  const [profileResult,localCustomerResult]=await Promise.all([
    customerIds.length
      ?client.from('profiles').select('id,full_name,email,phone,street,postal_code,city').in('id',customerIds)
      :Promise.resolve({data:[],error:null} as any),
    localCustomerIds.length
      ?client.from('workshop_customers').select('id,full_name,email,phone,street,postal_code,city').eq('workshop_id',workshopId).in('id',localCustomerIds)
      :Promise.resolve({data:[],error:null} as any)
  ]);
  if(profileResult.error)throw profileResult.error;
  if(localCustomerResult.error)throw localCustomerResult.error;
  const assigneeIds=[...new Set(((assignmentResult.data??[]) as any[]).map(a=>a.member_user_id).filter(Boolean))];
  const memberResult=assigneeIds.length
    ?await client.from('workshop_members').select('user_id,display_name').eq('workshop_id',workshopId).in('user_id',assigneeIds)
    :{data:[],error:null} as any;
  if(memberResult.error)throw memberResult.error;

  const vehicleMap=new Map(((vehicleResult.data??[]) as any[]).map(v=>[v.id,v]));
  const requestMap=new Map(((requestResult.data??[]) as any[]).map(r=>[r.id,r]));
  const profileMap=new Map(((profileResult.data??[]) as any[]).map(p=>[p.id,p]));
  const localCustomerMap=new Map(((localCustomerResult.data??[]) as any[]).map(p=>[p.id,p]));
  const memberMap=new Map(((memberResult.data??[]) as any[]).map(m=>[m.user_id,m.display_name]));
  const assignmentMap=new Map(((assignmentResult.data??[]) as any[]).map(a=>[a.work_order_id,{
    userId:a.member_user_id,name:memberMap.get(a.member_user_id)??null,type:a.assignment_type,claimedAt:a.claimed_at
  }]));

  return rows.map(row=>{
    const vehicle=vehicleMap.get(row.vehicle_id) as any;
    const request=requestMap.get(row.service_request_id) as any;
    const profile=profileMap.get(row.customer_user_id) as any;
    const localCustomer=localCustomerMap.get(row.local_customer_id) as any;
    const customer=profile??localCustomer;
    const assignment=assignmentMap.get(row.id) as any;
    return{
      id:row.id,
      orderNumber:row.order_number,
      vehicleId:row.vehicle_id,
      customerUserId:row.customer_user_id??null,
      localCustomerId:row.local_customer_id??null,
      serviceRequestId:row.service_request_id,
      vehicle:vehicle?[vehicle.make,vehicle.model,vehicle.variant].filter(Boolean).join(' '):'Fahrzeug',
      make:vehicle?.make??null,model:vehicle?.model??null,variant:vehicle?.variant??null,
      plate:vehicle?.license_plate??'—',
      mileage:vehicle?.mileage??null,firstRegistration:vehicle?.first_registration??null,
      hsn:vehicle?.hsn??null,tsn:vehicle?.tsn??null,vin:vehicle?.vin??null,
      typeVariantVersion:vehicle?.type_variant_version??null,engineCode:vehicle?.engine_code??null,
      displacementCcm:vehicle?.displacement_ccm??null,powerKw:vehicle?.power_kw??null,
      fuelType:vehicle?.fuel_type??null,transmissionCode:vehicle?.transmission_code??null,driveType:vehicle?.drive_type??null,
      identityVerifiedAt:vehicle?.identity_verified_at??null,identityVerifiedWorkshopId:vehicle?.identity_verified_workshop_id??null,
      photoPath:vehicle?.photo_path??null,
      complaint:request?.complaint??row.work_description??'Kein Beanstandungstext hinterlegt.',
      customerNotes:request?.customer_notes??null,driveable:request?.driveable??null,warningLevel:request?.warning_level??null,
      customerName:customer?.full_name??'Kunde',customerEmail:customer?.email??null,customerPhone:customer?.phone??null,
      customerStreet:customer?.street??null,customerPostalCode:customer?.postal_code??null,customerCity:customer?.city??null,
      arrivedAt:row.arrived_at??null,
      stage:mapOrderStage(row.stage),
      rawStage:row.stage,
      priority:row.priority,
      assignee:assignment?.name??null,
      assigneeUserId:assignment?.userId??null,
      assignmentType:assignment?.type??null,
      assignmentClaimedAt:assignment?.claimedAt??null,
      workflowPath:row.workflow_path??null,commercialState:row.commercial_state??null,
      agreementMethod:row.agreement_method??null,agreementNote:row.agreement_note??null,
      invoiceRequired:row.invoice_required!==false,
      updatedAt:row.updated_at
    } satisfies LiveJob;
  });
}

export type CustomerVehicle={
  id:string;make:string;model:string;variant?:string|null;licensePlate:string;mileage?:number|null;
  firstRegistration?:string|null;hsn?:string|null;tsn?:string|null;vin?:string|null;
  typeVariantVersion?:string|null;engineCode?:string|null;displacementCcm?:number|null;powerKw?:number|null;
  fuelType?:string|null;transmissionCode?:string|null;driveType?:string|null;
  identityVerifiedAt?:string|null;identityVerifiedWorkshopId?:string|null;photoPath:string;
};
export type CustomerOrderProgress={
  workOrderId:string;
  arrivedAt?:string|null;
  diagnosisStartedAt?:string|null;
  diagnosisCompletedAt?:string|null;
  diagnosisStaffName?:string|null;
  repairStartedAt?:string|null;
  repairCompletedAt?:string|null;
  repairStaffName?:string|null;
  readyForPickupAt?:string|null;
  closedAt?:string|null;
};

export type CustomerOrder={
  id:string;orderNumber:string;vehicleId:string;serviceRequestId?:string|null;appointmentId?:string|null;
  stage:LiveStage;rawStage:string;updatedAt:string;workshopId:string;
  workflowPath?:ServiceRequestIntent|null;commercialState?:string|null;agreementMethod?:string|null;agreementNote?:string|null;invoiceRequired:boolean;
  progress?:CustomerOrderProgress|null;
};
export type CustomerWorkshop={
  workshopId:string;linkId:string;isPrimary:boolean;name:string;street:string;postalCode:string;city:string;
  phone?:string|null;email?:string|null;website?:string|null;description?:string|null;chatEnabled:boolean;
  logoPath?:string|null;acceptsNewCustomers:boolean;
};
export type CustomerServiceRequest={
  id:string;workshopId:string;vehicleId:string;complaint:string;status:string;requestIntent:ServiceRequestIntent;
  desiredStart?:string|null;desiredEnd?:string|null;warningLevel?:string|null;driveable?:boolean|null;
  declineReason?:string|null;declinedAt?:string|null;createdAt:string;
};
export type CustomerRelationshipRequest={
  id:string;workshopId:string;workshopName:string;message?:string|null;status:'pending'|'accepted'|'rejected';
  decidedAt?:string|null;createdAt:string;updatedAt:string;
};
export type CustomerAppointment={
  id:string;serviceRequestId:string;workshopId:string;startsAt:string;endsAt?:string|null;status:string;note?:string|null;
  cancelledAt?:string|null;cancellationReason?:string|null;cancellationActor?:'customer'|'workshop'|null;
};

export async function loadCustomerWorkspace():Promise<{
  vehicles:CustomerVehicle[];orders:CustomerOrder[];workshops:CustomerWorkshop[];
  requests:CustomerServiceRequest[];appointments:CustomerAppointment[];relationshipRequests:CustomerRelationshipRequest[];
}>{
  const client=db();
  const {data:auth}=await client.auth.getUser();
  if(!auth.user)throw new Error('Not signed in');

  const vehicleResult=await client.from('vehicles').select('id,make,model,variant,license_plate,mileage,first_registration,hsn,tsn,vin,type_variant_version,engine_code,displacement_ccm,power_kw,fuel_type,transmission_code,drive_type,identity_verified_at,identity_verified_workshop_id,photo_path')
      .eq('owner_user_id',auth.user.id).is('archived_at',null).order('created_at',{ascending:true});
  if(vehicleResult.error)throw vehicleResult.error;

  const orderResult=await client.from('work_orders').select('id,order_number,vehicle_id,service_request_id,appointment_id,stage,workflow_path,commercial_state,agreement_method,agreement_note,invoice_required,updated_at,workshop_id')
      .eq('customer_user_id',auth.user.id).neq('stage','cancelled').order('updated_at',{ascending:false});
  if(orderResult.error)throw orderResult.error;

  const {data:progressData,error:progressError}=await client.rpc('get_customer_order_progress');
  if(progressError)throw progressError;
  const progressMap=new Map(((progressData??[]) as any[]).map(row=>[row.work_order_id,{
    workOrderId:row.work_order_id,arrivedAt:row.arrived_at,diagnosisStartedAt:row.diagnosis_started_at,
    diagnosisCompletedAt:row.diagnosis_completed_at,diagnosisStaffName:row.diagnosis_staff_name,
    repairStartedAt:row.repair_started_at,repairCompletedAt:row.repair_completed_at,repairStaffName:row.repair_staff_name,
    readyForPickupAt:row.ready_for_pickup_at,closedAt:row.closed_at
  } satisfies CustomerOrderProgress]));

  const requestResult=await client.from('service_requests')
      .select('id,workshop_id,vehicle_id,complaint,status,request_intent,desired_start,desired_end,warning_level,driveable,decline_reason,declined_at,created_at')
      .eq('customer_user_id',auth.user.id).neq('status','draft').order('created_at',{ascending:false});
  if(requestResult.error)throw requestResult.error;

  const relationshipRequestResult=await client.from('workshop_customer_requests')
      .select('id,workshop_id,message,status,decided_at,created_at,updated_at')
      .eq('customer_user_id',auth.user.id)
      .order('updated_at',{ascending:false});
  if(relationshipRequestResult.error)throw relationshipRequestResult.error;

  const linkResult=await client.from('customer_workshop_links')
      .select('id,workshop_id,is_primary').eq('customer_user_id',auth.user.id).eq('active',true);
  if(linkResult.error)throw linkResult.error;

  const workshopIds=[...new Set([
    ...((linkResult.data??[]) as any[]).map(link=>link.workshop_id),
    ...((relationshipRequestResult.data??[]) as any[]).map(request=>request.workshop_id),
    ...((requestResult.data??[]) as any[]).map(request=>request.workshop_id)
  ])];
  const workshopResult=workshopIds.length
    ?await client.from('workshops').select('id,name,street,postal_code,city,phone,email,website,description,chat_enabled,logo_path,accepts_new_customers').in('id',workshopIds)
    :{data:[],error:null} as any;
  if(workshopResult.error)throw workshopResult.error;

  const requestIds=[...new Set([
    ...((requestResult.data??[]) as any[]).map(request=>request.id),
    ...((orderResult.data??[]) as any[]).map(order=>order.service_request_id).filter(Boolean)
  ])];
  const appointmentResult=requestIds.length
    ?await client.from('appointments').select('id,service_request_id,workshop_id,starts_at,ends_at,status,note,cancelled_at,cancellation_reason,cancellation_actor').in('service_request_id',requestIds).order('created_at',{ascending:false})
    :{data:[],error:null} as any;
  if(appointmentResult.error)throw appointmentResult.error;

  const workshopMap=new Map(((workshopResult.data??[]) as any[]).map(workshop=>[workshop.id,workshop]));
  return{
    vehicles:((vehicleResult.data??[]) as any[]).map(v=>({
      id:v.id,make:v.make,model:v.model,variant:v.variant,licensePlate:v.license_plate,mileage:v.mileage,
      firstRegistration:v.first_registration,hsn:v.hsn,tsn:v.tsn,vin:v.vin,
      typeVariantVersion:v.type_variant_version,engineCode:v.engine_code,displacementCcm:v.displacement_ccm,powerKw:v.power_kw,
      fuelType:v.fuel_type,transmissionCode:v.transmission_code,driveType:v.drive_type,
      identityVerifiedAt:v.identity_verified_at,identityVerifiedWorkshopId:v.identity_verified_workshop_id,photoPath:v.photo_path
    })),
    orders:((orderResult.data??[]) as any[]).map(o=>({
      id:o.id,orderNumber:o.order_number,vehicleId:o.vehicle_id,serviceRequestId:o.service_request_id,appointmentId:o.appointment_id,
      stage:mapOrderStage(o.stage),rawStage:o.stage,updatedAt:o.updated_at,workshopId:o.workshop_id,
      workflowPath:o.workflow_path??null,commercialState:o.commercial_state??null,agreementMethod:o.agreement_method??null,
      agreementNote:o.agreement_note??null,invoiceRequired:o.invoice_required!==false,
      progress:progressMap.get(o.id)??null
    })),
    workshops:((linkResult.data??[]) as any[]).map(link=>{
      const workshop=workshopMap.get(link.workshop_id) as any;
      return{workshopId:link.workshop_id,linkId:link.id,isPrimary:Boolean(link.is_primary),name:workshop?.name??'Werkstatt',
        street:workshop?.street??'',postalCode:workshop?.postal_code??'',city:workshop?.city??'',
        phone:workshop?.phone??null,email:workshop?.email??null,website:workshop?.website??null,description:workshop?.description??null,
        chatEnabled:workshop?.chat_enabled!==false,logoPath:workshop?.logo_path??null,acceptsNewCustomers:Boolean(workshop?.accepts_new_customers)};
    }),
    requests:((requestResult.data??[]) as any[]).map(r=>({
      id:r.id,workshopId:r.workshop_id,vehicleId:r.vehicle_id,complaint:r.complaint,status:r.status,requestIntent:r.request_intent,
      desiredStart:r.desired_start,desiredEnd:r.desired_end,warningLevel:r.warning_level,driveable:r.driveable,
      declineReason:r.decline_reason,declinedAt:r.declined_at,createdAt:r.created_at
    })),
    appointments:((appointmentResult.data??[]) as any[]).map(a=>({
      id:a.id,serviceRequestId:a.service_request_id,workshopId:a.workshop_id,startsAt:a.starts_at,endsAt:a.ends_at,status:a.status,note:a.note,
      cancelledAt:a.cancelled_at,cancellationReason:a.cancellation_reason,cancellationActor:a.cancellation_actor
    })),
    relationshipRequests:((relationshipRequestResult.data??[]) as any[]).map(r=>({
      id:r.id,workshopId:r.workshop_id,workshopName:(workshopMap.get(r.workshop_id) as any)?.name??'Werkstatt',
      message:r.message,status:r.status,decidedAt:r.decided_at,createdAt:r.created_at,updatedAt:r.updated_at
    }))
  };
}

export type WorkshopServiceRequest={
  id:string;customerUserId:string;customerName:string;customerEmail?:string|null;customerPhone?:string|null;customerStreet?:string|null;
  customerPostalCode?:string|null;customerCity?:string|null;vehicleId:string;vehicle:string;plate:string;
  make?:string|null;model?:string|null;variant?:string|null;firstRegistration?:string|null;hsn?:string|null;tsn?:string|null;
  vin?:string|null;mileage?:number|null;photoPath?:string|null;complaint:string;status:string;requestIntent:ServiceRequestIntent;
  desiredStart?:string|null;desiredEnd?:string|null;driveable?:boolean|null;warningLevel?:string|null;createdAt:string;
};

export type WorkshopAppointment={
  id:string;serviceRequestId:string;workOrderId?:string|null;orderNumber?:string|null;startsAt:string;endsAt?:string|null;
  status:string;note?:string|null;rawOrderStage?:string|null;arrivedAt?:string|null;
  cancelledAt?:string|null;cancellationReason?:string|null;cancellationActor?:'customer'|'workshop'|null;
  customerUserId:string;customerName:string;customerEmail?:string|null;customerPhone?:string|null;customerStreet?:string|null;
  customerPostalCode?:string|null;customerCity?:string|null;
  vehicleId:string;vehicle:string;plate:string;make?:string|null;model?:string|null;variant?:string|null;
  firstRegistration?:string|null;hsn?:string|null;tsn?:string|null;vin?:string|null;mileage?:number|null;photoPath?:string|null;
  complaint:string;
};

export type AppNotification={
  id:string;workshopId?:string|null;title:string;body?:string|null;kind:string;workOrderId?:string|null;
  targetType?:string|null;targetId?:string|null;readAt?:string|null;createdAt:string;
};

export async function listWorkshopServiceRequests(workshopId:string):Promise<WorkshopServiceRequest[]>{
  const client=db();
  const {data:requests,error}=await client.from('service_requests')
    .select('id,customer_user_id,vehicle_id,complaint,status,request_intent,desired_start,desired_end,driveable,warning_level,created_at')
    .eq('workshop_id',workshopId).in('status',['submitted','accepted','appointment_pending']).order('created_at',{ascending:true});
  if(error)throw error;
  const rows=(requests??[]) as any[];if(!rows.length)return[];
  const vehicleIds=[...new Set(rows.map(row=>row.vehicle_id))];
  const customerIds=[...new Set(rows.map(row=>row.customer_user_id))];
  const [vehicleResult,profileResult]=await Promise.all([
    client.from('vehicles').select('id,make,model,variant,first_registration,license_plate,hsn,tsn,vin,mileage,photo_path').in('id',vehicleIds),
    client.from('profiles').select('id,full_name,email,phone,street,postal_code,city').in('id',customerIds)
  ]);
  if(vehicleResult.error)throw vehicleResult.error;if(profileResult.error)throw profileResult.error;
  const vehicleMap=new Map(((vehicleResult.data??[]) as any[]).map(v=>[v.id,v]));
  const profileMap=new Map(((profileResult.data??[]) as any[]).map(p=>[p.id,p]));
  return rows.map(row=>{
    const v=vehicleMap.get(row.vehicle_id) as any;
    const p=profileMap.get(row.customer_user_id) as any;
    return{
      id:row.id,customerUserId:row.customer_user_id,customerName:p?.full_name??'Kunde',
      customerEmail:p?.email??null,customerPhone:p?.phone??null,customerStreet:p?.street??null,customerPostalCode:p?.postal_code??null,customerCity:p?.city??null,
      vehicleId:row.vehicle_id,vehicle:v?[v.make,v.model,v.variant].filter(Boolean).join(' '):'Fahrzeug',
      plate:v?.license_plate??'—',make:v?.make??null,model:v?.model??null,variant:v?.variant??null,
      firstRegistration:v?.first_registration??null,hsn:v?.hsn??null,tsn:v?.tsn??null,vin:v?.vin??null,
      mileage:v?.mileage??null,photoPath:v?.photo_path??null,
      complaint:row.complaint,status:row.status,requestIntent:row.request_intent,desiredStart:row.desired_start,desiredEnd:row.desired_end,
      driveable:row.driveable,warningLevel:row.warning_level,createdAt:row.created_at
    };
  });
}

export async function listWorkshopAppointments(workshopId:string):Promise<WorkshopAppointment[]>{
  const client=db();
  const {data:appointments,error}=await client.from('appointments')
    .select('id,service_request_id,starts_at,ends_at,status,note,cancelled_at,cancellation_reason,cancellation_actor')
    .eq('workshop_id',workshopId)
    .in('status',['proposed','confirmed'])
    .order('starts_at',{ascending:true});
  if(error)throw error;
  const rows=(appointments??[]) as any[];if(!rows.length)return[];

  const requestIds=[...new Set(rows.map(row=>row.service_request_id))];
  const {data:requests,error:requestError}=await client.from('service_requests')
    .select('id,customer_user_id,vehicle_id,complaint').in('id',requestIds);
  if(requestError)throw requestError;
  const requestRows=(requests??[]) as any[];
  const customerIds=[...new Set(requestRows.map(row=>row.customer_user_id))];
  const vehicleIds=[...new Set(requestRows.map(row=>row.vehicle_id))];

  const [vehicleResult,profileResult,orderResult]=await Promise.all([
    client.from('vehicles').select('id,make,model,variant,first_registration,license_plate,hsn,tsn,vin,mileage,photo_path').in('id',vehicleIds),
    client.from('profiles').select('id,full_name,email,phone,street,postal_code,city').in('id',customerIds),
    client.from('work_orders').select('id,order_number,service_request_id,stage,arrived_at').eq('workshop_id',workshopId).in('service_request_id',requestIds)
  ]);
  if(vehicleResult.error)throw vehicleResult.error;
  if(profileResult.error)throw profileResult.error;
  if(orderResult.error)throw orderResult.error;

  const requestMap=new Map(requestRows.map(row=>[row.id,row]));
  const vehicleMap=new Map(((vehicleResult.data??[]) as any[]).map(v=>[v.id,v]));
  const profileMap=new Map(((profileResult.data??[]) as any[]).map(p=>[p.id,p]));
  const orderMap=new Map(((orderResult.data??[]) as any[]).map(o=>[o.service_request_id,o]));

  return rows.map(row=>{
    const request=requestMap.get(row.service_request_id) as any;
    const vehicle=vehicleMap.get(request?.vehicle_id) as any;
    const profile=profileMap.get(request?.customer_user_id) as any;
    const order=orderMap.get(row.service_request_id) as any;
    return{
      id:row.id,serviceRequestId:row.service_request_id,workOrderId:order?.id??null,orderNumber:order?.order_number??null,
      startsAt:row.starts_at,endsAt:row.ends_at,status:row.status,note:row.note,rawOrderStage:order?.stage??null,arrivedAt:order?.arrived_at??null,
      cancelledAt:row.cancelled_at??null,cancellationReason:row.cancellation_reason??null,cancellationActor:row.cancellation_actor??null,
      customerUserId:request?.customer_user_id??'',customerName:profile?.full_name??'Kunde',customerEmail:profile?.email??null,customerPhone:profile?.phone??null,
      customerStreet:profile?.street??null,customerPostalCode:profile?.postal_code??null,customerCity:profile?.city??null,
      vehicleId:request?.vehicle_id??'',vehicle:vehicle?[vehicle.make,vehicle.model,vehicle.variant].filter(Boolean).join(' '):'Fahrzeug',
      plate:vehicle?.license_plate??'—',make:vehicle?.make??null,model:vehicle?.model??null,variant:vehicle?.variant??null,
      firstRegistration:vehicle?.first_registration??null,hsn:vehicle?.hsn??null,tsn:vehicle?.tsn??null,vin:vehicle?.vin??null,
      mileage:vehicle?.mileage??null,photoPath:vehicle?.photo_path??null,complaint:request?.complaint??'Keine Fehlerbeschreibung angegeben.'
    } satisfies WorkshopAppointment;
  });
}

export async function listMyWorkshopNotifications(workshopId:string,limit=30):Promise<AppNotification[]>{
  const client=db();
  const {data:auth}=await client.auth.getUser();if(!auth.user)return[];
  const {data,error}=await client.from('notifications')
    .select('id,workshop_id,title,body,kind,work_order_id,target_type,target_id,read_at,created_at')
    .eq('user_id',auth.user.id).eq('workshop_id',workshopId)
    .order('created_at',{ascending:false}).limit(limit);
  if(error)throw error;
  return((data??[]) as any[]).map(n=>({
    id:n.id,workshopId:n.workshop_id,title:n.title,body:n.body,kind:n.kind,workOrderId:n.work_order_id,targetType:n.target_type??null,targetId:n.target_id??null,readAt:n.read_at,createdAt:n.created_at
  }));
}

export async function listMyNotifications(limit=30):Promise<AppNotification[]>{
  const client=db();
  const {data:auth}=await client.auth.getUser();if(!auth.user)return[];
  const {data,error}=await client.from('notifications')
    .select('id,workshop_id,title,body,kind,work_order_id,target_type,target_id,read_at,created_at')
    .eq('user_id',auth.user.id)
    .order('created_at',{ascending:false}).limit(limit);
  if(error)throw error;
  return((data??[]) as any[]).map(n=>({
    id:n.id,workshopId:n.workshop_id,title:n.title,body:n.body,kind:n.kind,workOrderId:n.work_order_id,targetType:n.target_type??null,targetId:n.target_id??null,readAt:n.read_at,createdAt:n.created_at
  }));
}

export async function markNotificationRead(notificationId:string){
  const {error}=await db().from('notifications').update({read_at:new Date().toISOString()}).eq('id',notificationId);
  if(error)throw error;
}

export async function markAllWorkshopNotificationsRead(workshopId:string){
  const client=db();const {data:auth}=await client.auth.getUser();if(!auth.user)return;
  const {error}=await client.from('notifications').update({read_at:new Date().toISOString()})
    .eq('user_id',auth.user.id).eq('workshop_id',workshopId).is('read_at',null);
  if(error)throw error;
}

export function subscribeCustomerOrders(userId:string,onChange:()=>void){
  const client=db();
  let timer:number|undefined;
  const refresh=()=>{
    if(timer)window.clearTimeout(timer);
    timer=window.setTimeout(onChange,120);
  };
  const channel=client.channel('customer:'+userId+':workspace')
    .on('postgres_changes',{event:'*',schema:'public',table:'work_orders',filter:'customer_user_id=eq.'+userId},refresh)
    .on('postgres_changes',{event:'*',schema:'public',table:'service_requests',filter:'customer_user_id=eq.'+userId},refresh)
    .on('postgres_changes',{event:'*',schema:'public',table:'workshop_customer_requests',filter:'customer_user_id=eq.'+userId},refresh)
    .on('postgres_changes',{event:'*',schema:'public',table:'customer_workshop_links',filter:'customer_user_id=eq.'+userId},refresh)
    .on('postgres_changes',{event:'*',schema:'public',table:'vehicles',filter:'owner_user_id=eq.'+userId},refresh)
    .on('postgres_changes',{event:'*',schema:'public',table:'documents',filter:'customer_user_id=eq.'+userId},refresh)
    .on('postgres_changes',{event:'*',schema:'public',table:'notifications',filter:'user_id=eq.'+userId},refresh)
    .on('postgres_changes',{event:'*',schema:'public',table:'appointments'},refresh)
    .on('postgres_changes',{event:'UPDATE',schema:'public',table:'workshops'},refresh)
    .on('postgres_changes',{event:'*',schema:'public',table:'chat_messages'},refresh)
    .on('postgres_changes',{event:'*',schema:'public',table:'chat_threads'},refresh)
    .subscribe(status=>{if(status==='SUBSCRIBED')refresh()});
  return()=>{
    if(timer)window.clearTimeout(timer);
    void client.removeChannel(channel);
  };
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


export type WorkOrderDocument={
  id:string;
  work_order_id:string;
  workshop_id:string;
  customer_user_id?:string|null;
  local_customer_id?:string|null;
  document_type:'quote'|'invoice'|'credit_note'|'other';
  document_number?:string|null;
  title?:string|null;
  currency:string;
  amount_total?:number|null;
  status:'draft'|'published'|'superseded'|'cancelled';
  published_at?:string|null;
  created_at:string;
};

export type DocumentVersion={
  id:string;
  document_id:string;
  version_number:number;
  storage_path:string;
  file_name:string;
  mime_type:string;
  sha256:string;
  byte_size?:number|null;
  invoice_format?:'pdf'|'zugferd'|'xrechnung'|'xml'|'other'|null;
  created_at:string;
};

export async function createDocumentDraft(input:{
  workOrderId:string;
  documentType:'quote'|'invoice'|'credit_note'|'other';
  documentNumber:string;
  title:string;
  amountTotal?:number|null;
  currency?:string;
}){
  const {data,error}=await db().rpc('create_document_draft',{
    p_work_order_id:input.workOrderId,
    p_document_type:input.documentType,
    p_document_number:input.documentNumber.trim(),
    p_title:input.title.trim(),
    p_amount_total:input.amountTotal??null,
    p_currency:input.currency??'EUR'
  });
  if(error)throw error;
  return data as WorkOrderDocument;
}

export async function listWorkOrderDocuments(workOrderId:string){
  const client=db();
  const {data:documents,error}=await client.from('documents')
    .select('*').eq('work_order_id',workOrderId).order('created_at',{ascending:false});
  if(error)throw error;
  const docs=(documents??[]) as WorkOrderDocument[];
  if(!docs.length)return[] as Array<WorkOrderDocument&{versions:DocumentVersion[]}>;
  const ids=docs.map(item=>item.id);
  const {data:versions,error:versionError}=await client.from('document_versions')
    .select('*').in('document_id',ids).order('version_number',{ascending:false});
  if(versionError)throw versionError;
  const grouped=new Map<string,DocumentVersion[]>();
  for(const version of (versions??[]) as DocumentVersion[]){
    grouped.set(version.document_id,[...(grouped.get(version.document_id)??[]),version]);
  }
  return docs.map(document=>({...document,versions:grouped.get(document.id)??[]}));
}

export async function listMyCustomerDocuments(){
  const client=db();
  const {data:auth}=await client.auth.getUser();
  if(!auth.user)return[] as Array<WorkOrderDocument&{versions:DocumentVersion[]}>;
  const {data:documents,error}=await client.from('documents')
    .select('*')
    .eq('customer_user_id',auth.user.id)
    .eq('status','published')
    .order('created_at',{ascending:false});
  if(error)throw error;
  const docs=(documents??[]) as WorkOrderDocument[];
  if(!docs.length)return[] as Array<WorkOrderDocument&{versions:DocumentVersion[]}>;
  const ids=docs.map(item=>item.id);
  const {data:versions,error:versionError}=await client.from('document_versions')
    .select('*').in('document_id',ids).order('version_number',{ascending:false});
  if(versionError)throw versionError;
  const grouped=new Map<string,DocumentVersion[]>();
  for(const version of (versions??[]) as DocumentVersion[]){
    grouped.set(version.document_id,[...(grouped.get(version.document_id)??[]),version]);
  }
  return docs.map(document=>({...document,versions:grouped.get(document.id)??[]}));
}

export async function getDocumentVersionUrl(storagePath:string,expiresIn=300){
  const {data,error}=await db().storage.from('documents').createSignedUrl(storagePath,expiresIn);
  if(error)throw error;
  return data.signedUrl;
}

export async function uploadOfficialDocument(input:{
  workOrderId:string;
  workshopId:string;
  documentType:'quote'|'invoice';
  documentNumber:string;
  title:string;
  amountTotal:number;
  file:File;
  invoiceFormat?:'pdf'|'zugferd'|'xrechnung'|'xml'|'other';
}){
  const document=await createDocumentDraft({
    workOrderId:input.workOrderId,documentType:input.documentType,documentNumber:input.documentNumber,
    title:input.title,amountTotal:input.amountTotal,currency:'EUR'
  });
  const versionId=crypto.randomUUID();
  try{
    await uploadDocumentVersion({
      workshopId:input.workshopId,documentId:document.id,versionId,versionNumber:1,file:input.file,
      invoiceFormat:input.invoiceFormat
    });
    const published=await publishDocument(document.id);
    return published as WorkOrderDocument;
  }catch(error){
    throw error;
  }
}


export type WorkshopCustomerDirectoryItem={
  customerId?:string|null;linkedUserId?:string|null;customerName:string;phone?:string|null;email?:string|null;
  street?:string|null;postalCode?:string|null;city?:string|null;vehicleId:string;make:string;model:string;variant?:string|null;
  licensePlate:string;vin?:string|null;mileage?:number|null;ownerUserId?:string|null;identityVerifiedAt?:string|null;
  lastHistoryAt?:string|null;historyCount:number;
};

export type VehicleHistoryEntry={
  id:string;entryType:'diagnosis'|'repair'|'maintenance'|'inspection'|'service'|'note';title:string;
  summary?:string|null;mileage?:number|null;occurredAt:string;workshopName:string;workOrderId?:string|null;orderNumber?:string|null;
};

export type VehicleClaimPreview={
  vehicleId:string;make:string;model:string;variant?:string|null;licensePlate:string;workshopName:string;
  claimMode:'onboarding'|'transfer';expiresAt:string;valid:boolean;
};

export type VehicleClaimLookup={
  existsInMotorAtlas:boolean;alreadyMine:boolean;vehicleId?:string|null;make?:string|null;model?:string|null;
  variant?:string|null;licensePlate?:string|null;previousOwnerReleased:boolean;
};

export type MyVehicleClaimRequest={
  id:string;status:'pending'|'approved'|'rejected'|'cancelled';vehicleId:string;make:string;model:string;
  variant?:string|null;licensePlate:string;evidenceUploaded:boolean;reviewNote?:string|null;createdAt:string;reviewedAt?:string|null;
};

export type SupportVehicleClaimRequest={
  id:string;status:'pending'|'approved'|'rejected'|'cancelled';claimantUserId:string;claimantName?:string|null;
  claimantEmail?:string|null;claimantNote?:string|null;vehicleId:string;make:string;model:string;variant?:string|null;
  licensePlate:string;vin:string;evidencePath?:string|null;createdAt:string;reviewedAt?:string|null;reviewNote?:string|null;
};

export async function listWorkshopCustomerDirectory(workshopId:string,search=''):Promise<WorkshopCustomerDirectoryItem[]>{
  const {data,error}=await db().rpc('list_workshop_customer_directory',{p_workshop_id:workshopId,p_search:search.trim()||null});
  if(error)throw error;
  return((data??[]) as any[]).map(row=>({
    customerId:row.customer_id??null,linkedUserId:row.linked_user_id??null,customerName:row.customer_name??'Kunde',
    phone:row.phone??null,email:row.email??null,street:row.street??null,postalCode:row.postal_code??null,city:row.city??null,
    vehicleId:row.vehicle_id,make:row.make??'',model:row.model??'',variant:row.variant??null,licensePlate:row.license_plate??'—',
    vin:row.vin??null,mileage:row.mileage??null,ownerUserId:row.owner_user_id??null,identityVerifiedAt:row.identity_verified_at??null,
    lastHistoryAt:row.last_history_at??null,historyCount:Number(row.history_count??0)
  }));
}

export async function createWorkshopCustomerVehicle(input:{
  workshopId:string;fullName:string;phone?:string;email?:string;street?:string;postalCode?:string;city?:string;
  make:string;model:string;variant?:string;firstRegistration?:string;licensePlate:string;hsn?:string;tsn?:string;vin?:string;
  mileage?:number|null;typeVariantVersion?:string;engineCode?:string;displacementCcm?:number|null;powerKw?:number|null;
  fuelType?:string;transmissionCode?:string;driveType?:string;
}){
  const {data,error}=await db().rpc('create_workshop_customer_vehicle',{
    p_workshop_id:input.workshopId,p_full_name:input.fullName.trim(),p_phone:input.phone?.trim()||null,
    p_email:input.email?.trim().toLowerCase()||null,p_street:input.street?.trim()||null,p_postal_code:input.postalCode?.trim()||null,
    p_city:input.city?.trim()||null,p_make:input.make.trim(),p_model:input.model.trim(),p_variant:input.variant?.trim()||null,
    p_first_registration:input.firstRegistration||null,p_license_plate:input.licensePlate.trim().toUpperCase(),p_hsn:input.hsn?.trim()||null,
    p_tsn:input.tsn?.trim().toUpperCase()||null,p_vin:input.vin?.trim().toUpperCase()||null,p_mileage:input.mileage??null,
    p_type_variant_version:input.typeVariantVersion?.trim()||null,p_engine_code:input.engineCode?.trim().toUpperCase()||null,
    p_displacement_ccm:input.displacementCcm??null,p_power_kw:input.powerKw??null,p_fuel_type:input.fuelType?.trim()||null,
    p_transmission_code:input.transmissionCode?.trim().toUpperCase()||null,p_drive_type:input.driveType?.trim()||null
  });
  if(error){
    const message=error.message.includes('vehicle_already_known_to_workshop')
      ?'Dieses Fahrzeug ist über die FIN bereits in deiner Werkstattakte vorhanden. Öffne den bestehenden Datensatz statt einen zweiten anzulegen.'
      :error.message.includes('vehicle_exists_claim_required')
        ?'Zu dieser FIN existiert bereits ein MotorAtlas-Fahrzeug. Aus Datenschutzgründen kann es hier nicht neu verknüpft werden. Nutze eine geprüfte Fahrzeugübernahme.'
        :error.message.includes('vehicles_vin_unique_idx')||error.message.includes('duplicate key')
          ?'Diese FIN/VIN ist bereits einem Fahrzeug in MotorAtlas zugeordnet.'
          :error.message.includes('customer_name_required')
        ?'Bitte den Kundennamen eintragen.'
        :error.message.includes('license_plate_required')
          ?'Bitte das Kennzeichen eintragen.'
          :error.message;
    throw new Error(message);
  }
  return Array.isArray(data)?data[0]:data;
}

export async function createWalkInWorkOrder(input:{
  workshopId:string;vehicleId:string;customerId?:string|null;problem:string;
  workflowPath:ServiceRequestIntent;invoiceRequired?:boolean;
}){
  const {data,error}=await db().rpc('create_walk_in_work_order',{
    p_workshop_id:input.workshopId,p_vehicle_id:input.vehicleId,p_customer_id:input.customerId??null,
    p_problem:input.problem.trim()||null,p_workflow_path:input.workflowPath,p_invoice_required:input.invoiceRequired??true
  });
  if(error){
    const message=error.message.includes('vehicle_has_active_work_order')
      ?'Für dieses Fahrzeug läuft bereits ein aktiver Werkstattauftrag.'
      :error.message.includes('customer_vehicle_not_linked')
        ?'Kunde und Fahrzeug sind in dieser Werkstattakte nicht miteinander verknüpft.'
        :error.message.includes('not_authorized')
          ?'Du darfst für dieses Fahrzeug keinen Auftrag anlegen.'
          :error.message;
    throw new Error(message);
  }
  return data;
}

export async function getVehicleHistory(vehicleId:string):Promise<VehicleHistoryEntry[]>{
  const {data,error}=await db().rpc('get_vehicle_history',{p_vehicle_id:vehicleId});
  if(error)throw error;
  return((data??[]) as any[]).map(row=>({
    id:row.id,entryType:row.entry_type,title:row.title,summary:row.summary??null,mileage:row.mileage??null,
    occurredAt:row.occurred_at,workshopName:row.workshop_name,workOrderId:row.work_order_id??null,orderNumber:row.order_number??null
  }));
}

export async function addVehicleHistoryEntry(input:{
  vehicleId:string;workshopId:string;entryType:VehicleHistoryEntry['entryType'];title:string;summary?:string;
  mileage?:number|null;occurredAt?:string;
}){
  const {data,error}=await db().rpc('add_vehicle_history_entry',{
    p_vehicle_id:input.vehicleId,p_workshop_id:input.workshopId,p_entry_type:input.entryType,p_title:input.title.trim(),
    p_summary:input.summary?.trim()||null,p_mileage:input.mileage??null,p_occurred_at:input.occurredAt||new Date().toISOString()
  });
  if(error)throw error;return data;
}

export async function lookupVehicleForClaim(vin:string):Promise<VehicleClaimLookup>{
  const {data,error}=await db().rpc('lookup_vehicle_for_claim',{p_vin:vin.trim().toUpperCase()});
  if(error){
    if(error.message.includes('invalid_vin'))throw new Error('Bitte eine gültige 17-stellige FIN/VIN eingeben.');
    throw error;
  }
  const row=(Array.isArray(data)?data[0]:data) as any;
  return{
    existsInMotorAtlas:Boolean(row?.exists_in_motoratlas),
    alreadyMine:Boolean(row?.already_mine),
    vehicleId:row?.vehicle_id??null,
    make:row?.make??null,
    model:row?.model??null,
    variant:row?.variant??null,
    licensePlate:row?.license_plate??null,
    previousOwnerReleased:Boolean(row?.previous_owner_released)
  };
}

export async function createOwnerVehicleTransferToken(vehicleId:string):Promise<{token:string;expiresAt:string}>{
  const {data,error}=await db().rpc('create_owner_vehicle_transfer_token',{p_vehicle_id:vehicleId});
  if(error){
    const message=error.message.includes('vehicle_has_active_work_order')
      ?'Das Fahrzeug hat noch einen aktiven Werkstattauftrag. Schließe ihn zuerst ab.'
      :error.message.includes('vehicle_has_active_request')
        ?'Für das Fahrzeug läuft noch eine Werkstattanfrage. Beende sie zuerst.'
        :error.message.includes('vehicle_not_found')
          ?'Das Fahrzeug wurde nicht gefunden oder gehört nicht zu deinem Konto.'
          :error.message;
    throw new Error(message);
  }
  const row=(Array.isArray(data)?data[0]:data) as any;
  return{token:row.token,expiresAt:row.expires_at};
}

export async function createVerifiedVehicleTransferToken(workshopId:string,vin:string):Promise<{
  token:string;expiresAt:string;vehicleId:string;make:string;model:string;variant?:string|null;licensePlate:string;
}>{
  const {data,error}=await db().rpc('create_verified_vehicle_transfer_token',{
    p_workshop_id:workshopId,p_vin:vin.trim().toUpperCase()
  });
  if(error){
    const message=error.message.includes('active_owner_requires_release_or_support')
      ?'Das Fahrzeug ist noch einem aktiven MotorAtlas-Konto zugeordnet. Der bisherige Nutzer muss es freigeben oder der neue Besitzer nutzt die Supportprüfung mit Kaufvertrag.'
      :error.message.includes('vehicle_not_found')
        ?'Zu dieser FIN ist kein MotorAtlas-Fahrzeug vorhanden.'
        :error.message.includes('invalid_vin')
          ?'Bitte die vollständige 17-stellige FIN eingeben.'
          :error.message.includes('not_authorized')
            ?'Du bist für Besitzerwechsel-Prüfungen nicht berechtigt.'
            :error.message;
    throw new Error(message);
  }
  const row=(Array.isArray(data)?data[0]:data) as any;
  return{
    token:row.token,expiresAt:row.expires_at,vehicleId:row.vehicle_id,make:row.make,model:row.model,
    variant:row.variant??null,licensePlate:row.license_plate
  };
}

export async function createSupportVehicleClaim(vin:string,note?:string):Promise<{
  claimId:string;vehicleId:string;make:string;model:string;variant?:string|null;licensePlate:string;
}>{
  const {data,error}=await db().rpc('create_support_vehicle_claim',{p_vin:vin.trim().toUpperCase(),p_note:note?.trim()||null});
  if(error){
    const message=error.message.includes('vehicle_already_mine')
      ?'Dieses Fahrzeug gehört bereits zu deiner MotorAtlas-Garage.'
      :error.message.includes('vehicle_not_found')
        ?'Zu dieser FIN ist kein Fahrzeug in MotorAtlas vorhanden.'
        :error.message.includes('invalid_vin')
          ?'Bitte die vollständige 17-stellige FIN eingeben.'
          :error.message;
    throw new Error(message);
  }
  const row=(Array.isArray(data)?data[0]:data) as any;
  return{
    claimId:row.claim_id,vehicleId:row.vehicle_id,make:row.make,model:row.model,
    variant:row.variant??null,licensePlate:row.license_plate
  };
}

export async function uploadSupportVehicleClaimEvidence(claimId:string,file:File){
  if(!['application/pdf','image/jpeg','image/png','image/webp'].includes(file.type)){
    throw new Error('Bitte Kaufvertrag als PDF, JPG, PNG oder WebP hochladen.');
  }
  if(file.size>15*1024*1024)throw new Error('Die Datei darf maximal 15 MB groß sein.');
  const client=db();
  const {data:auth}=await client.auth.getUser();
  if(!auth.user)throw new Error('Bitte zuerst anmelden.');
  const safeName=file.name.replace(/[^a-zA-Z0-9._-]+/g,'_');
  const path=`${auth.user.id}/${claimId}/${Date.now()}-${safeName}`;
  const {error:uploadError}=await client.storage.from('vehicle-claim-evidence').upload(path,file,{upsert:false,contentType:file.type});
  if(uploadError)throw uploadError;
  const {error}=await client.rpc('attach_support_vehicle_claim_evidence',{p_claim_id:claimId,p_storage_path:path});
  if(error){
    await client.storage.from('vehicle-claim-evidence').remove([path]);
    throw error;
  }
  return path;
}

export async function listMyVehicleClaimRequests():Promise<MyVehicleClaimRequest[]>{
  const {data,error}=await db().rpc('list_my_vehicle_claim_requests');
  if(error)throw error;
  return((data??[]) as any[]).map(row=>({
    id:row.id,status:row.status,vehicleId:row.vehicle_id,make:row.make,model:row.model,variant:row.variant??null,
    licensePlate:row.license_plate,evidenceUploaded:Boolean(row.evidence_uploaded),reviewNote:row.review_note??null,
    createdAt:row.created_at,reviewedAt:row.reviewed_at??null
  }));
}

export async function isSupportAdmin(){
  const {data,error}=await db().rpc('is_support_admin');
  if(error)return false;
  return Boolean(data);
}

export async function listSupportVehicleClaimRequests():Promise<SupportVehicleClaimRequest[]>{
  const {data,error}=await db().rpc('list_support_vehicle_claim_requests');
  if(error)throw error;
  return((data??[]) as any[]).map(row=>({
    id:row.id,status:row.status,claimantUserId:row.claimant_user_id,claimantName:row.claimant_name??null,
    claimantEmail:row.claimant_email??null,claimantNote:row.claimant_note??null,vehicleId:row.vehicle_id,
    make:row.make,model:row.model,variant:row.variant??null,licensePlate:row.license_plate,vin:row.vin,
    evidencePath:row.evidence_path??null,createdAt:row.created_at,reviewedAt:row.reviewed_at??null,reviewNote:row.review_note??null
  }));
}

export async function getSupportVehicleClaimEvidenceUrl(path:string,expiresIn=900){
  const {data,error}=await db().storage.from('vehicle-claim-evidence').createSignedUrl(path,expiresIn);
  if(error)throw error;
  return data.signedUrl;
}

export async function reviewSupportVehicleClaim(claimId:string,decision:'approved'|'rejected',reviewNote?:string){
  const {data,error}=await db().rpc('review_support_vehicle_claim',{
    p_claim_id:claimId,p_decision:decision,p_review_note:reviewNote?.trim()||null
  });
  if(error){
    const message=error.message.includes('evidence_required')
      ?'Vor der Freigabe muss ein Kaufvertrag oder anderer Nachweis hochgeladen sein.'
      :error.message.includes('claim_not_pending')
        ?'Dieser Antrag wurde bereits bearbeitet.'
        :error.message.includes('not_authorized')
          ?'Nur MotorAtlas Support darf diese Prüfung abschließen.'
          :error.message;
    throw new Error(message);
  }
  return data;
}

export async function createVehicleClaimToken(input:{
  vehicleId:string;workshopId:string;customerId?:string|null;claimMode?:'onboarding'|'transfer';
}):Promise<{token:string;expiresAt:string}>{
  const {data,error}=await db().rpc('create_vehicle_claim_token',{
    p_vehicle_id:input.vehicleId,p_workshop_id:input.workshopId,p_customer_id:input.customerId??null,p_claim_mode:input.claimMode??'onboarding'
  });
  if(error){
    const message=error.message.includes('vehicle_already_claimed')
      ?'Das Fahrzeug ist bereits einem MotorAtlas-Konto zugeordnet.'
      :error.message.includes('active_owner_must_release_vehicle')
        ?'Der bisherige MotorAtlas-Besitzer muss das Fahrzeug zuerst als verkauft aus seiner Garage nehmen.'
        :error.message;
    throw new Error(message);
  }
  const row=(Array.isArray(data)?data[0]:data) as any;
  return{token:row.token,expiresAt:row.expires_at};
}

export async function getVehicleClaimPreview(token:string):Promise<VehicleClaimPreview|null>{
  const {data,error}=await db().rpc('get_vehicle_claim_preview',{p_token:token});
  if(error)throw error;
  const row=(Array.isArray(data)?data[0]:data) as any;
  if(!row)return null;
  return{
    vehicleId:row.vehicle_id,make:row.make??'',model:row.model??'',variant:row.variant??null,licensePlate:row.license_plate??'—',
    workshopName:row.workshop_name??'Werkstatt',claimMode:row.claim_mode,expiresAt:row.expires_at,valid:Boolean(row.valid)
  };
}

export async function claimVehicleWithToken(token:string){
  const {data,error}=await db().rpc('claim_vehicle_with_token',{p_token:token});
  if(error){
    const message=error.message.includes('claim_expired')
      ?'Dieser QR-Code ist abgelaufen. Bitte lass dir von der Werkstatt einen neuen erzeugen.'
      :error.message.includes('claim_already_used')
        ?'Dieser QR-Code wurde bereits verwendet.'
        :error.message.includes('claim_revoked')
          ?'Dieser QR-Code wurde von der Werkstatt ersetzt oder widerrufen.'
          :error.message.includes('vehicle_has_active_owner')
            ?'Das Fahrzeug ist noch einem anderen aktiven MotorAtlas-Konto zugeordnet.'
            :error.message.includes('claim_not_found')
              ?'Dieser Fahrzeug-Code ist ungültig.'
              :error.message;
    throw new Error(message);
  }
  return data;
}

export type CustomerProfile={
  id:string;fullName:string;email?:string|null;phone?:string|null;street?:string|null;postalCode?:string|null;city?:string|null;countryCode:string;
};

export async function getMyProfile():Promise<CustomerProfile>{
  const client=db();const {data:auth}=await client.auth.getUser();if(!auth.user)throw new Error('Bitte zuerst anmelden.');
  const {data,error}=await client.from('profiles')
    .select('id,full_name,email,phone,street,postal_code,city,country_code')
    .eq('id',auth.user.id).single();
  if(error)throw error;
  return{
    id:data.id,fullName:data.full_name,email:data.email,phone:data.phone,street:data.street,postalCode:data.postal_code,
    city:data.city,countryCode:data.country_code??'DE'
  };
}

export async function updateMyProfile(input:{fullName:string;phone?:string;street:string;postalCode:string;city:string}){
  const client=db();const {data:auth}=await client.auth.getUser();if(!auth.user)throw new Error('Bitte zuerst anmelden.');
  const {data,error}=await client.from('profiles').update({
    full_name:input.fullName.trim(),phone:input.phone?.trim()||null,street:input.street.trim(),
    postal_code:input.postalCode.trim(),city:input.city.trim()
  }).eq('id',auth.user.id).select().single();
  if(error)throw error;return data;
}

export async function createVehicleWithPhoto(input:{
  make:string;model:string;variant?:string;firstRegistration?:string;licensePlate:string;
  hsn?:string;tsn?:string;vin?:string;mileage?:number;photo:File;
}){
  if(!input.photo.type.startsWith('image/'))throw new Error('Ein Fahrzeugbild ist erforderlich.');
  const client=db();const {data:auth}=await client.auth.getUser();if(!auth.user)throw new Error('Not signed in');
  const vehicleId=crypto.randomUUID(),safeName=input.photo.name.replace(/[^a-zA-Z0-9._-]+/g,'_');
  const path=auth.user.id+'/'+vehicleId+'/'+safeName;
  const {error:uploadError}=await client.storage.from('vehicle-images').upload(path,input.photo,{upsert:false,contentType:input.photo.type});
  if(uploadError)throw uploadError;
  try{
    const {data,error}=await client.from('vehicles').insert({
      id:vehicleId,owner_user_id:auth.user.id,make:input.make.trim(),model:input.model.trim(),
      variant:input.variant?.trim()||null,first_registration:input.firstRegistration||null,
      license_plate:input.licensePlate.trim().toUpperCase(),hsn:input.hsn?.trim()||null,tsn:input.tsn?.trim()||null,
      vin:input.vin?.trim().toUpperCase()||null,mileage:input.mileage??null,photo_path:path
    }).select().single();
    if(error)throw error;return data;
  }catch(error){await client.storage.from('vehicle-images').remove([path]);throw error}
}

export async function archiveMyVehicle(vehicleId:string){
  const {data,error}=await db().rpc('archive_my_vehicle',{p_vehicle_id:vehicleId});
  if(error){
    const message=error.message.includes('vehicle_has_active_work_order')
      ?'Das Fahrzeug hat noch einen aktiven Werkstattauftrag und kann noch nicht als verkauft markiert werden.'
      :error.message.includes('vehicle_has_active_request')
        ?'Für dieses Fahrzeug läuft noch eine Werkstattanfrage.'
        :error.message.includes('vehicle_has_active_appointment')
          ?'Für dieses Fahrzeug besteht noch ein offener Termin.'
          :error.message.includes('vehicle_not_found')
            ?'Das Fahrzeug wurde nicht gefunden.'
            :error.message;
    throw new Error(message);
  }
  return data;
}

export async function updateMyVehicle(input:{
  vehicleId:string;make:string;model:string;variant?:string|null;firstRegistration?:string|null;
  licensePlate:string;hsn?:string|null;tsn?:string|null;vin?:string|null;mileage?:number|null;
  typeVariantVersion?:string|null;engineCode?:string|null;displacementCcm?:number|null;powerKw?:number|null;
  fuelType?:string|null;transmissionCode?:string|null;driveType?:string|null;
}){
  const {data,error}=await db().rpc('update_my_vehicle',{
    p_vehicle_id:input.vehicleId,p_make:input.make.trim(),p_model:input.model.trim(),
    p_variant:input.variant?.trim()||null,p_first_registration:input.firstRegistration||null,
    p_license_plate:input.licensePlate.trim().toUpperCase(),p_hsn:input.hsn?.trim()||null,
    p_tsn:input.tsn?.trim().toUpperCase()||null,p_vin:input.vin?.trim().toUpperCase()||null,
    p_mileage:input.mileage??null,p_type_variant_version:input.typeVariantVersion?.trim()||null,
    p_engine_code:input.engineCode?.trim().toUpperCase()||null,p_displacement_ccm:input.displacementCcm??null,
    p_power_kw:input.powerKw??null,p_fuel_type:input.fuelType?.trim()||null,
    p_transmission_code:input.transmissionCode?.trim().toUpperCase()||null,p_drive_type:input.driveType?.trim()||null
  });
  if(error){
    const message=error.message.includes('vehicle_not_found')
      ?'Das Fahrzeug wurde nicht gefunden oder gehört nicht zu deinem Konto.'
      :error.message.includes('make_and_model_required')
        ?'Hersteller und Modell müssen angegeben werden.'
        :error.message.includes('license_plate_required')
          ?'Das Kennzeichen muss angegeben werden.'
          :error.message;
    throw new Error(message);
  }
  return data;
}

export async function updateVehicleIdentityAsWorkshop(input:{
  vehicleId:string;workOrderId:string;make:string;model:string;variant?:string|null;firstRegistration?:string|null;
  licensePlate:string;hsn?:string|null;tsn?:string|null;vin?:string|null;mileage?:number|null;
  typeVariantVersion?:string|null;engineCode?:string|null;displacementCcm?:number|null;powerKw?:number|null;
  fuelType?:string|null;transmissionCode?:string|null;driveType?:string|null;
}){
  const {data,error}=await db().rpc('update_vehicle_identity_as_workshop',{
    p_vehicle_id:input.vehicleId,p_work_order_id:input.workOrderId,p_make:input.make.trim(),p_model:input.model.trim(),
    p_variant:input.variant?.trim()||null,p_first_registration:input.firstRegistration||null,
    p_license_plate:input.licensePlate.trim().toUpperCase(),p_hsn:input.hsn?.trim()||null,p_tsn:input.tsn?.trim().toUpperCase()||null,
    p_vin:input.vin?.trim().toUpperCase()||null,p_mileage:input.mileage??null,
    p_type_variant_version:input.typeVariantVersion?.trim()||null,p_engine_code:input.engineCode?.trim().toUpperCase()||null,
    p_displacement_ccm:input.displacementCcm??null,p_power_kw:input.powerKw??null,p_fuel_type:input.fuelType?.trim()||null,
    p_transmission_code:input.transmissionCode?.trim().toUpperCase()||null,p_drive_type:input.driveType?.trim()||null
  });
  if(error){
    const message=error.message.includes('vehicle_not_checked_in')
      ?'Fahrzeugdaten dürfen erst geändert werden, nachdem das Fahrzeug als eingetroffen erfasst wurde.'
      :error.message.includes('vehicle_not_in_workshop')
        ?'Das Fahrzeug befindet sich nicht mehr in einem aktiven Werkstattvorgang.'
        :error.message.includes('not_authorized')
          ?'Du bist für Änderungen an Fahrzeugdaten nicht berechtigt.'
          :error.message.includes('work_order_vehicle_mismatch')
            ?'Auftrag und Fahrzeug passen nicht zusammen.'
            :error.message;
    throw new Error(message);
  }
  return data;
}

export async function getVehicleImageUrl(path:string,expiresIn=900){
  const {data,error}=await db().storage.from('vehicle-images').createSignedUrl(path,expiresIn);
  if(error)throw error;return data.signedUrl;
}

export async function uploadWorkshopLogo(input:{workshopId:string;file:File;primary:string;secondary:string;soft:string;rgb:string}){
  if(!input.file.type.startsWith('image/'))throw new Error('Bitte eine Bilddatei auswählen.');
  const client=db(),safeName=input.file.name.replace(/[^a-zA-Z0-9._-]+/g,'_');
  const path=input.workshopId+'/logo/'+crypto.randomUUID()+'-'+safeName;
  const {error:uploadError}=await client.storage.from('workshop-branding').upload(path,input.file,{upsert:false,contentType:input.file.type});
  if(uploadError)throw uploadError;
  const {data,error}=await client.from('workshops').update({
    logo_path:path,brand_primary:input.primary,brand_secondary:input.secondary,brand_soft:input.soft,brand_rgb:input.rgb
  }).eq('id',input.workshopId).select().single();
  if(error){await client.storage.from('workshop-branding').remove([path]);throw error}
  return data;
}

export async function updateWorkshopProfile(input:{
  workshopId:string;name:string;legalName?:string;street:string;postalCode:string;city:string;
  phone?:string;email?:string;website?:string;chatEnabled:boolean;description?:string;operatingMode:'solo'|'team';acceptsNewCustomers:boolean;services?:string[];
}){
  const client=db();
  const {data,error}=await client.from('workshops').update({
    name:input.name.trim(),legal_name:input.legalName?.trim()||null,street:input.street.trim(),
    postal_code:input.postalCode.trim(),city:input.city.trim(),phone:input.phone?.trim()||null,
    email:input.email?.trim()||null,website:input.website?.trim()||null,chat_enabled:input.chatEnabled,description:input.description?.trim()||null,
    operating_mode:input.operatingMode,accepts_new_customers:input.acceptsNewCustomers,
    services:input.services??[]
  }).eq('id',input.workshopId).select().single();
  if(error)throw error;
  try{await client.functions.invoke('geocode-workshop',{body:{workshopId:input.workshopId}})}catch{}
  return data;
}

export type PublicWorkshop={
  id:string;slug:string;name:string;street:string;postal_code:string;city:string;description?:string|null;
  services?:unknown;opening_hours?:unknown;logo_path?:string|null;brand_primary?:string|null;
  accepts_new_customers:boolean;latitude?:number|null;longitude?:number|null;verified_at:string;
  master_workshop_verified_at?:string|null;master_workshop_title?:string|null;
};

export async function listPublicWorkshops(){
  const {data,error}=await db().from('workshops')
    .select('id,slug,name,street,postal_code,city,description,services,opening_hours,logo_path,brand_primary,accepts_new_customers,latitude,longitude,verified_at,master_workshop_verified_at,master_workshop_title')
    .eq('listed_publicly',true).not('verified_at','is',null).order('name',{ascending:true});
  if(error)throw error;return(data??[]) as PublicWorkshop[];
}

export function getWorkshopLogoPublicUrl(path:string){
  return db().storage.from('workshop-branding').getPublicUrl(path).data.publicUrl;
}

export function hasWorkshopCoordinates(workshop:Pick<PublicWorkshop,'latitude'|'longitude'>){
  if(workshop.latitude==null||workshop.longitude==null)return false;
  const lat=Number(workshop.latitude),lng=Number(workshop.longitude);
  return Number.isFinite(lat)&&Number.isFinite(lng)&&lat>=47&&lat<=56&&lng>=5&&lng<=16;
}

export async function geocodePublicWorkshop(workshop:PublicWorkshop){
  if(hasWorkshopCoordinates(workshop))return{latitude:Number(workshop.latitude),longitude:Number(workshop.longitude)};
  const address=[workshop.street,workshop.postal_code,workshop.city,'Deutschland'].filter(Boolean).join(', ');
  const key='motoratlas_geocode:'+address.toLowerCase();
  try{
    const cached=localStorage.getItem(key);
    if(cached){
      const parsed=JSON.parse(cached);
      if(Number.isFinite(Number(parsed.latitude))&&Number.isFinite(Number(parsed.longitude)))return parsed;
    }
  }catch{}

  try{
    const {data,error}=await db().functions.invoke('geocode-workshop',{body:{workshopId:workshop.id}});
    if(!error&&data&&Number.isFinite(Number(data.latitude))&&Number.isFinite(Number(data.longitude))){
      const value={latitude:Number(data.latitude),longitude:Number(data.longitude)};
      try{localStorage.setItem(key,JSON.stringify(value))}catch{}
      return value;
    }
  }catch{}

  const endpoint=new URL('https://nominatim.openstreetmap.org/search');
  endpoint.searchParams.set('format','jsonv2');
  endpoint.searchParams.set('limit','1');
  endpoint.searchParams.set('countrycodes','de');
  endpoint.searchParams.set('q',address);
  const response=await fetch(endpoint.toString(),{headers:{'Accept':'application/json','Accept-Language':'de'}});
  if(!response.ok)throw new Error('Adresse konnte nicht geocodiert werden.');
  const result=(await response.json()) as Array<{lat?:string;lon?:string}>;
  const latitude=Number(result[0]?.lat),longitude=Number(result[0]?.lon);
  if(!Number.isFinite(latitude)||!Number.isFinite(longitude))throw new Error('Adresse wurde nicht gefunden.');
  const value={latitude,longitude};
  try{localStorage.setItem(key,JSON.stringify(value))}catch{}
  return value;
}

export async function listPendingCustomerRequests(workshopId:string){
  const client=db();
  const {data,error}=await client.from('workshop_customer_requests')
    .select('id,customer_user_id,message,status,created_at')
    .eq('workshop_id',workshopId).eq('status','pending').order('created_at',{ascending:true});
  if(error)throw error;
  const rows=(data??[]) as any[];if(!rows.length)return[];
  const ids=[...new Set(rows.map(row=>row.customer_user_id))];
  const {data:profiles,error:profileError}=await client.from('profiles')
    .select('id,full_name,email,phone,street,postal_code,city').in('id',ids);
  if(profileError)throw profileError;
  const map=new Map(((profiles??[]) as any[]).map(profile=>[profile.id,profile]));
  return rows.map(row=>({ ...row, profile:map.get(row.customer_user_id)??null }));
}


export async function getWorkshopProfile(workshopId:string){
  const {data,error}=await db().from('workshops')
    .select('id,name,legal_name,street,postal_code,city,phone,email,website,chat_enabled,description,services,operating_mode,accepts_new_customers,logo_path,brand_primary,brand_secondary,brand_soft,brand_rgb,listed_publicly,verified_at,verification_status,verification_mode,verification_requested_at,verification_review_note')
    .eq('id',workshopId).single();
  if(error)throw error;return data;
}

export type WorkshopVerificationDocument={
  id:string;
  workshop_id:string;
  uploaded_by:string;
  document_type:'business_registration'|'handwerksrolle'|'climate_certificate'|'meisterbrief'|'industriemeister'|'techniker'|'other';
  storage_path:string;
  file_name:string;
  mime_type:string;
  sha256?:string|null;
  detected_title?:string|null;
  detected_field?:string|null;
  detected_holder_name?:string|null;
  detected_issuer?:string|null;
  detected_awarded_at?:string|null;
  recognition_class:'unreviewed'|'direct_match'|'conditional_match'|'qualification_only'|'not_recognized';
  recognition_note?:string|null;
  ocr_confidence?:number|null;
  analysis_json?:Record<string,unknown>|null;
  review_status:'pending'|'accepted'|'needs_info'|'rejected';
  reviewed_at?:string|null;
  created_at:string;
};

async function sha256Hex(file:File){
  const hash=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());
  return Array.from(new Uint8Array(hash)).map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

export async function uploadWorkshopVerificationDocument(input:{
  workshopId:string;
  file:File;
  documentType:WorkshopVerificationDocument['document_type'];
  analysis?:{
    detectedTitle?:string;
    detectedField?:string;
    detectedHolderName?:string;
    detectedIssuer?:string;
    detectedAwardedAt?:string|null;
    recognitionClass?:WorkshopVerificationDocument['recognition_class'];
    note?:string;
    confidence?:number|null;
    tradeScopes?:string[];
  };
}){
  const client=db();
  const {data:auth,error:authError}=await client.auth.getUser();
  if(authError)throw authError;
  if(!auth.user)throw new Error('Bitte zuerst anmelden.');
  if(input.file.size>15*1024*1024)throw new Error('Die Datei darf maximal 15 MB groß sein.');
  if(!['image/jpeg','image/png','image/webp','application/pdf'].includes(input.file.type)){
    throw new Error('Erlaubt sind JPG, PNG, WebP oder PDF.');
  }
  const safeName=input.file.name.replace(/[^a-zA-Z0-9._-]+/g,'_');
  const path=`${input.workshopId}/${crypto.randomUUID()}-${safeName}`;
  const hash=await sha256Hex(input.file);
  const {error:uploadError}=await client.storage.from('verification-documents').upload(path,input.file,{
    upsert:false,contentType:input.file.type
  });
  if(uploadError)throw uploadError;
  try{
    const a=input.analysis;
    const {data,error}=await client.from('workshop_verification_documents').insert({
      workshop_id:input.workshopId,
      uploaded_by:auth.user.id,
      document_type:input.documentType,
      storage_path:path,
      file_name:input.file.name,
      mime_type:input.file.type,
      sha256:hash,
      detected_title:a?.detectedTitle||null,
      detected_field:a?.detectedField||null,
      detected_holder_name:a?.detectedHolderName||null,
      detected_issuer:a?.detectedIssuer||null,
      detected_awarded_at:a?.detectedAwardedAt||null,
      recognition_class:a?.recognitionClass??'unreviewed',
      recognition_note:a?.note||null,
      ocr_confidence:a?.confidence??null,
      analysis_json:{tradeScopes:a?.tradeScopes??[]}
    }).select().single();
    if(error)throw error;
    return data as WorkshopVerificationDocument;
  }catch(error){
    await client.storage.from('verification-documents').remove([path]);
    throw error;
  }
}

export async function listWorkshopVerificationDocuments(workshopId:string){
  const {data,error}=await db().from('workshop_verification_documents')
    .select('*').eq('workshop_id',workshopId).order('created_at',{ascending:false});
  if(error)throw error;
  return(data??[]) as WorkshopVerificationDocument[];
}

export async function getWorkshopVerificationDocumentUrl(storagePath:string,expiresIn=300){
  const {data,error}=await db().storage.from('verification-documents').createSignedUrl(storagePath,expiresIn);
  if(error)throw error;
  return data.signedUrl;
}

export async function requestWorkshopVerification(workshopId:string){
  const {data,error}=await db().rpc('request_workshop_verification',{p_workshop_id:workshopId});
  if(error)throw error;
  return data;
}


export async function inviteWorkshopMember(input:{
  workshopId:string;email:string;role:'office'|'mechanic'|'custom';displayName?:string;permissions?:Record<string,boolean>;
}){
  const {data,error}=await db().functions.invoke('invite-workshop-member',{body:input});
  if(error)throw error;
  if(data?.error)throw new Error(data.error);
  return data;
}

export async function listWorkshopMembers(workshopId:string){
  const {data,error}=await db().from('workshop_members')
    .select('id,user_id,role,permissions,display_name,active,created_at')
    .eq('workshop_id',workshopId).order('created_at',{ascending:true});
  if(error)throw error;return data??[];
}

export async function listWorkshopMemberInvites(workshopId:string){
  const {data,error}=await db().from('workshop_member_invites')
    .select('id,email,role,permissions,display_name,status,created_at,accepted_at')
    .eq('workshop_id',workshopId).order('created_at',{ascending:false});
  if(error)throw error;return data??[];
}

export async function revokeWorkshopMember(workshopId:string,userId:string){
  const {data,error}=await db().rpc('revoke_workshop_member',{p_workshop_id:workshopId,p_user_id:userId});
  if(error)throw error;return data;
}

export async function claimMyWorkshopInvites(){
  const {data,error}=await db().rpc('claim_my_workshop_invites');
  if(error)throw error;return data??[];
}
