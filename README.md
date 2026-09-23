# MotorAtlas — Premium Werkstattplattform (Neuaufbau)

Dieses Paket ersetzt das bisherige MotorAtlas-Produktkonzept durch eine Werkstatt-/Kundenplattform für PKW.

## Produktkern

Kunde → Fahrzeug → Anfrage → Termin → Fahrzeug eingetroffen → Diagnose → Kostenvoranschlag → Kundenfreigabe → Reparatur → Rechnung → Fahrzeughistorie.

- nur PKW
- mehrere Fahrzeuge je Kundenkonto
- Werkstätten entscheiden über Aufnahme neuer Kunden
- Stammwerkstatt und einmalige Werkstattanfragen
- Echtzeit-Synchronisierung Büro ↔ Werkstatt ↔ Kunde
- Team-Betrieb mit Rollen und Berechtigungen
- Einzelbetrieb auf einem einzigen Handy/Tablet/PC
- PDF-Dokumente pro Auftrag; Architektur für ZUGFeRD/XRechnung
- Audit-Trail statt überschreibbarer Historie
- adaptives Branding anhand des Werkstattlogos
- fahrzeug-/auftragsbezogener Echtzeit-Chat zwischen Kunde und Werkstatt
- Chat-Rechte: Büro/Owner, explizite Custom-Berechtigung oder aktiv zugewiesener Mechaniker
- Chat-Anhänge (Bilder/PDF) in privatem Storage; Nachrichten append-only
- Reparaturfreigaben bleiben bewusst getrennt vom Chat und werden separat protokolliert

`preview.html` ist ein ausführbarer Design-/UX-Prototyp ohne Backend.

## Stand 3.0.0-alpha.3

- vollständige Premium-Marketingseite für `motoratlas.de`
- klare Trennung Marketing → Login → Rollenoberfläche
- freigegebene Produktvision als `public/product-vision.png` integriert
- responsive Büro-, Werkstatt- und Kundenansichten
- adaptives Werkstattbranding
- PWA-Manifest, App-Icons und sicher eingeschränkter Service Worker
- iPhone/iPad Home-Screen vorbereitet
- Android-App-Container mit Capacitor 8 vorbereitet
- Supabase-Schema, RLS, Realtime-, Chat- und Dokumentenworkflow bilden das Produktbackend

Siehe `docs/MARKETING_SITE.md`, `docs/MOBILE_APPS.md` und `docs/DEPLOYMENT.md`.