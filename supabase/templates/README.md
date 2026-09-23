# MotorAtlas Auth E-Mail Templates

Diese Dateien sind die produktionsreifen HTML-Vorlagen für Supabase Auth.

## Supabase Dashboard

Authentication → Email Templates

### Confirm signup
Subject:
`MotorAtlas – E-Mail-Adresse bestätigen`

HTML:
`supabase/templates/confirm-signup.html`

### Reset password
Subject:
`MotorAtlas – Passwort zurücksetzen`

HTML:
`supabase/templates/recovery.html`

### Invite user
Subject:
`MotorAtlas – Deine Einladung`

HTML:
`supabase/templates/invite.html`

### Change email address
Subject:
`MotorAtlas – Neue E-Mail-Adresse bestätigen`

HTML:
`supabase/templates/email-change.html`

### Password changed notification
Subject:
`MotorAtlas – Dein Passwort wurde geändert`

HTML:
`supabase/templates/password-changed.html`

## Wichtige Variablen

Die Auth-Templates verwenden Supabase Go-Template-Variablen wie:
- `{{ .ConfirmationURL }}`
- `{{ .NewEmail }}`

Die Links bleiben dadurch mit dem bestehenden Supabase-Auth-Flow kompatibel.

## Mail-Client-Kompatibilität

Die Layouts sind absichtlich:
- tabellenbasiert,
- vollständig inline gestylt,
- ohne externe Schriftarten,
- ohne zwingend erforderliche Bilder.

So bleiben sie in Apple Mail, Gmail und Outlook stabil.

## Tracking

Open- und Click-Tracking bei Resend bleibt deaktiviert. Supabase weist darauf hin, dass Link-Tracking Auth-Links verändern und dadurch Bestätigungslinks stören kann.
