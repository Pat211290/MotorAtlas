import type { ReactNode } from 'react';
import { ArrowRight, BadgeCheck, Car, Check, CircleCheck, ShieldCheck } from 'lucide-react';
import type { Stage } from './demo';

export type AppView='home'|'customer-info'|'workshop-info'|'security-info'|'finder'|'workshop-profile'|'login'|'privacy'|'imprint'|'office'|'workshop'|'customer'|'branding';

export const stageLabels:Record<Stage,string>={
  arrived:'Eingetroffen',diagnosis:'Diagnose',approval:'Freigabe',repair:'Reparatur',pickup:'Abholung'
};

export function Brand({compact=false,inverse=false}:{compact?:boolean;inverse?:boolean}){
  return <div className={`brand ${inverse?'inverse':''}`}>
    <div className="brand-mark">M</div>
    {!compact&&<div className="brand-word"><strong>MotorAtlas</strong><small>Werkstatt. Neu gedacht.</small></div>}
  </div>;
}
export function Status({stage}:{stage:Stage}){return <span className={`status status-${stage}`}><i/>{stageLabels[stage]}</span>}
export function SectionIntro({kicker,title,text,align='center'}:{kicker:string;title:ReactNode;text:string;align?:'center'|'left'}){return <div className={`section-intro ${align}`}><span>{kicker}</span><h2>{title}</h2><p>{text}</p></div>}
export function CarArt({tone=0,large=false}:{tone?:number;large?:boolean}){return <div className={`car-art tone-${tone%5} ${large?'large':''}`}><div className="car-glow"/><Car/><span/></div>}
export function Feature({icon,title,text}:{icon:ReactNode;title:string;text:string}){return <article className="feature"><div className="feature-icon">{icon}</div><h3>{title}</h3><p>{text}</p></article>}
export function CheckLine({title,text}:{title:string;text:string}){return <div className="check-line"><i><Check size={16}/></i><div><b>{title}</b><p>{text}</p></div></div>}
export function TrustPill({children}:{children:ReactNode}){return <span className="trust-pill"><CircleCheck size={15}/>{children}</span>}
export function Verified(){return <span className="verified"><BadgeCheck size={15}/> Verifiziert</span>}
export function Secure(){return <span className="secure"><ShieldCheck size={15}/> Sicher verbunden</span>}
export function MoreLink({children}:{children:ReactNode}){return <span className="more-link">{children}<ArrowRight size={14}/></span>}
