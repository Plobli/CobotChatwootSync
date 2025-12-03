#!/bin/bash

echo "🔄 Starte Bulk-Sync aller Cobot-Mitglieder zu Chatwoot"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Lade Umgebungsvariablen
source .env

# Hole alle Membership IDs von Cobot API (mit Paginierung)
echo "📥 Lade alle Mitglieder von Cobot..."
MEMBERS=""
PAGE=1

echo "  Lade alle Mitglieder (ohne Paginierung - Cobot lädt alle)..."
RESPONSE=$(curl -s -H "Authorization: Bearer $COBOT_ACCESS_TOKEN" \
  "https://${COBOT_SUBDOMAIN}.cobot.me/api/memberships")

# Extrahiere Membership IDs mit Python (funktioniert zuverlässig)
MEMBERS=$(echo "$RESPONSE" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if isinstance(data, list):
        for item in data:
            if 'id' in item:
                print(item['id'])
except:
    pass
" 2>/dev/null)

# Entferne leere Zeilen und zähle
MEMBERS=$(echo "$MEMBERS" | grep -v '^$')

# Zähle Mitglieder
TOTAL=$(echo "$MEMBERS" | wc -l)
echo "✅ $TOTAL Mitglieder gefunden"
echo ""

# Synchronisiere jedes Mitglied
COUNTER=0
ERFOLG=0
FEHLER=0
ERSTELLT=0

for MEMBER_ID in $MEMBERS; do
  COUNTER=$((COUNTER + 1))
  echo "[$COUNTER/$TOTAL] Verarbeite Mitglied: $MEMBER_ID"
  
  # 1. Erstelle/Update Kontakt via Webhook-Server (simuliert Cobot Webhook)
  echo "  → Erstelle/Update Kontakt in Chatwoot..."
  WEBHOOK_URL="https://${COBOT_SUBDOMAIN}.cobot.me/api/memberships/${MEMBER_ID}"
  
  WEBHOOK_RESPONSE=$(curl -s -X POST http://localhost:3002/webhook \
    -H "Content-Type: application/json" \
    -d "{\"url\":\"$WEBHOOK_URL\"}")
  
  if echo "$WEBHOOK_RESPONSE" | grep -q "OK"; then
    echo "  ✓ Kontakt erstellt/aktualisiert"
    ERSTELLT=$((ERSTELLT + 1))
    sleep 2  # Warte kurz damit Chatwoot den Kontakt verarbeitet
  else
    echo "  ⚠ Webhook fehlgeschlagen, versuche trotzdem Sync..."
  fi
  
  # 2. Synchronisiere detaillierte Daten
  echo "  → Synchronisiere Details..."
  if docker compose exec -T cobot-sync node sync-member.js "$MEMBER_ID" 2>&1 | grep -q "✅ Sync erfolgreich"; then
    ERFOLG=$((ERFOLG + 1))
    echo "  ✅ Erfolgreich"
  else
    FEHLER=$((FEHLER + 1))
    echo "  ❌ Fehler"
  fi
  
  # Kurze Pause zwischen Requests (API Rate Limiting)
  sleep 1
  echo ""
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎉 Bulk-Sync abgeschlossen!"
echo "   Gesamt: $TOTAL"
echo "   Kontakte erstellt/aktualisiert: $ERSTELLT"
echo "   Details synchronisiert: $ERFOLG"
echo "   Fehler: $FEHLER"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
