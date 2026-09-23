import { useEffect, useRef, useState } from 'react';
import { Car, FileText, Image as ImageIcon, Paperclip, Send, ShieldCheck, X } from 'lucide-react';
import {
  ensureWorkOrderChat,getChatAttachmentUrl,getSignedInUserId,listChatMessages,markChatRead,
  sendChatAttachment,sendChatMessage,subscribeChat,type ChatMessage
} from './api';
import { backendConfigured } from './lib';

type Props={
  open:boolean;
  onClose:()=>void;
  audience:'customer'|'workshop';
  workOrderId?:string|null;
  vehicleLabel?:string;
  plate?:string;
  orderNumber?:string;
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
  open,onClose,audience,workOrderId,vehicleLabel='BMW X3 3.0i',plate='SAD XX 123',orderNumber='184'
}:Props){
  const [messages,setMessages]=useState<ChatMessage[]>([]);
  const [threadId,setThreadId]=useState<string|null>(null);
  const [userId,setUserId]=useState<string|null>(null);
  const [text,setText]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const fileRef=useRef<HTMLInputElement>(null);
  const isLive=backendConfigured&&Boolean(workOrderId&&uuid.test(workOrderId));

  useEffect(()=>{
    if(!open)return;
    let unsubscribe:undefined|(()=>void);
    let cancelled=false;
    const run=async()=>{
      if(!isLive){
        setThreadId(null);setUserId(null);setMessages(demoMessages);setError(null);return;
      }
      try{
        const uid=await getSignedInUserId();
        if(!uid)throw new Error('Bitte zuerst anmelden.');
        const thread=await ensureWorkOrderChat(workOrderId!);
        const initial=await listChatMessages(thread.id);
        if(cancelled)return;
        setUserId(uid);setThreadId(thread.id);setMessages(initial);setError(null);
        await markChatRead(thread.id);
        unsubscribe=subscribeChat(thread.id,message=>{
          setMessages(current=>current.some(item=>item.id===message.id)?current:[...current,message]);
          void markChatRead(thread.id);
        });
      }catch(err){
        if(!cancelled)setError(err instanceof Error?err.message:'Chat konnte nicht geladen werden.');
      }
    };
    void run();
    return()=>{cancelled=true;unsubscribe?.()};
  },[open,isLive,workOrderId]);

  if(!open)return null;

  const mine=(message:ChatMessage)=>{
    if(isLive)return message.sender_user_id===userId;
    return audience==='customer'?message.sender_user_id==='customer':message.sender_user_id==='workshop';
  };

  const send=async()=>{
    const value=text.trim();if(!value||busy)return;
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
    if(!file)return;
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

  return <div className="drawer-backdrop" onMouseDown={onClose}>
    <aside className="chat-drawer" onMouseDown={event=>event.stopPropagation()}>
      <header>
        <div><span className="chat-vehicle"><Car size={17}/></span><div><b>{vehicleLabel}</b><small>{plate} · Auftrag #{orderNumber}</small></div></div>
        <button onClick={onClose} aria-label="Chat schließen"><X/></button>
      </header>
      <div className="chat-note"><ShieldCheck size={14}/> Chat und formelle Reparaturfreigabe sind bewusst getrennt.</div>
      <div className="messages">
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
      <footer>
        <input ref={fileRef} className="chat-file-input" type="file" accept="image/*,application/pdf" onChange={event=>void attach(event.target.files?.[0])}/>
        <button className="attach" title="Bild oder PDF anhängen" onClick={()=>fileRef.current?.click()} disabled={busy}><Paperclip/></button>
        <input value={text} onChange={event=>setText(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();void send()}}} placeholder="Nachricht zum Fahrzeug …"/>
        <button className="send" onClick={()=>void send()} disabled={busy||!text.trim()}><Send/></button>
      </footer>
    </aside>
  </div>;
}
