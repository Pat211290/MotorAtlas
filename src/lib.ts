import { createClient } from '@supabase/supabase-js';

const url=import.meta.env.VITE_SUPABASE_URL as string|undefined;
const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string|undefined;

export const backendConfigured=Boolean(url&&key);
export const supabase=backendConfigured?createClient(url!,key!):null;

export type BrandPalette={primary:string;dark:string;soft:string;rgb:string};
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
const hex=(r:number,g:number,b:number)=>`#${[r,g,b].map(v=>Math.round(v).toString(16).padStart(2,'0')).join('')}`;

export async function paletteFromLogo(file:File):Promise<BrandPalette>{
  const bitmap=await createImageBitmap(file);
  const canvas=document.createElement('canvas');canvas.width=96;canvas.height=96;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw new Error('Canvas unavailable');
  ctx.drawImage(bitmap,0,0,96,96);
  const data=ctx.getImageData(0,0,96,96).data;let sr=0,sg=0,sb=0,weight=0;
  for(let i=0;i<data.length;i+=16){
    const a=data[i+3]/255;if(a<.25)continue;
    const r=data[i],g=data[i+1],b=data[i+2],max=Math.max(r,g,b),min=Math.min(r,g,b);
    if(max>245&&min>235)continue;
    const w=a*(20+max-min);sr+=r*w;sg+=g*w;sb+=b*w;weight+=w;
  }
  let r=12,g=102,b=122;
  if(weight){r=sr/weight;g=sg/weight;b=sb/weight}
  if(Math.max(r,g,b)-Math.min(r,g,b)<35){r=12;g=102;b=122}
  const luminance=.2126*r+.7152*g+.0722*b,scale=luminance>185?.72:1;
  const normalized=[clamp(r*scale,20,220),clamp(g*scale,35,210),clamp(b*scale,45,225)];
  const dark=normalized.map(v=>v*.72),soft=normalized.map(v=>Math.round(248-(248-v)*.08));
  return {primary:hex(normalized[0],normalized[1],normalized[2]),dark:hex(dark[0],dark[1],dark[2]),soft:hex(soft[0],soft[1],soft[2]),rgb:normalized.map(Math.round).join(',')};
}

export function paletteFromStoredColors(input:{primary?:string|null;dark?:string|null;soft?:string|null;rgb?:string|null}):BrandPalette|null{
  const primary=input.primary?.trim();
  if(!primary||!/^#[0-9a-f]{6}$/i.test(primary))return null;
  const parse=(value:string)=>[
    Number.parseInt(value.slice(1,3),16),
    Number.parseInt(value.slice(3,5),16),
    Number.parseInt(value.slice(5,7),16)
  ];
  const [r,g,b]=parse(primary);
  const dark=input.dark&&/^#[0-9a-f]{6}$/i.test(input.dark)
    ?input.dark
    :hex(r*.72,g*.72,b*.72);
  const soft=input.soft&&/^#[0-9a-f]{6}$/i.test(input.soft)
    ?input.soft
    :hex(
      Math.round(248-(248-r)*.08),
      Math.round(248-(248-g)*.08),
      Math.round(248-(248-b)*.08)
    );
  const rgb=input.rgb&&/^\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*$/.test(input.rgb)
    ?input.rgb
    :[r,g,b].join(',');
  return{primary,dark,soft,rgb};
}

export function applyPalette(palette:BrandPalette){
  const root=document.documentElement;
  root.style.setProperty('--brand',palette.primary);
  root.style.setProperty('--brand-dark',palette.dark);
  root.style.setProperty('--brand-soft',palette.soft);
  root.style.setProperty('--brand-rgb',palette.rgb);
}
