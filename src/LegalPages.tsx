import { ArrowLeft, Database, FileText, LockKeyhole, ShieldCheck } from 'lucide-react';
import type { AppView } from './components';

const controller={
  business:'Carplus Service Center',
  owner:'Patrick Wittner',
  street:'Bellstraße 20',
  city:'92421 Schwandorf',
  country:'Deutschland',
  phone:'+49 159 01796033',
  email:'info@wipa-group.de',
  vat:'DE420305895'
};

function LegalBack({setView}:{setView:(view:AppView)=>void}){
  return <button className="legal-back" onClick={()=>setView('home')}><ArrowLeft/> Zur Startseite</button>;
}

export function PublicLegalStrip({setView}:{setView:(view:AppView)=>void}){
  return <div className="legal-bottom">
    <span>© 2026 MotorAtlas</span>
    <span>·</span>
    <button onClick={()=>setView('imprint')}>Impressum</button>
    <span>·</span>
    <button onClick={()=>setView('privacy')}>Datenschutz</button>
    <span>·</span>
    <button onClick={()=>setView('security-info')}>Sicherheit</button>
  </div>;
}

function LegalFooter({setView}:{setView:(view:AppView)=>void}){
  return <PublicLegalStrip setView={setView}/>;
}

export function ImprintPage({setView}:{setView:(view:AppView)=>void}){
  return <main className="legal-page">
    <section className="legal-hero">
      <div className="wrap legal-hero-inner">
        <LegalBack setView={setView}/>
        <span>RECHTLICHE INFORMATIONEN</span>
        <h1>Impressum</h1>
        <p>Anbieterkennzeichnung für MotorAtlas nach § 5 Digitale-Dienste-Gesetz (DDG).</p>
      </div>
    </section>

    <section className="wrap legal-layout">
      <article className="legal-card">
        <h2>Angaben zum Diensteanbieter</h2>
        <p><strong>{controller.business}</strong><br/>
        Inhaber: {controller.owner}<br/>
        {controller.street}<br/>
        {controller.city}<br/>
        {controller.country}</p>
      </article>

      <article className="legal-card">
        <h2>Kontakt</h2>
        <p>Telefon: <a href="tel:+4915901796033">{controller.phone}</a><br/>
        E-Mail: <a href={'mailto:'+controller.email}>{controller.email}</a><br/>
        Online-Angebot: motoratlas.de</p>
      </article>

      <article className="legal-card">
        <h2>Umsatzsteuer</h2>
        <p>Umsatzsteuer-Identifikationsnummer gemäß § 27a Umsatzsteuergesetz:<br/>
        <strong>{controller.vat}</strong></p>
      </article>

      <article className="legal-card">
        <h2>Verantwortung für MotorAtlas</h2>
        <p>Verantwortlich für das Angebot MotorAtlas ist {controller.owner}, Anschrift wie oben.</p>
        <p className="legal-note">Soweit künftig journalistisch-redaktionell gestaltete Inhalte im Sinne des § 18 Abs. 2 Medienstaatsvertrag angeboten werden, gilt die vorstehend genannte natürliche Person zugleich als hierfür benannter Verantwortlicher.</p>
      </article>

      <article className="legal-card">
        <h2>Hinweis zur Plattform</h2>
        <p>MotorAtlas stellt digitale Funktionen zur Verbindung von Autofahrern und Werkstätten bereit. Öffentlich dargestellte Werkstattinformationen werden von den jeweiligen Werkstätten bereitgestellt beziehungsweise durch MotorAtlas im Rahmen der Plattformfreigabe veröffentlicht.</p>
      </article>
    </section>
    <LegalFooter setView={setView}/>
  </main>;
}

export function PrivacyPage({setView}:{setView:(view:AppView)=>void}){
  return <main className="legal-page">
    <section className="legal-hero privacy">
      <div className="wrap legal-hero-inner">
        <LegalBack setView={setView}/>
        <span>DATENSCHUTZ BEI MOTORATLAS</span>
        <h1>Datenschutzerklärung</h1>
        <p>Informationen über die Verarbeitung personenbezogener Daten bei Website, Benutzerkonto, Werkstattsuche und Werkstattaufträgen.</p>
      </div>
    </section>

    <section className="wrap legal-summary">
      <article><LockKeyhole/><div><b>Passwörter nicht im Klartext</b><span>Authentifizierung über Supabase Auth; Passwörter werden als kryptografische Hashes gespeichert.</span></div></article>
      <article><Database/><div><b>Primäre Datenregion Frankfurt</b><span>Das MotorAtlas-Supabase-Projekt läuft in eu-central-1.</span></div></article>
      <article><ShieldCheck/><div><b>Zugriff nach Rolle und Beziehung</b><span>Datenzugriff wird über Anmeldung, Rollen und Row Level Security begrenzt.</span></div></article>
    </section>

    <section className="wrap legal-layout privacy-layout">
      <article className="legal-card">
        <h2>1. Verantwortlicher</h2>
        <p>Verantwortlich für die Verarbeitung personenbezogener Daten im Zusammenhang mit MotorAtlas ist:</p>
        <p><strong>{controller.business}</strong><br/>
        Inhaber: {controller.owner}<br/>
        {controller.street}<br/>
        {controller.city}<br/>
        {controller.country}</p>
        <p>E-Mail: <a href={'mailto:'+controller.email}>{controller.email}</a><br/>
        Telefon: <a href="tel:+4915901796033">{controller.phone}</a></p>
      </article>

      <article className="legal-card">
        <h2>2. Welche Daten verarbeitet MotorAtlas?</h2>
        <p>Je nach Nutzung können insbesondere folgende Daten verarbeitet werden:</p>
        <ul>
          <li>Kontodaten wie Name, E-Mail-Adresse und Authentifizierungsinformationen,</li>
          <li>Adressdaten, soweit sie für Kundenkonto, Werkstattbeziehung oder Auftragsabwicklung benötigt werden,</li>
          <li>Fahrzeugdaten wie Hersteller, Modell, Kennzeichen, HSN/TSN, FIN/VIN, Kilometerstand und Fahrzeugbilder,</li>
          <li>Werkstattdaten wie Firmenname, Anschrift, Öffnungszeiten, Leistungen, Logo und öffentliche Profilangaben,</li>
          <li>Anfragen, Termine, Diagnoseangaben, Kostenvoranschläge, Freigaben, Reparaturstatus und Rechnungsdokumente,</li>
          <li>fahrzeug- und auftragsbezogene Chatnachrichten und Anhänge,</li>
          <li>technische Sicherheits- und Sitzungsdaten, die für Anmeldung, Betrieb und Missbrauchsschutz erforderlich sind.</li>
        </ul>
      </article>

      <article className="legal-card">
        <h2>3. Benutzerkonto und Anmeldung</h2>
        <p>Für Registrierung und Anmeldung wird Supabase Auth eingesetzt. Die E-Mail-Adresse dient der Kontoidentifikation, E-Mail-Bestätigung, Anmeldung und Passwortwiederherstellung.</p>
        <p>Passwörter werden von MotorAtlas nicht als Klartext gespeichert. Der Authentifizierungsdienst speichert stattdessen einen kryptografischen Passwort-Hash. Für Sitzungsverwaltung und Kontosicherheit werden technische Authentifizierungsdaten verarbeitet.</p>
        <p>Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO, soweit die Verarbeitung zur Bereitstellung des Nutzerkontos und der angeforderten Plattformfunktionen erforderlich ist. Sicherheitsmaßnahmen können zusätzlich auf Art. 6 Abs. 1 lit. f DSGVO gestützt werden.</p>
      </article>

      <article className="legal-card">
        <h2>4. E-Mail-Bestätigung und Passwortwiederherstellung</h2>
        <p>MotorAtlas unterstützt die Bestätigung der bei der Registrierung verwendeten E-Mail-Adresse. Für vergessene Passwörter kann ein zeitlich begrenzter Rücksetz-Link an die hinterlegte E-Mail-Adresse angefordert werden.</p>
        <p>Aus Sicherheitsgründen teilt die Passwort-zurücksetzen-Funktion nicht mit, ob eine eingegebene E-Mail-Adresse tatsächlich bei MotorAtlas registriert ist.</p>
      </article>

      <article className="legal-card">
        <h2>5. Fahrzeug-, Werkstatt- und Auftragsdaten</h2>
        <p>Fahrzeug- und Auftragsdaten werden verarbeitet, um Anfragen, Termine, Diagnosen, Kostenvoranschläge, Freigaben, Reparaturen, Kommunikation und Dokumente dem richtigen Fahrzeug und Vorgang zuzuordnen.</p>
        <p>Wenn ein Autofahrer eine konkrete Werkstatt auswählt oder anfragt, werden die für die Werkstattbeziehung beziehungsweise den Auftrag notwendigen Daten dieser Werkstatt und den dort berechtigten Mitarbeitern zugänglich gemacht. Die jeweilige Werkstatt kann für die Verarbeitung im Rahmen ihrer eigenen Werkstattleistung zusätzlich selbst datenschutzrechtlich verantwortlich sein.</p>
        <p>Rechtsgrundlage ist regelmäßig Art. 6 Abs. 1 lit. b DSGVO. Gesetzlich erforderliche Aufbewahrungen, insbesondere im Zusammenhang mit Rechnungen, können auf Art. 6 Abs. 1 lit. c DSGVO beruhen.</p>
      </article>

      <article className="legal-card">
        <h2>6. Chat und Anhänge</h2>
        <p>Der MotorAtlas-Chat ist fahrzeug- beziehungsweise auftragsbezogen. Nachrichten, Bilder und Dokumente werden zur Kommunikation zwischen Kunde und Werkstatt gespeichert. Eine Chatnachricht ersetzt keine gesonderte Reparaturfreigabe; Freigaben werden als eigene Aktion protokolliert.</p>
        <p>Bitte lade keine besonderen Kategorien personenbezogener Daten im Sinne von Art. 9 DSGVO hoch, sofern dies für den Werkstattvorgang nicht zwingend erforderlich ist.</p>
      </article>

      <article className="legal-card">
        <h2>7. Hosting, Datenbank und Auftragsverarbeitung</h2>
        <p>MotorAtlas nutzt Supabase für Datenbank, Authentifizierung, Dateispeicherung und Echtzeitfunktionen. Das primäre MotorAtlas-Projekt ist in der Region <strong>eu-central-1 (Frankfurt)</strong> eingerichtet.</p>
        <p>Supabase, Inc. wird im Rahmen der eingesetzten Dienste als Auftragsverarbeiter eingesetzt. Supabase stellt hierfür ein Data Processing Addendum bereit und veröffentlicht eine Liste eingesetzter Unterauftragsverarbeiter. Je nach Teilfunktion können technische Metadaten oder unterstützende Dienste auch durch Unterauftragsverarbeiter außerhalb des Europäischen Wirtschaftsraums verarbeitet werden; hierfür sind die jeweils anwendbaren datenschutzrechtlichen Garantien zu berücksichtigen.</p>
      </article>

      <article className="legal-card">
        <h2>8. Kartenansicht mit OpenStreetMap</h2>
        <p>Für die Kartenansicht in der Werkstattsuche werden Kartenkacheln der OpenStreetMap Foundation (OSMF) direkt vom Browser geladen. Dabei können insbesondere IP-Adresse, Browser- und Gerätedaten, Referrer sowie Datum und Uhrzeit des Abrufs an die OSMF beziehungsweise deren technische Auslieferungsinfrastruktur übermittelt werden.</p>
        <p>Die Kartenfunktion dient der nutzerfreundlichen Darstellung öffentlich gelisteter Werkstätten. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO; das berechtigte Interesse liegt in der verständlichen geografischen Darstellung der Werkstattsuche. Die OpenStreetMap Foundation verarbeitet die bei ihren Diensten anfallenden Daten in eigener datenschutzrechtlicher Verantwortung.</p>
        <p>Weitere Informationen: osmfoundation.org/wiki/Privacy_Policy</p>
      </article>

      <article className="legal-card">
        <h2>9. Technisch erforderliche Speicherung auf dem Endgerät</h2>
        <p>MotorAtlas nutzt für Anmeldung, Sitzungsverwaltung, Navigation und ausgewählte kurzfristige Zustände technisch erforderliche Browser-Speichermechanismen. Diese dienen nicht der werblichen Profilbildung.</p>
        <p>Soweit Informationen ausschließlich erforderlich gespeichert oder ausgelesen werden, um den vom Nutzer ausdrücklich angeforderten digitalen Dienst bereitzustellen, erfolgt dies im Rahmen von § 25 Abs. 2 TDDDG ohne gesonderte Einwilligung. Werden künftig optionale Analyse-, Marketing- oder vergleichbare Technologien eingesetzt, wird hierfür – soweit erforderlich – vorab eine Einwilligung eingeholt.</p>
      </article>

      <article className="legal-card">
        <h2>10. Speicherdauer</h2>
        <p>Personenbezogene Daten werden nur so lange gespeichert, wie dies für den jeweiligen Zweck erforderlich ist. Kontodaten werden grundsätzlich bis zur Löschung des Kontos beziehungsweise bis zum Wegfall des Nutzungszwecks verarbeitet. Auftrags- und Rechnungsdaten können aufgrund gesetzlicher handels- und steuerrechtlicher Pflichten länger aufzubewahren sein.</p>
        <p>Sicherheits- und Protokolldaten werden nur für den Zeitraum vorgehalten, der zur Absicherung, Fehleranalyse und Missbrauchsabwehr erforderlich ist.</p>
      </article>

      <article className="legal-card">
        <h2>11. Rechtsgrundlagen</h2>
        <ul>
          <li>Art. 6 Abs. 1 lit. b DSGVO für Konto, Plattformnutzung, Anfragen, Termine und Auftragsabwicklung,</li>
          <li>Art. 6 Abs. 1 lit. c DSGVO für gesetzliche Aufbewahrungs- und Nachweispflichten,</li>
          <li>Art. 6 Abs. 1 lit. f DSGVO für IT-Sicherheit, Missbrauchsabwehr, Fehleranalyse und die sichere Bereitstellung der Plattform,</li>
          <li>Art. 6 Abs. 1 lit. a DSGVO nur dort, wo künftig eine freiwillige Einwilligung ausdrücklich eingeholt wird.</li>
        </ul>
      </article>

      <article className="legal-card">
        <h2>12. Rechte betroffener Personen</h2>
        <p>Im Rahmen der gesetzlichen Voraussetzungen bestehen insbesondere Rechte auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch. Erteilte Einwilligungen können für die Zukunft widerrufen werden.</p>
        <p>Zur Ausübung dieser Rechte genügt eine Nachricht an <a href={'mailto:'+controller.email}>{controller.email}</a>. Vor Herausgabe oder Löschung personenbezogener Daten kann eine geeignete Identitätsprüfung erforderlich sein.</p>
      </article>

      <article className="legal-card">
        <h2>13. Beschwerderecht</h2>
        <p>Betroffene Personen haben das Recht, sich bei einer Datenschutzaufsichtsbehörde zu beschweren. Für nicht-öffentliche Stellen in Bayern ist insbesondere das Bayerische Landesamt für Datenschutzaufsicht (BayLDA) zuständig.</p>
        <p>Bayerisches Landesamt für Datenschutzaufsicht<br/>
        Promenade 18<br/>
        91522 Ansbach<br/>
        Website: www.lda.bayern.de</p>
      </article>

      <article className="legal-card">
        <h2>14. Keine automatisierte Einzelentscheidung</h2>
        <p>MotorAtlas trifft derzeit keine ausschließlich automatisierten Entscheidungen mit rechtlicher oder vergleichbar erheblicher Wirkung im Sinne von Art. 22 DSGVO über Autofahrer oder Werkstätten.</p>
      </article>

      <article className="legal-card">
        <h2>15. Stand und Änderungen</h2>
        <p>Stand: September 2026. Diese Datenschutzerklärung wird angepasst, wenn sich Funktionen, eingesetzte Dienstleister oder rechtliche Anforderungen ändern. Wesentliche Änderungen werden in geeigneter Weise kenntlich gemacht.</p>
      </article>
    </section>
    <LegalFooter setView={setView}/>
  </main>;
}
