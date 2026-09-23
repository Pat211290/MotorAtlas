import { useState } from 'react';
import { ArrowRight, Menu, X } from 'lucide-react';
import { Brand, type AppView } from './components';

const navItems:Array<{view:AppView;label:string}>=[
  {view:'customer-info',label:'Für Autofahrer'},
  {view:'workshop-info',label:'Für Werkstätten'},
  {view:'finder',label:'Werkstatt finden'},
  {view:'security-info',label:'Sicherheit'}
];

export function PublicHeader({
  view,setView
}:{view:AppView;setView:(view:AppView)=>void}){
  const [open,setOpen]=useState(false);
  const go=(next:AppView)=>{setOpen(false);setView(next)};
  const openAccess=(mode:'start'|'login')=>{
    sessionStorage.setItem('motoratlas_access_mode',mode);
    go('login');
  };
  return <header className="public-header">
    <div className="wrap public-nav">
      <button className="brand-button" onClick={()=>go('home')} aria-label="MotorAtlas Startseite"><Brand/></button>
      <nav className={open?'open':''} aria-label="Hauptnavigation">
        {navItems.map(item=><button
          key={item.view}
          className={(view===item.view||(view==='workshop-profile'&&item.view==='finder'))?'active':''}
          onClick={()=>go(item.view)}
        >{item.label}</button>)}
      </nav>
      <div className="public-nav-actions">
        <button className={`public-login ${view==='login'?'active':''}`} onClick={()=>openAccess('login')}>Anmelden</button>
        <button className="btn primary public-start" onClick={()=>openAccess('start')}>Kostenlos starten <ArrowRight size={15}/></button>
        <button className="public-menu" aria-label={open?'Menü schließen':'Menü öffnen'} onClick={()=>setOpen(!open)}>{open?<X/>:<Menu/>}</button>
      </div>
    </div>
  </header>;
}
