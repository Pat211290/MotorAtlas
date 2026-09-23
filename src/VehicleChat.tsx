import { useEffect, useRef, useState } from 'react';
import { Car, ChevronDown, FileText, Image as ImageIcon, Mail, MapPin, MessageCircle, Paperclip, Phone, Send, ShieldCheck, UserRound, X } from 'lucide-react';
import {
  ensureVehicleChat,ensureWorkOrderChat,getChatAttachmentUrl,getChatContext,getSignedInUserId,listChatMessages,markChatRead,
  sendChatAttachment,sendChatMessage,subscribeChat,type ChatContext,type ChatMessage
} from './api';
import { backendConfigured } from './lib';

type Props={
  open:boolean;
  onClose:()=>void;
  audience:'customer'|'workshop';
  workOrderId?:string|null;
  chatThreadId?:string|null;
  workshopId?:string|null;
  vehicleId?:string|null;
  vehicleLabel?:string;
  plate?:string;
  orderNumber?:string;
  chatEnabled?:boolean;
};

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const demoMessages=[
  {id:'demo-1',sender_user_id:'workshop',kind:'text',body:'Wir haben die Diagnose abgeschlossen. Die Lambdasonde vor Kat liefert unplausible Werte.',created_at:'2026-09-23T09:18:00+02:00'},
  {id:'demo-2',sender_user_id:'customer',kind:'text',body:'Ist das Fahrzeug bis zur Reparatur noch fahrbar?',created_at:'2026-09-23T09:21:00+02:00'},
  {id:'demo-3',sender_user_id:'workshop',kind:'text',body:'Für kurze Strecken ja. Der Kostenvoranschlag liegt bereits im Auftrag.',created_at:'2026-09-23T09:24:00+02:00'}
] as ChatMessage[];

function formatTime(value:string){
  return new Date(value).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'});
}

export function VehicleChat({
  open,onClose,audience,workOrderId,chatThreadId,workshopId,vehicleId,vehicleLabel='BMW X3 3.0i',plate='SAD XX 123',orderNumber='184',chatEnabled=true
}:Props){
  const [messages,setMessages]=useState<ChatMessage[]>([]);
  const [threadId,setThreadId]=useState<string|null>(null);
  const [userId,setUserId]=useState<string|null>(null);
  const [context,setContext]=useState<ChatContext|null>(null);
  const [contextOpen,setContextOpen]=useState(false);
  const [contextBusy,setContextBusy]=useState(false);
  const [contextError,setContextError]=useState<string|null>(null);
  const [text,setText]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const fileRef=useRef<HTMLInputElement>(null);
  const messagesRef=useRef<HTMLDivElement>(null);
  const isLive=backendConfigured&&Boolean(
    (chatThreadId&&uuid.test(chatThreadId))||
    (workOrderId&&uuid.test(workOrderId))||
    (workshopId&&vehicleId&&uuid.test(workshopId)&&uuid.test(vehicleId))
  );

  useEffect(()=>{
    if(!open)return;
    let unsubscribe:undefined|(()=>void);
    let cancelled=false;
    const run=async()=>{
      setContextOpen(false);setContext(null);setContextError(null);
      if(!isLive){
        setThreadId(null);setUserId(null);setMessages(demoMessages);setError(null);return;
      }
      try{
        setMessages([]);setThreadId(null);setError(null);setContextBusy(true);
        const uid=await getSignedInUserId();
        if(!uid)throw new Error('Bitte zuerst anmelden.');
        const resolvedThreadId=chatThreadId&&uuid.test(chatThreadId)
          ?chatThreadId
          :workOrderId&&uuid.test(workOrderId)
            ?(await ensureWorkOrderChat(workOrderId)).id
            :(await ensureVehicleChat(workshopId!,vehicleId!)).id;
        const [initial,details]=await Promise.all([
          listChatMessages(resolvedThreadId),
          getChatContext(resolvedThreadId).catch(err=>{
            if(!cancelled)setContextError(err instanceof Error?err.message:'Fahrzeug- und Kundendaten konnten nicht geladen werden.');
            return null;
          })
        ]);
        if(cancelled)return;
        setUserId(uid);setThreadId(resolvedThreadId);setMessages(initial);setContext(details);setContextBusy(false);setError(null);
        await markChatRead(resolvedThreadId);
        unsubscribe=subscribeChat(resolvedThreadId,message=>{
          setMessages(current=>current.some(item=>item.id===message.id)?current:[...current,message]);
          void markChatRead(resolvedThreadId);
        });
      }catch(err){
        if(!cancelled){setContextBusy(false);setError(err instanceof Error?err.message:'Chat konnte nicht geladen werden.')}
      }
    };
    void run();
    return()=>{cancelled=true;unsubscribe?.()};
  },[open,isLive,workOrderId,chatThreadId,workshopId,vehicleId]);

  useEffect(()=>{
    if(!open)return;
    requestAnimationFrame(()=>{
      const node=messagesRef.current;
      if(node)node.scrollTop=node.scrollHeight;
    });
  },[open,messages.length]);

  if(!open)return null;

  const mine=(message:ChatMessage)=>{
    if(isLive)return message.sender_user_id===userId;
    return audience==='customer'?message.sender_user_id==='customer':message.sender_user_id==='workshop';
  };

  const send=async()=>{
    const value=text.trim();if(!value||busy||!chatEnabled)return;
    if(!isLive){
      setMessages(current=>[...current,{
        id:'demo-'+Date.now(),thread_id:'demo',sender_user_id:audience,kind:'text',body:value,created_at:new Date().toISOString()
      }]);setText('');return;
    }
    if(!threadId)return;
    setBusy(true);setError(null);
    try{
      const message=await sendChatMessage(threadId,value);
      setMessages(current=>current.some(item=>item.id===message.id)?current:[...current,message]);
      setText('');
    }catch(err){setError(err instanceof Error?err.message:'Nachricht konnte nicht gesendet werden.')}
    finally{setBusy(false)}
  };

  const attach=async(file?:File)=>{
    if(!file||!chatEnabled)return;
    if(!isLive||!threadId){setError('Dateiupload steht in der Produktdemo nicht zur Verfügung.');return;}
    setBusy(true);setError(null);
    try{
      const message=await sendChatAttachment(threadId,file);
      setMessages(current=>current.some(item=>item.id===message.id)?current:[...current,message]);
    }catch(err){setError(err instanceof Error?err.message:'Datei konnte nicht gesendet werden.')}
    finally{setBusy(false);if(fileRef.current)fileRef.current.value=''}
  };

  const openAttachment=async(message:ChatMessage)=>{
    if(!message.attachment_path)return;
    try{
      const url=await getChatAttachmentUrl(message.attachment_path);
      window.open(url,'_blank','noopener,noreferrer');
    }catch(err){setError(err instanceof Error?err.message:'Anhang konnte nicht geöffnet werden.')}
  };

  const toggleContext=()=>{
    setContextOpen(current=>{
      const next=!current;
      if(next)requestAnimationFrame(()=>{if(messagesRef.current)messagesRef.current.scrollTop=0});
      return next;
    });
  };

  const contextVehicle=context
    ?[context.vehicleMake,context.vehicleModel,context.vehicleVariant].filter(Boolean).join(' ')
    :vehicleLabel;
  const contextAddress=context
    ?[context.customerStreet,[context.customerPostalCode,context.customerCity].filter(Boolean).join(' ')].filter(Boolean).join(', ')
    :'';

  return <div className="drawer-backdrop" onMouseDown={onClose}>
    <aside className="chat-drawer" onMouseDown={event=>event.stopPropagation()}>
      <header>
        <button className="chat-context-trigger" type="button" onClick={toggleContext} aria-expanded={contextOpen} title="Fahrzeug- und Kundendaten anzeigen">
          <span className="chat-vehicle"><Car size={17}/></span>
          <span className="chat-context-trigger-copy"><b>{vehicleLabel}</b><small>{plate} · {workOrderId?`Auftrag #${orderNumber}`:'Werkstattchat'} · Daten anzeigen</small></span>
          <ChevronDown className={contextOpen?'open':''} size={15}/>
        </button>
        <button className="chat-close" onClick={onClose} aria-label="Chat schließen"><X/></button>
      </header>
      <div className={'chat-note '+(!chatEnabled?'disabled':'')}>{chatEnabled?<ShieldCheck size={14}/>:<MessageCircle size={14}/>} {chatEnabled?'Der Verlauf bleibt auch nach erneutem Login erhalten. Reparaturfreigaben bleiben davon getrennt.':'Diese Werkstatt hat den MotorAtlas-Chat deaktiviert. Vorhandene Nachrichten bleiben lesbar.'}</div>
      <div className="messages" ref={messagesRef}>
        {contextOpen&&<section className="chat-context-panel">
          <div className="chat-context-panel-head"><div><Car/><span><small>FAHRZEUG & KUNDE</small><b>{contextVehicle||vehicleLabel}</b></span></div>{contextBusy&&<em>Lädt …</em>}</div>
          {contextError&&<div className="chat-context-error">{contextError}</div>}
          {!contextBusy&&context&&<div className="chat-context-grid">
            <section className="chat-context-section">
              <div className="chat-context-section-title"><Car/><span><small>FAHRZEUG</small><b>{contextVehicle||'Fahrzeug'}</b></span></div>
              <dl>
                <div><dt>Kennzeichen</dt><dd>{context.licensePlate||'—'}</dd></div>
                <div><dt>Erstzulassung</dt><dd>{context.firstRegistration?new Date(context.firstRegistration).toLocaleDateString('de-DE'):'—'}</dd></div>
                <div><dt>Kilometer</dt><dd>{context.mileage!=null?context.mileage.toLocaleString('de-DE')+' km':'—'}</dd></div>
                <div><dt>HSN / TSN</dt><dd>{[context.hsn,context.tsn].filter(Boolean).join(' / ')||'—'}</dd></div>
                <div className="wide"><dt>FIN / VIN</dt><dd>{context.vin||'—'}</dd></div>
                {context.orderNumber&&<div className="wide"><dt>Auftrag</dt><dd>#{context.orderNumber}</dd></div>}
              </dl>
            </section>
            <section className="chat-context-section">
              <div className="chat-context-section-title"><UserRound/><span><small>KUNDE</small><b>{context.customerName||'Kunde'}</b></span></div>
              <div className="chat-context-contact">
                {context.customerPhone?<a href={'tel:'+context.customerPhone.replace(/[^+\d]/g,'')}><Phone/><span><small>Telefon</small><b>{context.customerPhone}</b></span></a>:<div><Phone/><span><small>Telefon</small><b>Nicht hinterlegt</b></span></div>}
                {context.customerEmail?<a href={'mailto:'+context.customerEmail}><Mail/><span><small>E-Mail</small><b>{context.customerEmail}</b></span></a>:<div><Mail/><span><small>E-Mail</small><b>Nicht hinterlegt</b></span></div>}
                <div className="wide"><MapPin/><span><small>Anschrift</small><b>{contextAddress||'Nicht hinterlegt'}</b></span></div>
              </div>
            </section>
          </div>}
          {!contextBusy&&!context&&!contextError&&<div className="chat-context-error">Für diesen Chat sind noch keine Detaildaten verfügbar.</div>}
        </section>}
        {messages.length===0&&<div className="chat-empty"><b>Noch keine Nachrichten.</b><span>Dieser Verlauf bleibt direkt am Fahrzeug bzw. Auftrag.</span></div>}
        {messages.map(message=>{
          const own=mine(message);
          return <div key={message.id} className={'message '+(own?'mine':'')}>
            {message.body&&<p>{message.body}</p>}
            {message.attachment_name&&<button className="chat-attachment" onClick={()=>void openAttachment(message)}>
              {message.attachment_mime?.startsWith('image/')?<ImageIcon size={15}/>:<FileText size={15}/>}
              <span>{message.attachment_name}</span>
            </button>}
            <small>{own?(audience==='customer'?'Du':'Werkstatt'):(audience==='customer'?'Werkstatt':'Kunde')} · {formatTime(message.created_at)}</small>
          </div>;
        })}
        {error&&<div className="chat-error">{error}</div>}
      </div>
      {chatEnabled?<footer>
        <input ref={fileRef} className="chat-file-input" type="file" accept="image/*,application/pdf" onChange={event=>void attach(event.target.files?.[0])}/>
        <button className="attach" title="Bild oder PDF anhängen" onClick={()=>fileRef.current?.click()} disabled={busy}><Paperclip/></button>
        <input autoComplete="off" enterKeyHint="send" value={text} onChange={event=>setText(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();void send()}}} placeholder="Nachricht schreiben …"/>
        <button className="send" onClick={()=>void send()} disabled={busy||!text.trim()}><Send/></button>
      </footer>:<div className="chat-disabled-footer"><MessageCircle/><div><b>Chat deaktiviert</b><span>Bitte Telefon oder E-Mail verwenden.</span></div></div>}
    </aside>
  </div>;
}
