import {
  ArrowLeft, ArrowRight, Building2, Car, CheckCircle2, Clock3, FileCheck2, FileText,
  Gauge, LockKeyhole, MessageCircle, MonitorSmartphone, Search, ShieldCheck, Smartphone,
  Sparkles, Users, Wrench
} from 'lucide-react';
import { Brand, type AppView } from './components';

function PublicTop({setView}:{setView:(view:AppView)=>void}){
  return <header className="mp-top"><div className="wrap mp-nav">
    <button className="brand-button" onClick={()=>setView('home')}><Brand/></button>
    <nav>
      <button onClick={()=>setView('customer-info')}>Für Autofahrer</button>
      <button onClick={()=>setView('workshop-info')}>Für Werkstätten</button>
      <button onClick={()=>setView('finder')}>Werkstatt finden</button>
      <button onClick={()=>setView('security-info')}>Sicherheit</button>
    </nav>
    <div><button className="mp-login" onClick={()=>setView('login')}>Anmelden</button><button className="btn primary" onClick={()=>setView('login')}>Jetzt starten <ArrowRight size={15}/></button></div>
  </div></header>;
}

function PublicFooter({setView}:{setView:(view:AppView)=>void}){
  return <footer className="mp-footer"><div className="wrap mp-footer-grid">
    <div><Brand/><p>Die digitale Verbindung zwischen Autofahrer und Werkstatt.</p></div>
    <div><b>MotorAtlas</b><button onClick={()=>setView('customer-info')}>Für Autofahrer</button><button onClick={()=>setView('workshop-info')}>Für Werkstätten</button><button onClick={()=>setView('finder')}>Werkstatt finden</button></div>
    <div><b>Plattform</b><button onClick={()=>setView('security-info')}>Sicherheit</button><button onClick={()=>setView('login')}>Anmelden</button><button onClick={()=>setView('office')}>Produktdemo</button></div>
    <div><b>Geräte</b><span>Web</span><span>iPhone & iPad</span><span>Android</span></div>
  </div><div className="wrap mp-footer-bottom"><span>© 2026 MotorAtlas</span><span>Datenschutz · Impressum · Nutzungsbedingungen</span></div></footer>;
}

function BackHome({setView}:{setView:(view:AppView)=>void}){
  return <button className="mp-back" onClick={()=>setView('home')}><ArrowLeft/> Zurück zur Startseite</button>;
}

function DeviceRibbon(){
  return <div className="mp-device-ribbon">
    <article><MonitorSmartphone/><div><b>PC</b><span>volle Übersicht</span></div></article>
    <article><Smartphone/><div><b>Smartphone</b><span>unterwegs reagieren</span></div></article>
    <article><Car/><div><b>Werkstatt</b><span>nur das Wesentliche</span></div></article>
  </div>;
}

export function CustomerMarketingPage({setView}:{setView:(view:AppView)=>void}){
  return <div className="mp-page">
    <main>
      <section className="mp-hero customer"><div className="mp-orb one"/><div className="mp-orb two"/><div className="wrap mp-hero-grid">
        <div><BackHome setView={setView}/><span className="mp-kicker"><Sparkles/> MOTORATLAS FÜR AUTOFAHRER</span><h1>Schneller Hilfe bekommen. <em>Zeit sparen und Kosten besser kontrollieren.</em></h1><p>Vom ersten Problem bis zur Rechnung bleibt alles am richtigen Fahrzeug. Du findest eine passende Werkstatt, sendest eine fahrzeugspezifische Anfrage und bleibst bei Termin, Diagnose, Freigabe, Reparatur und Abholung immer auf dem aktuellen Stand.</p><div className="mp-actions"><button className="btn primary xl" onClick={()=>setView('finder')}><Search size={17}/> Werkstatt finden</button><button className="btn secondary xl" onClick={()=>setView('login')}>Kundenkonto erstellen <ArrowRight size={17}/></button></div></div>
        <div className="mp-showcase customer-card"><span>MEINE GARAGE</span><div className="mp-car-card"><div className="mp-car-icon"><Car/></div><div><b>BMW X3 3.0i</b><small>SAD XX 123 · 247.318 km</small></div><i>AKTIV</i></div><div className="mp-progress"><span className="done">Anfrage</span><span className="done">Termin</span><span className="done">Diagnose</span><span className="active">Freigabe</span><span>Reparatur</span></div><div className="mp-quote"><small>KOSTENVORANSCHLAG</small><b>328,40 €</b><p>Lambdasonde Bank 1 vor Kat</p><button className="btn primary full">Reparatur freigeben</button></div></div>
      </div></section>

      <section className="wrap mp-section"><div className="mp-section-head"><span>DEINE GARAGE</span><h2>Du musst deine Fahrzeuggeschichte <em>nicht jedes Mal neu erzählen.</em></h2><p>MotorAtlas ordnet Kommunikation und Dokumente dauerhaft dem richtigen PKW und dem jeweiligen Vorgang zu.</p></div><div className="mp-grid three">
        <article className="mp-feature"><Car/><b>Mehrere Fahrzeuge</b><p>Foto, Kennzeichen, HSN, TSN, VIN, Laufleistung und Historie bleiben sauber getrennt.</p></article>
        <article className="mp-feature"><MessageCircle/><b>Fahrzeugbezogener Chat</b><p>Rückfragen landen dort, wo sie hingehören – nicht verteilt über verschiedene Messenger.</p></article>
        <article className="mp-feature"><FileText/><b>Dokumente am Auftrag</b><p>Kostenvoranschläge und Rechnungen bleiben beim Fahrzeug und sind später wieder auffindbar.</p></article>
      </div></section>

      <section className="mp-band"><div className="wrap mp-process"><div><span>1</span><b>Problem melden</b><p>Fahrzeug wählen, kurz beschreiben und ein Bild hinzufügen.</p></div><i/><div><span>2</span><b>Termin abstimmen</b><p>Werkstatt bestätigt oder schlägt einen anderen Zeitpunkt vor.</p></div><i/><div><span>3</span><b>Diagnose erhalten</b><p>Das Ergebnis erscheint direkt im zugehörigen Vorgang.</p></div><i/><div><span>4</span><b>Freigeben</b><p>Rückfrage per Chat oder Telefon, Freigabe separat dokumentiert.</p></div></div></section>

      <section className="wrap mp-section split"><div><span className="mp-kicker">TRANSPARENT, ABER NICHT KOMPLIZIERT</span><h2>Du siehst, was mit deinem Auto passiert. <em>Ohne Werkstattfachsprache erzwingen zu müssen.</em></h2><p>Der Kundenbereich zeigt verständlich, in welcher Phase sich dein Auftrag befindet und was als Nächstes von dir benötigt wird.</p><div className="mp-checks"><span><CheckCircle2/> Aktueller Auftragsstatus</span><span><CheckCircle2/> Diagnose und Werkstattnachricht</span><span><CheckCircle2/> Kostenvoranschlag und Freigabe</span><span><CheckCircle2/> Rechnung und Fahrzeughistorie</span></div></div><div className="mp-story-card"><small>BMW X3 · AUFTRAG 2026-0184</small><div><i className="ok"/><span><b>08:14</b> Fahrzeug eingetroffen</span></div><div><i className="ok"/><span><b>09:06</b> Diagnose abgeschlossen</span></div><div><i className="now"/><span><b>09:18</b> Kostenvoranschlag wartet auf Freigabe</span></div><div><i/><span>Reparatur</span></div><div><i/><span>Abholung & Rechnung</span></div></div></section>

      <section className="wrap mp-section"><div className="mp-section-head"><span>ÜBERALL DABEI</span><h2>Ein Kundenportal, das sich <em>wie eine App anfühlt.</em></h2><p>Auf iPhone und iPad kann MotorAtlas zum Home-Screen hinzugefügt werden. Android erhält zusätzlich eine eigene App-Hülle.</p></div><DeviceRibbon/></section>


      <section className="wrap mp-section mp-outcomes">
        <div className="mp-section-head"><span>WAS DU KONKRET DAVON HAST</span><h2>MotorAtlas soll dir nicht nur Informationen zeigen. <em>Es soll dir Zeit, Wege und unnötige Kosten ersparen.</em></h2><p>Der Nutzen entsteht dadurch, dass dein Fahrzeug, deine Werkstatt und dein aktueller Auftrag dauerhaft miteinander verbunden bleiben.</p></div>
        <div className="mp-outcome-grid">
          <article><Clock3/><div><b>Zeit sparen</b><p>Keine mehrfachen Telefonate für Termin, Rückfrage, Freigabe oder Status. Du siehst selbst, was gerade passiert.</p></div></article>
          <article><FileCheck2/><div><b>Kosten vorher besser einschätzen</b><p>Diagnose und Kostenvoranschlag liegen vor der Freigabe am Auftrag. So kannst du entscheiden, bevor gearbeitet wird.</p></div></article>
          <article><Car/><div><b>Keine Fahrzeugdaten neu erzählen</b><p>Fahrzeug, Kennzeichen, HSN/TSN, VIN, Bilder und Historie bleiben in deiner Garage hinterlegt.</p></div></article>
          <article><MessageCircle/><div><b>Direkt am richtigen Auto kommunizieren</b><p>Chat und Anhänge sind fahrzeug- und auftragsbezogen. Kein Suchen in alten Messenger-Verläufen.</p></div></article>
          <article><Gauge/><div><b>Immer aktuell bleiben</b><p>Termin bestätigt, Diagnose fertig, Freigabe erforderlich, Reparatur abgeschlossen – du siehst den aktuellen Stand.</p></div></article>
          <article><ShieldCheck/><div><b>Mehr Kontrolle</b><p>Eine Chatnachricht ist keine Freigabe. Entscheidungen und Dokumente bleiben klar voneinander getrennt.</p></div></article>
        </div>
      </section>

      <section className="mp-band customer-promise">
        <div className="wrap mp-promise-grid">
          <div><span className="mp-kicker">SCHNELLE HILFE, OHNE CHAOS</span><h2>Vom ersten Problem bis zur Abholung bleibt <em>alles am selben Fahrzeug.</em></h2><p>Wenn die Motorkontrollleuchte angeht oder ein ungewöhnliches Geräusch auftritt, sendest du nicht nur eine allgemeine Nachricht. Die Werkstatt erhält eine fahrzeugspezifische Anfrage mit Problem, Bild und vorhandenen Fahrzeugdaten.</p></div>
          <div className="mp-promise-steps">
            <article><b>01</b><span><strong>Problem melden</strong><small>Fahrzeug + Beschreibung + Bild</small></span></article>
            <article><b>02</b><span><strong>Werkstatt reagiert</strong><small>Termin bestätigen oder Gegenvorschlag senden</small></span></article>
            <article><b>03</b><span><strong>Diagnose & Rückfrage</strong><small>direkt im Fahrzeugvorgang</small></span></article>
            <article><b>04</b><span><strong>Freigeben & aktuell bleiben</strong><small>bis Reparatur, Abholung und Rechnung</small></span></article>
          </div>
        </div>
      </section>

      <section className="mp-cta"><div className="wrap"><div><span>AUTOFAHRER</span><h2>Werkstatt finden und deine digitale Fahrzeugakte starten.</h2></div><button className="btn white xl" onClick={()=>setView('finder')}>Werkstatt finden <ArrowRight/></button></div></section>
    </main>
    <PublicFooter setView={setView}/>
  </div>;
}

export function WorkshopMarketingPage({setView}:{setView:(view:AppView)=>void}){
  return <div className="mp-page">
    <main>
      <section className="mp-hero workshop"><div className="mp-orb one"/><div className="mp-orb two"/><div className="wrap mp-hero-grid">
        <div><BackHome setView={setView}/><span className="mp-kicker"><Sparkles/> MOTORATLAS FÜR WERKSTÄTTEN</span><h1>Personal entlasten. Abläufe beschleunigen. <em>Professioneller wachsen.</em></h1><p>MotorAtlas verbindet öffentliche Werkstattpräsenz, Kundenanfrage, Termin, Fahrzeugannahme, Diagnose, Kostenvoranschlag, Freigabe, Reparatur und Rechnung in einem Echtzeit-Ablauf – ohne dem Mechaniker zusätzliche Bürokratie aufzubürden.</p><div className="mp-actions"><button className="btn primary xl" onClick={()=>setView('login')}>Als Werkstatt starten <ArrowRight size={17}/></button><button className="btn secondary xl" onClick={()=>setView('office')}>Produktdemo öffnen</button></div></div>
        <div className="mp-showcase flow-card"><div className="mp-flow-head"><div><small>WERKSTATT-FLOW</small><b>Was läuft gerade?</b></div><span><i/> LIVE</span></div><div className="mp-flow-lanes">{['Eingetroffen','Diagnose','Freigabe','Reparatur','Abholung'].map((name,index)=><article key={name}><header><span>{name}</span><b>{index===0?3:index===2?2:1}</b></header><div><Car/><strong>{['BMW X3','VW Golf','Audi A4','BMW 320d','Skoda Octavia'][index]}</strong><small>{['SAD XX 123','SAD AB 45','R XY 880','N LM 320','CHA Q 71'][index]}</small></div></article>)}</div></div>
      </div></section>

      <section className="wrap mp-section"><div className="mp-section-head"><span>VOM EIN-MANN-BETRIEB BIS ZUM TEAM</span><h2>Die Software passt sich an die Werkstatt an. <em>Nicht umgekehrt.</em></h2><p>Einzelbetriebe arbeiten auf einem Gerät durchgängig. Größere Betriebe trennen Büro, Mechaniker und Verwaltung über Rollen und Rechte.</p></div><div className="mp-grid three">
        <article className="mp-feature"><Building2/><b>Büro</b><p>Anfragen, Termine, Fahrzeugannahme, Kostenvoranschläge, Freigaben, Dokumente und Abholung.</p></article>
        <article className="mp-feature"><Wrench/><b>Werkstatt</b><p>Auftrag übernehmen, Diagnose dokumentieren, freigegebene Reparatur bearbeiten und abschließen.</p></article>
        <article className="mp-feature"><Users/><b>Inhaber</b><p>Mitarbeiter, Rechte, Werkstattprofil, Branding und Gesamtüberblick – ohne doppelte Datensätze.</p></article>
      </div></section>

      <section className="mp-band dark"><div className="wrap mp-operations"><div><span className="mp-kicker light">EIN STATUS ENTSTEHT AUS DER ARBEIT</span><h2>Kein Mechaniker soll den ganzen Tag <em>Statusfelder pflegen.</em></h2><p>Der Ablauf wird aus echten Aktionen abgeleitet: Fahrzeug eingetroffen, Diagnose abgeschlossen, Kunde hat freigegeben, Reparatur abgeschlossen.</p></div><div className="mp-action-stack"><article><b>1</b><span><strong>Auftrag übernehmen</strong><small>Diagnose- oder Reparaturqueue</small></span></article><article><b>2</b><span><strong>Ergebnis eintragen</strong><small>nur die tatsächlich relevante Diagnose</small></span></article><article><b>3</b><span><strong>Arbeit abschließen</strong><small>MotorAtlas aktualisiert den Workflow</small></span></article></div></div></section>

      <section className="wrap mp-section split reverse"><div className="mp-doc-stack"><article><FileCheck2/><div><small>KOSTENVORANSCHLAG</small><b>KV 2026-00841</b><span>328,40 € · PDF</span></div><i>FREIGABE AUSSTEHEND</i></article><article><FileText/><div><small>RECHNUNG</small><b>RE 2026-00612</b><span>742,80 € · Original</span></div><i className="done">BEREIT</i></article></div><div><span className="mp-kicker">DOKUMENTE IM VORGANG</span><h2>Kein Suchen nach Anhängen, Chatverläufen und <em>„welche Version war aktuell?“</em></h2><p>Dokumente werden dem Auftrag zugeordnet. Freigaben bleiben als eigene Entscheidung getrennt vom Chat und sind zeitlich nachvollziehbar.</p><div className="mp-checks"><span><CheckCircle2/> PDF-Dokumente direkt am Auftrag</span><span><CheckCircle2/> Versionen bleiben nachvollziehbar</span><span><CheckCircle2/> Freigabe separat vom Chat</span><span><CheckCircle2/> Architektur für strukturierte E-Rechnungen</span></div></div></section>

      <section className="wrap mp-section"><div className="mp-section-head"><span>DEINE MARKE, NICHT UNSERE SCHABLONE</span><h2>MotorAtlas kann sich visuell an deine Werkstatt <em>anpassen.</em></h2><p>Logo und ausgewählte Markenfarben fließen dezent in Navigation, Akzente und Oberflächen ein – ohne die Bedienbarkeit zu beeinträchtigen.</p></div><div className="mp-brand-demo"><div className="mp-brand-logo">CS</div><div><small>ADAPTIVE WORKSHOP IDENTITY</small><b>Carplus Service Center</b><span>Logo → Akzentfarben → professionelle Werkstattoberfläche</span></div><div className="mp-swatches"><i/><i/><i/></div></div></section>


      <section className="wrap mp-section mp-outcomes">
        <div className="mp-section-head"><span>WELCHE PROBLEME MOTORATLAS LÖST</span><h2>Weniger unproduktive Kommunikation. <em>Mehr Zeit für Kunden und Fahrzeuge.</em></h2><p>MotorAtlas ersetzt nicht den persönlichen Kontakt. Es nimmt der Werkstatt die wiederkehrenden organisatorischen Schleifen ab, die Zeit kosten und keinen Umsatz erzeugen.</p></div>
        <div className="mp-problem-solution">
          <article><span>PROBLEM</span><b>Telefon klingelt für jeden Status</b><p>Kunden fragen nach Termin, Diagnose, Kosten oder Abholung.</p><i/><strong>MOTORATLAS</strong><small>Der aktuelle Stand ist im Kundenportal sichtbar. Rückfragen bleiben möglich, aber nicht mehr zwingend.</small></article>
          <article><span>PROBLEM</span><b>Büro und Werkstatt arbeiten mit Zetteln oder Zurufen</b><p>Informationen gehen verloren oder müssen doppelt erfasst werden.</p><i/><strong>MOTORATLAS</strong><small>Fahrzeug eingetroffen → Diagnosequeue → Freigabe → Reparaturqueue. Ein gemeinsamer Live-Vorgang.</small></article>
          <article><span>PROBLEM</span><b>Freigaben dauern und Fahrzeuge blockieren Platz</b><p>Der Kunde ist nicht erreichbar oder versteht nicht, worum es geht.</p><i/><strong>MOTORATLAS</strong><small>Diagnose, KVA und Chat liegen im selben Vorgang. Die verbindliche Freigabe erfolgt separat und nachvollziehbar.</small></article>
          <article><span>PROBLEM</span><b>Neue Kunden finden die Werkstatt nicht professionell online</b><p>Website, Google-Eintrag und Telefon geben oft nur einen Teil der Informationen wieder.</p><i/><strong>MOTORATLAS</strong><small>Öffentliches Profil mit Leistungen, Öffnungszeiten, Standort, Bildern und direkter Kundenanfrage.</small></article>
        </div>
      </section>

      <section className="mp-band dark revenue-band">
        <div className="wrap mp-revenue-grid">
          <div><span className="mp-kicker light">PERSONAL ENTLASTEN · UMSATZPOTENZIAL · PROFESSIONALITÄT</span><h2>MotorAtlas soll nicht mehr Arbeit machen. <em>Es soll Arbeit wegnehmen.</em></h2><p>Der wirtschaftliche Vorteil entsteht nicht durch ein einzelnes Feature, sondern durch weniger Unterbrechungen, schnellere Entscheidungen und eine professionellere digitale Kundenschnittstelle.</p></div>
          <div className="mp-revenue-cards">
            <article><Users/><b>Personal entlasten</b><span>Weniger Statusanrufe, doppelte Dateneingaben und interne Rückfragen.</span></article>
            <article><Gauge/><b>Durchlauf beschleunigen</b><span>Schnellere Diagnoseweitergabe und Freigaben können Standzeiten reduzieren.</span></article>
            <article><Building2/><b>Professioneller auftreten</b><span>Einheitliches Profil, klarer Workflow und transparente Kommunikation schaffen Vertrauen.</span></article>
            <article><Sparkles/><b>Mehr Umsatzpotenzial</b><span>24/7 auffindbar, weniger verpasste Anfragen und mehr nutzbare Zeit für wertschöpfende Werkstattarbeit.</span></article>
          </div>
        </div>
      </section>

      <section className="wrap mp-section">
        <div className="mp-section-head"><span>WARUM MOTORATLAS STATT EINER WEITEREN EINZELLÖSUNG?</span><h2>Weil Werkstattsuche allein nicht reicht. <em>Und interne Software den Kunden nicht automatisch mitnimmt.</em></h2><p>MotorAtlas verbindet öffentliche Sichtbarkeit, Kundenanfrage und den tatsächlichen Werkstattprozess in einer Plattform.</p></div>
        <div className="mp-compare-table">
          <div className="head"><span>Funktion</span><b>Typische Einzellösung</b><strong>MotorAtlas</strong></div>
          <div><span>Werkstatt öffentlich finden</span><b>häufig ja</b><strong>ja</strong></div>
          <div><span>Termin / Anfrage online</span><b>häufig ja</b><strong>ja</strong></div>
          <div><span>Fahrzeugspezifischer Vorgang bleibt bestehen</span><b>je nach Anbieter</b><strong>ja</strong></div>
          <div><span>Diagnose → KVA → Freigabe → Reparatur</span><b>oft getrennte Systeme</b><strong>ein Workflow</strong></div>
          <div><span>Kunde sieht aktuellen Stand</span><b>je nach Anbieter</b><strong>integriert</strong></div>
          <div><span>Mechanikeroberfläche ohne Finanzballast</span><b>nicht der Fokus vieler Portale</b><strong>rollenbasiert</strong></div>
          <div><span>Öffentliches Werkstattprofil + interner Ablauf</span><b>meist getrennt</b><strong>verbunden</strong></div>
        </div>
        <small className="mp-compare-note">Andere Produkte unterscheiden sich im Funktionsumfang. Die Gegenüberstellung beschreibt bewusst die typische Aufteilung in Werkstattportal, Terminlösung, Messenger und interne Werkstattsoftware – nicht jedes einzelne Wettbewerbsprodukt.</small>
      </section>

      <section className="mp-cta"><div className="wrap"><div><span>WERKSTATT</span><h2>MotorAtlas als digitale Arbeitsoberfläche deiner Werkstatt starten.</h2></div><button className="btn white xl" onClick={()=>setView('login')}>Werkstattkonto starten <ArrowRight/></button></div></section>
    </main>
    <PublicFooter setView={setView}/>
  </div>;
}

export function SecurityMarketingPage({setView}:{setView:(view:AppView)=>void}){
  return <div className="mp-page security-page">
    <main>
      <section className="mp-hero security"><div className="mp-orb one"/><div className="mp-orb two"/><div className="wrap mp-hero-grid">
        <div><BackHome setView={setView}/><span className="mp-kicker"><ShieldCheck/> SICHERHEIT & TRANSPARENZ</span><h1>Klare Rechte. Klare Entscheidungen. <em>Klare Historie.</em></h1><p>MotorAtlas trennt Kommunikation, operative Arbeit, Freigaben und Dokumente bewusst voneinander. Das reduziert Fehlinterpretationen und unnötige Datenzugriffe.</p></div>
        <div className="mp-showcase security-core"><ShieldCheck/><span>SICHERHEITSARCHITEKTUR</span><h3>Zugriff nach Rolle und Beziehung</h3><p>Kunde, Büro, Mechaniker und Inhaber sehen unterschiedliche Informationen – passend zu ihrer Aufgabe und zum jeweiligen Auftrag.</p><div><span><LockKeyhole/> Rollenbasierte Rechte</span><span><Clock3/> nachvollziehbare Ereignisse</span><span><FileCheck2/> getrennte Freigaben</span></div></div>
      </div></section>

      <section className="wrap mp-section"><div className="mp-section-head"><span>GRUNDPRINZIPIEN</span><h2>Sicherheit beginnt nicht beim Passwort. <em>Sondern bei der Produktlogik.</em></h2><p>Weniger unnötige Sichtbarkeit, weniger Vermischung und eine nachvollziehbare Historie sind feste Bestandteile des Datenmodells.</p></div><div className="mp-grid four">
        <article className="mp-feature"><Users/><b>Rollen & Rechte</b><p>Mechaniker sehen nicht automatisch Finanz- oder Verwaltungsinformationen.</p></article>
        <article className="mp-feature"><Car/><b>Fahrzeugbezug</b><p>Werkstattzugriff entsteht durch Kundenbeziehung oder konkreten Auftrag.</p></article>
        <article className="mp-feature"><MessageCircle/><b>Chat ≠ Freigabe</b><p>Eine Nachricht ist Kommunikation. Eine Reparaturfreigabe bleibt eine separate Aktion.</p></article>
        <article className="mp-feature"><FileText/><b>Dokumenthistorie</b><p>Offizielle Dokumente und Versionen werden nicht stillschweigend überschrieben.</p></article>
      </div></section>

      <section className="mp-band"><div className="wrap mp-security-separation"><div><span className="mp-kicker">BEWUSSTE TRENNUNG</span><h2>Vier Dinge, die MotorAtlas <em>nicht vermischt.</em></h2></div><div className="mp-separation-grid"><article><MessageCircle/><b>Chat</b><span>Rückfragen und Kommunikation</span></article><article><Gauge/><b>Status</b><span>aus echten Arbeitsschritten abgeleitet</span></article><article><FileCheck2/><b>Freigabe</b><span>eigene dokumentierte Entscheidung</span></article><article><FileText/><b>Dokument</b><span>offizielle Datei mit Version</span></article></div></div></section>

      <section className="wrap mp-section split"><div><span className="mp-kicker">DATENZUGRIFF</span><h2>Der Kunde besitzt die Fahrzeugbeziehung. <em>Die Werkstatt erhält den nötigen Zugriff.</em></h2><p>Wird eine Werkstattbeziehung beendet, soll kein dauerhafter pauschaler Zugriff auf das Fahrzeug bestehen bleiben. Historische Geschäftsvorgänge müssen trotzdem nachvollziehbar bleiben.</p><div className="mp-checks"><span><CheckCircle2/> Kundenkonto verwaltet die Fahrzeuge</span><span><CheckCircle2/> Werkstattzugriff über Beziehung oder Auftrag</span><span><CheckCircle2/> Teamrechte innerhalb der Werkstatt</span><span><CheckCircle2/> Historische Vorgänge bleiben getrennt nachvollziehbar</span></div></div><div className="mp-permission-card"><small>ZUGRIFFSBEISPIEL</small><div><b>Kunde</b><span>Fahrzeuge · Anfragen · Freigaben · Dokumente</span><i className="full">voll</i></div><div><b>Büro</b><span>Kunde · Termin · Auftrag · Dokumente</span><i className="full">operativ</i></div><div><b>Mechaniker</b><span>Werkstattkarte · Diagnose · Reparatur</span><i>begrenzt</i></div><div><b>Plattform</b><span>kein alltägliches Browsen von Kundendaten</span><i>minimal</i></div></div></section>

      <section className="wrap mp-section"><div className="mp-section-head"><span>TECHNISCHE BASIS</span><h2>Eine zentrale Datenbasis statt <em>auseinanderlaufender Geräte.</em></h2><p>Büro-PC, Werkstatt-Tablet und Kundenhandy greifen auf denselben aktuellen Vorgang zu. Änderungen werden synchronisiert, statt auf einzelnen Geräten unterschiedliche Wahrheiten zu erzeugen.</p></div><DeviceRibbon/></section>

      <section className="mp-cta"><div className="wrap"><div><span>TRANSPARENT</span><h2>MotorAtlas soll Vertrauen durch nachvollziehbare Abläufe verdienen.</h2></div><button className="btn white xl" onClick={()=>setView('login')}>MotorAtlas öffnen <ArrowRight/></button></div></section>
    </main>
    <PublicFooter setView={setView}/>
  </div>;
}
