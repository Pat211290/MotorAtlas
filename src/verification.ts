export type QualificationScope='none'|'kfz_trade'|'tire_trade';

export type WorkshopServiceOption={
  code:string;
  label:string;
  description:string;
  qualificationScope:QualificationScope;
};

export const WORKSHOP_SERVICE_OPTIONS:WorkshopServiceOption[]=[
  {code:'detailing',label:'Fahrzeugaufbereitung',description:'Innen-/Außenreinigung, Politur und Pflege.',qualificationScope:'none'},
  {code:'wash',label:'Fahrzeugwäsche',description:'Handwäsche und Pflegeleistungen.',qualificationScope:'none'},
  {code:'tire_basic',label:'Rad-/Reifenservice',description:'Radwechsel, Reifenwechsel und Auswuchten.',qualificationScope:'none'},
  {code:'basic_service',label:'Einfacher Fahrzeugservice',description:'Einfache Servicearbeiten wie Flüssigkeitskontrollen, Filter oder Zündkerzen, soweit handwerksrechtlich zulässig.',qualificationScope:'none'},
  {code:'diagnostics',label:'Diagnose & Fehlersuche',description:'Systematische Diagnose mechanischer, elektrischer oder elektronischer Fehler.',qualificationScope:'kfz_trade'},
  {code:'inspection',label:'Inspektion & Wartung',description:'Umfassende Inspektions- und Wartungsarbeiten.',qualificationScope:'kfz_trade'},
  {code:'brakes',label:'Bremsanlage',description:'Reparatur- und Instandsetzungsarbeiten an der Bremsanlage.',qualificationScope:'kfz_trade'},
  {code:'suspension',label:'Fahrwerk & Lenkung',description:'Reparaturen an Fahrwerk, Lenkung und Achskomponenten.',qualificationScope:'kfz_trade'},
  {code:'engine',label:'Motor',description:'Motorreparaturen und weitergehende Motorarbeiten.',qualificationScope:'kfz_trade'},
  {code:'transmission',label:'Getriebe & Antrieb',description:'Reparaturen an Getriebe und Antriebsstrang.',qualificationScope:'kfz_trade'},
  {code:'electrical',label:'Kfz-Elektrik & Elektronik',description:'Fehlersuche und Reparaturen an elektrischen/elektronischen Fahrzeugsystemen.',qualificationScope:'kfz_trade'},
  {code:'general_repair',label:'Allgemeine Kfz-Reparaturen',description:'Allgemeine Instandsetzung von Kraftfahrzeugen.',qualificationScope:'kfz_trade'},
  {code:'tire_repair',label:'Reifenreparatur / Vulkanisation',description:'Reparatur und vulkanisationstechnische Arbeiten an Reifen.',qualificationScope:'tire_trade'}
];

export function qualificationScopesForServices(services:string[]):QualificationScope[]{
  const scopes=new Set<QualificationScope>();
  for(const code of services){
    const option=WORKSHOP_SERVICE_OPTIONS.find(item=>item.code===code);
    if(option&&option.qualificationScope!=='none')scopes.add(option.qualificationScope);
  }
  return[...scopes];
}

export type QualificationRecognition={
  documentType:'meisterbrief'|'industriemeister'|'techniker'|'other';
  detectedTitle:string;
  detectedField:string;
  detectedHolderName:string;
  detectedIssuer:string;
  detectedAwardedAt:string|null;
  recognitionClass:'direct_match'|'conditional_match'|'qualification_only'|'not_recognized';
  tradeScopes:QualificationScope[];
  note:string;
  confidence:number|null;
  rawText:string;
};

function cleanLine(value:string){
  return value.replace(/\s+/g,' ').trim();
}

function detectIssuer(lines:string[]){
  return lines.find(line=>/(handwerkskammer|industrie-\s*und\s*handelskammer|\bihk\b|fachschule|technikerschule|regierung|ministerium)/i.test(line))??'';
}

function detectDate(text:string){
  const matches=[
    ...text.matchAll(/\b(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})\b/g),
    ...text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)
  ];
  if(!matches.length)return null;
  const m=matches[matches.length-1];
  if(m[1]?.length===4)return `${m[1]}-${m[2]}-${m[3]}`;
  const dd=String(m[1]).padStart(2,'0'),mm=String(m[2]).padStart(2,'0');
  return `${m[3]}-${mm}-${dd}`;
}

function detectHolder(lines:string[]){
  for(const line of lines){
    const match=line.match(/(?:herrn|frau|für|fuer)\s+([A-ZÄÖÜ][A-Za-zÄÖÜäöüß'-]+(?:\s+[A-ZÄÖÜ][A-Za-zÄÖÜäöüß'-]+){1,3})/);
    if(match)return cleanLine(match[1]);
  }
  return'';
}

export function analyseQualificationText(rawText:string,confidence:number|null=null):QualificationRecognition{
  const text=rawText.replace(/\u00ad/g,' ').replace(/\s+/g,' ').trim();
  const lower=text.toLowerCase();
  const lines=rawText.split(/\r?\n/).map(cleanLine).filter(Boolean);
  const issuer=detectIssuer(lines);
  const holder=detectHolder(lines);
  const awardedAt=detectDate(text);

  const kfzMaster=
    /(kraftfahrzeugtechniker|kraftfahrzeugmechaniker|kfz[-\s]?(techniker|mechaniker)?)[\s\S]{0,100}(meister|meisterprüfung|meisterbrief)/i.test(rawText)||
    /(meister|meisterprüfung|meisterbrief)[\s\S]{0,100}(kraftfahrzeugtechniker|kraftfahrzeugmechaniker|kfz)/i.test(rawText);
  if(kfzMaster){
    return{documentType:'meisterbrief',detectedTitle:'Kraftfahrzeugtechniker-Handwerksmeister',detectedField:'Kraftfahrzeugtechnik',
      detectedHolderName:holder,detectedIssuer:issuer,detectedAwardedAt:awardedAt,recognitionClass:'direct_match',
      tradeScopes:['kfz_trade'],note:'Kfz-Handwerksmeister erkannt. Für die betriebliche Verifizierung wird zusätzlich der Bezug zum Betrieb und der Handwerksrolleneintrag geprüft.',
      confidence,rawText};
  }

  const tireMaster=/(reifen.*vulkanisation|vulkanisation.*reifen)[\s\S]{0,100}(meister|meisterprüfung|meisterbrief)/i.test(rawText)
    ||/(meister|meisterprüfung|meisterbrief)[\s\S]{0,100}(reifen.*vulkanisation|vulkanisation.*reifen)/i.test(rawText);
  if(tireMaster){
    return{documentType:'meisterbrief',detectedTitle:'Meister im Reifen- und Vulkanisationstechniker-Handwerk',detectedField:'Reifen- und Vulkanisationstechnik',
      detectedHolderName:holder,detectedIssuer:issuer,detectedAwardedAt:awardedAt,recognitionClass:'direct_match',
      tradeScopes:['tire_trade'],note:'Passender Meisterabschluss für Reifen-/Vulkanisationstechnik erkannt. Der betriebliche Handwerksrolleneintrag wird zusätzlich geprüft.',
      confidence,rawText};
  }

  if(/industriemeister[\s-]*metall/i.test(lower)){
    return{documentType:'industriemeister',detectedTitle:'Industriemeister Metall',detectedField:'Metall',
      detectedHolderName:holder,detectedIssuer:issuer,detectedAwardedAt:awardedAt,recognitionClass:'conditional_match',
      tradeScopes:['kfz_trade'],note:'Industriemeister Metall erkannt. Der Abschluss wird als Qualifikation anerkannt; ob er für das konkrete zulassungspflichtige Handwerk gleichwertig ist, wird über den Handwerksrollen-/HWK-Nachweis bestätigt.',
      confidence,rawText};
  }

  if(/staatlich\s+geprüfte[rs]?\s+techniker|staatlich\s+gepruefte[rs]?\s+techniker/i.test(lower)){
    let field='Technik';
    if(/fahrzeugtechnik/i.test(lower))field='Fahrzeugtechnik';
    else if(/maschinenbau/i.test(lower))field='Maschinenbau';
    else if(/elektrotechnik/i.test(lower))field='Elektrotechnik';
    const relevant=field!=='Technik';
    return{documentType:'techniker',detectedTitle:'Staatlich geprüfter Techniker',detectedField:field,
      detectedHolderName:holder,detectedIssuer:issuer,detectedAwardedAt:awardedAt,
      recognitionClass:relevant?'conditional_match':'qualification_only',
      tradeScopes:relevant?['kfz_trade']:[],
      note:relevant
        ?'Technikerabschluss mit einschlägiger technischer Fachrichtung erkannt. Die konkrete Berechtigung für das zulassungspflichtige Handwerk wird durch den Handwerksrollen-/HWK-Nachweis bestätigt.'
        :'Technikerabschluss erkannt. Die Fachrichtung konnte nicht eindeutig einem angebotenen zulassungspflichtigen Handwerk zugeordnet werden.',
      confidence,rawText};
  }

  if(/meisterbrief|meisterprüfung|meisterpruefung|meisterzeugnis/i.test(lower)){
    return{documentType:'meisterbrief',detectedTitle:'Meisterabschluss',detectedField:'',
      detectedHolderName:holder,detectedIssuer:issuer,detectedAwardedAt:awardedAt,recognitionClass:'qualification_only',
      tradeScopes:[],note:'Ein Meisterabschluss wurde erkannt, die Fachrichtung aber nicht eindeutig zugeordnet. MotorAtlas fordert deshalb eine manuelle Prüfung an.',
      confidence,rawText};
  }

  return{documentType:'other',detectedTitle:'Qualifikationsnachweis',detectedField:'',
    detectedHolderName:holder,detectedIssuer:issuer,detectedAwardedAt:awardedAt,recognitionClass:'not_recognized',
    tradeScopes:[],note:'Der Abschluss konnte nicht sicher automatisch erkannt werden. Das Dokument wird zur manuellen Prüfung vorgemerkt.',
    confidence,rawText};
}

async function renderPdfPages(file:File,maxPages=2):Promise<HTMLCanvasElement[]>{
  const pdfjs=await import('pdfjs-dist');
  const workerUrl=(await import('pdfjs-dist/build/pdf.worker.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc=workerUrl;
  const pdf=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
  const pages:HTMLCanvasElement[]=[];
  for(let pageNumber=1;pageNumber<=Math.min(pdf.numPages,maxPages);pageNumber++){
    const page=await pdf.getPage(pageNumber);
    const viewport=page.getViewport({scale:2});
    const canvas=document.createElement('canvas');
    canvas.width=Math.ceil(viewport.width);
    canvas.height=Math.ceil(viewport.height);
    const context=canvas.getContext('2d',{alpha:false});
    if(!context)throw new Error('PDF konnte nicht für die Texterkennung vorbereitet werden.');
    await page.render({canvasContext:context,viewport,canvas}).promise;
    pages.push(canvas);
  }
  return pages;
}

export async function recognizeQualificationFile(file:File,onProgress?:(progress:number)=>void):Promise<QualificationRecognition>{
  const {createWorker}=await import('tesseract.js');
  const worker=await createWorker(['deu','eng'],1,{
    logger:message=>{
      if(message.status==='recognizing text'&&typeof message.progress==='number')onProgress?.(Math.round(message.progress*100));
    }
  });
  try{
    const sources:fileSource[]=[];
    if(file.type==='application/pdf'){
      const canvases=await renderPdfPages(file);
      sources.push(...canvases);
    }else{
      sources.push(file);
    }
    let combined='',confidenceTotal=0,confidenceCount=0;
    for(let i=0;i<sources.length;i++){
      const result=await worker.recognize(sources[i] as any);
      combined+=`\n${result.data.text??''}`;
      if(typeof result.data.confidence==='number'){confidenceTotal+=result.data.confidence;confidenceCount++;}
      onProgress?.(Math.round(((i+1)/Math.max(sources.length,1))*100));
    }
    return analyseQualificationText(combined.trim(),confidenceCount?confidenceTotal/confidenceCount:null);
  }finally{
    await worker.terminate();
  }
}

type fileSource=File|HTMLCanvasElement;
