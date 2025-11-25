# Chatwoot Cobot Sync

Synchronisiert Mitgliederdaten von Cobot mit Chatwoot Custom Attributes.

## Features

- **Webhook Integration**: Empfängt Events von Cobot bei Mitgliederänderungen
- **Automatische Synchronisation**: Aktualisiert Kontaktdaten in Chatwoot bei Änderungen
- **Mitgliederdaten-Sync**: Überträgt Cobot-Mitgliederdaten zu Chatwoot Custom Attributes

## Komponenten

### Webhook Server (`server.js`)
Läuft auf Port 3002 und empfängt Webhooks von Cobot:
- `created_membership` - Neue Mitgliedschaften
- `updated_membership_details` - Aktualisierte Mitgliederdaten

**Hinweis:** Das Dashboard zur Anzeige von Cobot-Daten in Chatwoot läuft als separates Projekt unter `/opt/ChatwootCobotDashboard`

## Installation

1. **Repository klonen:**
```bash
git clone https://github.com/Plobli/CobotChatwootSync.git
cd CobotChatwootSync
```

2. **Dependencies installieren:**
```bash
npm install
```

3. **Umgebungsvariablen konfigurieren:**
```bash
cp .env.example .env
nano .env
```

Erforderliche Variablen:
- `COBOT_ACCESS_TOKEN` - Cobot API Access Token
- `COBOT_SUBDOMAIN` - Cobot Subdomain (z.B. mitglieder-lieblingsarbeitsort)
- `CHATWOOT_API_URL` - Chatwoot URL (z.B. https://hilfe.lieblingsarbeitsort.de)
- `CHATWOOT_API_TOKEN` - Chatwoot API Token
- `CHATWOOT_ACCOUNT_ID` - Chatwoot Account ID (meist 1)
- `PORT` - Server Port (3002)

## Deployment

### Mit PM2 (empfohlen)

```bash
# Webhook Server starten
cd /opt/ChatwootCobotSync
pm2 start server.js --name webhook-server

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
```

## Webhook Konfiguration in Cobot

1. Gehe zu https://mitglieder.lieblingsarbeitsort.de/admin/webhooks
2. Erstelle einen neuen Webhook:
   - **URL**: `https://hilfe-webhook.lieblingsarbeitsort.de/webhook`
   - **Events**: 
     - `created_membership`
     - `updated_membership_details`

## Synchronisierte Daten

Für jeden Kontakt werden folgende Custom Attributes in Chatwoot erstellt/aktualisiert:

- `cobot_id` - Cobot Membership ID
- `cobot_status` - Status (Aktiv/Gekündigt)
- `cobot_plan` - Tarif/Plan
- `cobot_member_since` - Mitglied seit
- `cobot_phone` - Telefonnummer
- `cobot_adresse` - Adresse
- `cobot_profile_url` - Link zum Cobot-Profil
- Weitere Cobot-Daten je nach Konfiguration

## Troubleshooting

### Webhook funktioniert nicht
```bash
# Prüfe Logs
pm2 logs webhook-server

# Prüfe ob Server läuft
pm2 status

# Teste Webhook lokal
curl http://localhost:3002/

# Starte Service neu
pm2 restart webhook-server
```

### Kontakte werden nicht erstellt
- Prüfe ob Chatwoot API Token korrekt ist
- Prüfe ob Account ID stimmt (meist 1)
- Prüfe Logs: `pm2 logs webhook-server --lines 100`

## Lizenz

MIT

## Support

Bei Fragen oder Problemen öffne ein Issue auf GitHub.
