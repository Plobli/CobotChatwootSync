# Cobot-Chatwoot Sync

Synchronisiert Mitgliederdaten von Cobot mit Chatwoot und bietet ein Dashboard zur Anzeige der Daten direkt in Chatwoot.

## Features

- **Webhook Integration**: Empfängt Events von Cobot (Rechnungen, Buchungen, Kündigungen)
- **Automatische Synchronisation**: Aktualisiert Kontaktdaten in Chatwoot bei Änderungen
- **Dashboard App**: Zeigt Cobot-Daten direkt in der Chatwoot Sidebar
- **Initial Sync**: Script zum einmaligen Sync aller bestehenden Mitglieder

## Komponenten

### 1. Webhook Server (`server.js`)
Läuft auf Port 3002 und empfängt Webhooks von Cobot:
- `created_invoice` - Neue Rechnungen
- `deleted_membership` - Gekündigte Mitgliedschaften
- `created_booking` / `deleted_booking` - Buchungen
- `updated_custom_field` - Custom Field Änderungen

### 2. Dashboard App (`dashboard-app/`)
Läuft auf Port 3003 und zeigt Cobot-Daten in Chatwoot:
- Mitgliedsstatus und Tarif
- Rechnungsinformationen
- Buchungshistorie
- Custom Fields (24h Zugang, Nachsendeadresse, etc.)

### 3. Sync Scripts
- `sync-all-members.js` - Initial Sync aller Mitglieder
- `sync-member.js` - Einzelner Mitglieder-Sync

## Installation

1. **Repository klonen:**
```bash
git clone <repository-url>
cd cobot-chatwoot-sync
```

2. **Dependencies installieren:**
```bash
npm install
cd dashboard-app && npm install
```

3. **Umgebungsvariablen konfigurieren:**
```bash
cp .env.example .env
nano .env
```

Erforderliche Variablen:
- `COBOT_API_TOKEN` - Cobot API Token
- `COBOT_SUBDOMAIN` - Cobot Subdomain (z.B. mitglieder.lieblingsarbeitsort.de)
- `CHATWOOT_API_URL` - Chatwoot URL (z.B. https://hilfe.lieblingsarbeitsort.de)
- `CHATWOOT_API_TOKEN` - Chatwoot API Token
- `CHATWOOT_ACCOUNT_ID` - Chatwoot Account ID (meist 1)

4. **Custom Attributes in Chatwoot erstellen:**
```bash
node create-attributes.js
```

## Deployment

### Mit PM2 (empfohlen)

```bash
# Webhook Server starten
cd /opt/cobot-chatwoot-sync
pm2 start server.js --name webhook-server

# Dashboard App starten
cd /opt/cobot-chatwoot-sync/dashboard-app
pm2 start server.js --name dashboard-app

# Konfiguration speichern
pm2 save

# Autostart einrichten
pm2 startup
```

### Reverse Proxy (Caddy)

```
# Webhook Server
hilfe-webhook.lieblingsarbeitsort.de {
    reverse_proxy localhost:3002
}

# Dashboard unter Subdomain-Path
hilfe.lieblingsarbeitsort.de {
    route /dashboard* {
        uri strip_prefix /dashboard
        header Access-Control-Allow-Origin *
        header Access-Control-Allow-Headers "Origin, X-Requested-With, Content-Type, Accept"
        reverse_proxy localhost:3003
    }
    reverse_proxy localhost:3000
}
```

## Webhook Konfiguration in Cobot

Webhook URL: `https://hilfe-webhook.lieblingsarbeitsort.de/webhook`

Aktivierte Events:
- `created_invoice`
- `deleted_membership`
- `created_booking`
- `deleted_booking`
- `updated_custom_field`

## Dashboard App Einrichtung in Chatwoot

1. Gehe zu **Einstellungen → Applications → Dashboard Apps**
2. Klicke auf **Add a new dashboard app**
3. Konfiguration:
   - **Title**: Cobot Mitgliederdaten
   - **URL**: `https://hilfe.lieblingsarbeitsort.de/dashboard/`
   - **Height**: 600

## Initial Sync

Um alle bestehenden Mitglieder zu synchronisieren:

```bash
cd /opt/cobot-chatwoot-sync
node sync-all-members.js
```

**Hinweis:** Der Sync kann bei vielen Mitgliedern länger dauern (2 Sekunden Delay pro Mitglied zur Vermeidung von Rate Limits).

## Synchronisierte Daten

Für jeden Kontakt werden folgende Custom Attributes erstellt:

- `cobot_id` - Cobot Membership ID
- `cobot_status` - Status (Aktiv/Gekündigt)
- `cobot_plan` - Tarif/Plan
- `cobot_member_since` - Mitglied seit
- `cobot_phone` - Telefonnummer
- `cobot_adresse` - Adresse
- `cobot_profile_url` - Link zum Cobot-Profil
- `cobot_last_invoice_date` - Letzte Rechnung
- `cobot_last_invoice_amount` - Rechnungsbetrag
- `cobot_last_invoice_status` - Rechnungsstatus
- `cobot_next_invoice_date` - Nächste Rechnung
- `cobot_last_booking_date` - Letzte Buchung
- `cobot_last_booking_from` / `_to` - Buchungszeitraum
- `cobot_last_booking_resource` - Gebuchte Ressource
- `cobot_booking_history` - Historie der letzten Buchungen
- `cobot_custom_fields` - Cobot Custom Fields
- `cobot_cf_*` - Einzelne Custom Fields

## Troubleshooting

### Dashboard lädt nicht
```bash
pm2 logs dashboard-app
pm2 restart dashboard-app
```

### Webhook funktioniert nicht
```bash
pm2 logs webhook-server
# Prüfe ob Port 3002 erreichbar ist
curl http://localhost:3002/
```

### Rate Limiting
Cobot API hat ein 4-Monats-Limit für Buchungsabfragen. Der Sync verwendet:
- 3 Monate zurück
- 1 Monat voraus

## Lizenz

MIT

## Support

Bei Fragen oder Problemen öffne ein Issue auf GitHub.
