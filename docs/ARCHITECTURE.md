# MotorAtlas Architektur

## Produktfluss
Kunde → Fahrzeug → Anfrage → Termin → Ankunft → Diagnose → Kostenvoranschlag → Freigabe → Reparatur → Rechnung → Historie.

## Oberflächen
- **motoratlas.de:** öffentliche Premium-Marketingseite.
- **Kundenportal:** Garage, Anfragen, Termine, Chat, Freigaben, Dokumente.
- **Büro:** Kundenanfragen, Fahrzeugannahme, Diagnoseeingänge, KVA/Rechnung, Abholung.
- **Werkstatt:** extrem reduzierte digitale Werkstattkarte mit Diagnose-/Reparaturqueue.
- **Einzelbetrieb:** dieselben Rechte können auf einem einzigen Gerät zusammenlaufen.

## Backend
Supabase/PostgreSQL:
- Auth
- RLS
- Realtime
- private Storage-Buckets
- Audit-Events
- unveränderbare Dokumentversionen
- fahrzeug-/auftragsbezogener Chat

## Kommunikation
Chat ist Kommunikation, nicht Freigabe. Eine Reparaturfreigabe wird separat als formelle Aktion protokolliert.

## Plattformen
- Desktop/Tablet/Mobil: responsive Web-App
- iPhone/iPad: installierbare PWA/Home-Screen-App
- Android: Capacitor-App/APK aus derselben Web-Codebasis
