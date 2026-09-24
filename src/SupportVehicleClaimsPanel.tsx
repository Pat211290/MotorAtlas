import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, FileText, RefreshCw, Search, ShieldCheck, XCircle } from 'lucide-react';
import {
  getSupportVehicleClaimEvidenceUrl, listSupportVehicleClaimRequests, reviewSupportVehicleClaim,
  type SupportVehicleClaimRequest
} from './api';

export function SupportVehicleClaimsPanel({focusClaimId}:{focusClaimId?:string|null}){
  const [items,setItems]=useState<SupportVehicleClaimRequest[]>([]);
  const [search,setSearch]=useState('');
  const [loading,setLoading]=useState(true);
  const [busyId,setBusyId]=useState<string|null>(null);
  const [note,setNote]=useState<Record<string,string>>({});
  const [error,setError]=useState<string|null>(null);

  const load=async()=>{
    setLoading(true);
    try{setItems(await listSupportVehicleClaimRequests());setError(null)}
    catch(err){setError(err instanceof Error?err.message:'Support-Anträge konnten nicht geladen werden.')}
    finally{setLoading(false)}
  };

  useEffect(()=>{void load()},[]);
  useEffect(()=>{
    if(!focusClaimId||loading)return;
    const id=window.setTimeout(()=>{
      const node=document.getElementById('support-claim-'+focusClaimId);
      if(!node)return;
      node.scrollIntoView({behavior:'smooth',block:'center'});
      node.classList.add('notification-target');
      window.setTimeout(()=>node.classList.remove('notification-target'),1800);
    },80);
    return()=>window.clearTimeout(id);
  },[focusClaimId,loading,items.length]);

  const filtered=useMemo(()=>{
    const q=search.trim().toLowerCase();
    if(!q)return items;
    return items.filter(item=>[
      item.claimantName,item.claimantEmail,item.make,item.model,item.variant,item.licensePlate,item.vin
    ].filter(Boolean).some(value=>String(value).toLowerCase().includes(q)));
  },[items,search]);

  const openEvidence=async(item:SupportVehicleClaimRequest)=>{
    if(!item.evidencePath)return;
    try{
      const url=await getSupportVehicleClaimEvidenceUrl(item.evidencePath);
      window.open(url,'_blank','noopener,noreferrer');
    }catch(err){setError(err instanceof Error?err.message:'Nachweis konnte nicht geöffnet werden.')}
  };

  const decide=async(item:SupportVehicleClaimRequest,decision:'approved'|'rejected')=>{
    if(busyId)return;
    setBusyId(item.id);setError(null);
    try{
      await reviewSupportVehicleClaim(item.id,decision,note[item.id]);
      await load();
    }catch(err){setError(err instanceof Error?err.message:'Antrag konnte nicht bearbeitet werden.')}
    finally{setBusyId(null)}
  };

  const pending=items.filter(item=>item.status==='pending').length;

  return <div className="support-claims">
    <section className="panel support-claims-toolbar">
      <div>
        <span className="overline">MOTORATLAS SUPPORT</span>
        <h2>Besitzerwechsel prüfen</h2>
        <p>{pending} offene Anträge · Kaufverträge und Nachweise nur zur Prüfung der MotorAtlas-Fahrzeugzuordnung.</p>
      </div>
      <button className="btn secondary" onClick={()=>void load()} disabled={loading}><RefreshCw size={15}/> Aktualisieren</button>
    </section>

    <section className="panel support-claims-search">
      <Search/>
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Name, E-Mail, Fahrzeug, Kennzeichen oder FIN …"/>
    </section>

    {error&&<div className="workspace-alert">{error}</div>}

    <section className="support-claim-list">
      {loading&&<div className="panel inbox-empty">Support-Anträge werden geladen …</div>}
      {!loading&&!filtered.length&&<div className="panel inbox-empty">Keine passenden Besitzerwechsel-Anträge vorhanden.</div>}
      {!loading&&filtered.map(item=><article id={'support-claim-'+item.id} className={'panel support-claim-card '+item.status} key={item.id}>
        <header>
          <div><ShieldCheck/><span><small>{item.status==='pending'?'OFFENE PRÜFUNG':item.status==='approved'?'FREIGEGEBEN':'ABGELEHNT'}</small><h3>{[item.make,item.model,item.variant].filter(Boolean).join(' ')}</h3><p>{item.licensePlate} · FIN {item.vin}</p></span></div>
          <strong>{new Date(item.createdAt).toLocaleString('de-DE',{dateStyle:'medium',timeStyle:'short'})}</strong>
        </header>
        <div className="support-claim-grid">
          <div><small>ANTRAGSTELLER</small><b>{item.claimantName||'MotorAtlas-Nutzer'}</b><span>{item.claimantEmail||'E-Mail nicht verfügbar'}</span></div>
          <div><small>FAHRZEUG</small><b>{item.make} {item.model}</b><span>{item.licensePlate}</span></div>
          <div><small>NACHWEIS</small><b>{item.evidencePath?'Kaufvertrag hochgeladen':'Noch kein Nachweis'}</b>{item.evidencePath&&<button className="btn secondary" onClick={()=>void openEvidence(item)}><FileText size={14}/> Nachweis öffnen</button>}</div>
          <div><small>HINWEIS DES KÄUFERS</small><b>{item.claimantNote||'Kein zusätzlicher Hinweis'}</b></div>
        </div>

        {item.status==='pending'?<div className="support-claim-review">
          <label><span>Prüfnotiz <small>optional bei Freigabe · empfohlen bei Ablehnung</small></span><textarea rows={3} value={note[item.id]??''} onChange={e=>setNote(current=>({...current,[item.id]:e.target.value}))} placeholder="z. B. Kaufvertrag geprüft, FIN stimmt mit Fahrzeugakte überein."/></label>
          <div>
            <button className="btn secondary danger" disabled={busyId===item.id} onClick={()=>void decide(item,'rejected')}><XCircle size={15}/> Ablehnen</button>
            <button className="btn primary" disabled={busyId===item.id||!item.evidencePath} onClick={()=>void decide(item,'approved')}><CheckCircle2 size={15}/> Fahrzeugzuordnung freigeben</button>
          </div>
        </div>:<div className="support-claim-result">
          <b>{item.status==='approved'?'MotorAtlas-Zuordnung freigegeben':'Nicht freigegeben'}</b>
          <span>{item.reviewNote||'Keine Prüfnotiz hinterlegt.'}</span>
          {item.reviewedAt&&<small>{new Date(item.reviewedAt).toLocaleString('de-DE',{dateStyle:'medium',timeStyle:'short'})}</small>}
        </div>}
      </article>)}
    </section>
  </div>;
}
