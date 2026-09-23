import { useCallback, useEffect, useState } from 'react';
import { Mail, ShieldCheck, Trash2, UserPlus, Users } from 'lucide-react';
import { inviteWorkshopMember,listWorkshopMemberInvites,listWorkshopMembers,revokeWorkshopMember } from './api';

const permissionLabels:Record<string,string>={
  requests:'Anfragen bearbeiten',appointments:'Termine vergeben',arrival:'Fahrzeuge annehmen',
  quotes:'Kostenvoranschläge / Freigaben',documents:'Dokumente & Rechnungen',pickup:'Abholung abschließen',
  customers:'Kunden verwalten',chat:'Kundenchat',diagnosis:'Diagnosen durchführen',repair:'Reparaturen bearbeiten',
  workshop_board:'Werkstattboard'
};

export function TeamManager({workshopId,currentUserId}:{workshopId:string;currentUserId:string}){
  const [members,setMembers]=useState<any[]>([]);const [invites,setInvites]=useState<any[]>([]);
  const [email,setEmail]=useState('');const [name,setName]=useState('');
  const [role,setRole]=useState<'office'|'mechanic'|'custom'>('mechanic');
  const [permissions,setPermissions]=useState<Record<string,boolean>>({});
  const [busy,setBusy]=useState(false);const [error,setError]=useState<string|null>(null);const [message,setMessage]=useState<string|null>(null);

  const reload=useCallback(async()=>{
    try{
      const [nextMembers,nextInvites]=await Promise.all([listWorkshopMembers(workshopId),listWorkshopMemberInvites(workshopId)]);
      setMembers(nextMembers);setInvites(nextInvites);setError(null);
    }catch(err){setError(err instanceof Error?err.message:'Teamdaten konnten nicht geladen werden.')}
  },[workshopId]);
  useEffect(()=>{void reload()},[reload]);

  const invite=async(event:React.FormEvent)=>{
    event.preventDefault();if(!email.trim()||busy)return;
    setBusy(true);setError(null);setMessage(null);
    try{
      const result=await inviteWorkshopMember({workshopId,email:email.trim(),role,displayName:name.trim()||undefined,permissions:role==='custom'?permissions:undefined});
      setMessage(result?.email_sent?'Einladung wurde per E-Mail versendet.':result?.already_registered?'Einladung gespeichert. Der bestehende Nutzer wird beim nächsten Login automatisch zugeordnet.':'Einladung gespeichert.');
      setEmail('');setName('');setRole('mechanic');setPermissions({});await reload();
    }catch(err){setError(err instanceof Error?err.message:'Mitarbeiter konnte nicht eingeladen werden.')}
    finally{setBusy(false)}
  };

  const revoke=async(userId:string)=>{
    if(busy||userId===currentUserId)return;
    setBusy(true);setError(null);
    try{await revokeWorkshopMember(workshopId,userId);await reload()}
    catch(err){setError(err instanceof Error?err.message:'Mitarbeiter konnte nicht deaktiviert werden.')}
    finally{setBusy(false)}
  };

  const activeMembers=members.filter(item=>item.active);
  const pendingInvites=invites.filter(item=>item.status==='pending');

  return <section className="panel team-manager">
    <div className="team-head"><div><span className="overline">TEAM & BERECHTIGUNGEN</span><h3>Nur sehen und tun, was zur Aufgabe gehört.</h3><p>Büro, Mechaniker oder individuelle Rechte. Ein Mitarbeiterzugang bleibt immer an diese Werkstatt gebunden.</p></div><div className="team-count"><Users/><b>{activeMembers.length}</b><span>aktive Zugänge</span></div></div>
    <div className="team-layout">
      <div className="team-list">
        <h4>Aktive Mitarbeiter</h4>
        {activeMembers.map(member=><article key={member.id}><span className="member-avatar">{(member.display_name||member.role).slice(0,2).toUpperCase()}</span><div><b>{member.display_name||'MotorAtlas Nutzer'}</b><small>{member.role==='owner'?'Inhaber':member.role==='office'?'Büro / Service':member.role==='mechanic'?'Mechaniker':'Individuelle Rolle'}</small></div><span className="member-status"><i/> aktiv</span>{member.role!=='owner'&&<button title="Zugang deaktivieren" disabled={busy} onClick={()=>void revoke(member.user_id)}><Trash2/></button>}</article>)}
        {!activeMembers.length&&<div className="team-empty">Noch keine Mitarbeiter hinterlegt.</div>}
        {pendingInvites.length>0&&<><h4 className="pending-title">Offene Einladungen</h4>{pendingInvites.map(invite=><article className="pending-member" key={invite.id}><span className="member-avatar"><Mail/></span><div><b>{invite.display_name||invite.email}</b><small>{invite.email} · {invite.role==='office'?'Büro':invite.role==='mechanic'?'Mechaniker':'Individuell'}</small></div><span className="invite-pending">ausstehend</span></article>)}</>}
      </div>
      <form className="team-invite" onSubmit={invite}>
        <div className="invite-title"><UserPlus/><div><b>Mitarbeiter einladen</b><span>Der Zugang wird erst nach Anmeldung aktiv.</span></div></div>
        <label><span>Name</span><input value={name} onChange={e=>setName(e.target.value)} placeholder="Max Mustermann"/></label>
        <label><span>E-Mail</span><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="max@werkstatt.de" required/></label>
        <label><span>Rolle</span><select value={role} onChange={e=>setRole(e.target.value as typeof role)}><option value="mechanic">Mechaniker</option><option value="office">Büro / Service</option><option value="custom">Individuelle Rechte</option></select></label>
        {role==='office'&&<div className="role-info"><ShieldCheck/> Kunden, Termine, Annahme, KVA, Dokumente, Abholung und Chat. Keine Reparatur-/Diagnoseübernahme.</div>}
        {role==='mechanic'&&<div className="role-info"><ShieldCheck/> Werkstattboard, Diagnose und Reparatur. Keine Preise, Rechnungen oder Kundenverwaltung.</div>}
        {role==='custom'&&<div className="permission-grid">{Object.entries(permissionLabels).map(([key,label])=><label key={key}><input type="checkbox" checked={Boolean(permissions[key])} onChange={e=>setPermissions(value=>({...value,[key]:e.target.checked}))}/><span>{label}</span></label>)}</div>}
        {error&&<div className="modal-error">{error}</div>}
        {message&&<div className="team-message">{message}</div>}
        <button className="btn primary full" disabled={busy||!email.trim()}>{busy?'Bitte warten …':'Einladung senden'}</button>
      </form>
    </div>
  </section>;
}
