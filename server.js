import express from 'express';
import dotenv from 'dotenv';

// .env Datei laden
dotenv.config();

const app = express();
app.use(express.json());

// ===== KONFIGURATION AUS .ENV =====
const COBOT_SUBDOMAIN = process.env.COBOT_SUBDOMAIN;
const COBOT_API_TOKEN = process.env.COBOT_ACCESS_TOKEN; // Verwendet COBOT_ACCESS_TOKEN aus .env

const CHATWOOT_URL = process.env.CHATWOOT_API_URL;
const CHATWOOT_ACCOUNT_ID = process.env.CHATWOOT_ACCOUNT_ID;
const CHATWOOT_API_KEY = process.env.CHATWOOT_API_TOKEN;

const PORT = process.env.PORT || 3002;

// Validierung: Prüfen ob alle nötigen Variablen gesetzt sind
const requiredEnvVars = [
    'COBOT_SUBDOMAIN',
    'COBOT_ACCESS_TOKEN',
    'CHATWOOT_API_URL',
    'CHATWOOT_ACCOUNT_ID',
    'CHATWOOT_API_TOKEN'
];

for (const varName of requiredEnvVars) {
    if (!process.env[varName]) {
        console.error(`❌ Fehler: Umgebungsvariable ${varName} fehlt in .env Datei`);
        process.exit(1);
    }
}

// ===== HILFSFUNKTIONEN =====

async function findChatwootContactByEmail(email) {
    console.log(`🔍 Suche Kontakt in Chatwoot: ${email}`);
    
    const response = await fetch(
        `${CHATWOOT_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/contacts/search?q=${encodeURIComponent(email)}`,
        {
            headers: {
                'api_access_token': CHATWOOT_API_KEY
            }
        }
    );
    
    if (!response.ok) {
        throw new Error(`Chatwoot Search Error: ${response.status}`);
    }
    
    const data = await response.json();
    return data.payload && data.payload.length > 0 ? data.payload[0] : null;
}

async function createChatwootContact(member) {
    console.log(`➕ Erstelle Kontakt in Chatwoot: ${member.email}`);
    
    const response = await fetch(
        `${CHATWOOT_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/contacts`,
        {
            method: 'POST',
            headers: {
                'api_access_token': CHATWOOT_API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: member.name || member.email,
                email: member.email,
                custom_attributes: {
                    cobot_id: member.id,
                    cobot_status: member.canceled_to ? `Gekündigt zum ${member.canceled_to}` : 'Aktiv',
                    cobot_plan: member.plan?.name || 'Unbekannt',
                    cobot_member_since: member.confirmed_at,
                    cobot_profile_url: `https://mitglieder.lieblingsarbeitsort.de/admin/memberships/${member.id}`,
                    cobot_phone: member.phone || '',
                    cobot_adresse: member.address || ''
                }
            })
        }
    );
    
    if (!response.ok) {
        const error = await response.text();
        console.error(`Chatwoot Create Error: ${response.status} - ${error}`);
        throw new Error(`Chatwoot Create Error: ${response.status}`);
    }
    
    const data = await response.json();
    const contact = data.payload || data;
    console.log(`✅ Kontakt erstellt: ${contact.name} (ID: ${contact.id})`);
    return contact;
}

async function updateChatwootContact(contactId, updates) {
    console.log(`🔄 Update Kontakt in Chatwoot: ${contactId}`);
    console.log('📤 Sende Updates:', JSON.stringify(updates, null, 2));
    
    const response = await fetch(
        `${CHATWOOT_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/contacts/${contactId}`,
        {
            method: 'PUT',
            headers: {
                'api_access_token': CHATWOOT_API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updates)
        }
    );
    
    if (!response.ok) {
        const error = await response.text();
        console.error(`Chatwoot Update Error: ${response.status} - ${error}`);
        throw new Error(`Chatwoot Update Error: ${response.status}`);
    }
    
    const data = await response.json();
    const contact = data.payload || data;
    console.log(`✅ Kontakt aktualisiert: ${contact.name || contact.email} (ID: ${contact.id})`);
    return contact;
}

async function getOrCreateContact(member) {
    let contact = await findChatwootContactByEmail(member.email);
    
    if (!contact) {
        contact = await createChatwootContact(member);
    }
    
    return contact;
}

// ===== MEMBERSHIP EVENT HANDLER =====

async function handleMembershipEvent(membershipUrl) {
    console.log('👤 Event: Membership (created or updated)');
    
    // URL auf eigene Domain umschreiben (bunte-butze-coworking.cobot.me -> mitglieder.lieblingsarbeitsort.de)
    const normalizedUrl = membershipUrl.replace(
        /https:\/\/[^\/]+\.cobot\.me/,
        'https://mitglieder.lieblingsarbeitsort.de'
    );
    console.log(`📍 Original URL: ${membershipUrl}`);
    console.log(`📍 Normalized URL: ${normalizedUrl}`);
    
    const response = await fetch(normalizedUrl, {
        headers: {
            'Authorization': `Bearer ${COBOT_API_TOKEN}`,
            'Accept': 'application/json'
        }
    });
    
    if (!response.ok) {
        throw new Error(`Cobot API Error: ${response.status}`);
    }
    
    const member = await response.json();
    const contact = await getOrCreateContact(member);
    
    await updateChatwootContact(contact.id, {
        name: member.name || member.email,
        custom_attributes: {
            cobot_id: member.id,
            cobot_status: member.canceled_to ? `Gekündigt zum ${member.canceled_to}` : 'Aktiv',
            cobot_plan: member.plan?.name || 'Unbekannt',
            cobot_member_since: member.confirmed_at,
            cobot_profile_url: `https://mitglieder.lieblingsarbeitsort.de/admin/memberships/${member.id}`,
            cobot_phone: member.phone || '',
            cobot_adresse: member.address ? 
                `${member.address.company || ''} ${member.address.full_address || ''}`.trim() : '',
            cobot_plan_change_date: member.upcoming_plan ? 'Tarifänderung geplant' : (member.canceled_to || '')
        }
    });
}

// ===== CHATWOOT -> COBOT SYNC =====

// Cobot Custom Field IDs
const COBOT_CUSTOM_FIELD_IDS = {
    'cobot_cf_zugang_24_stunden': 'b799594101de60d2c5904a6a72fd580a',
    'cobot_cf_nachsendeadresse': '3ac66a448db77c40f5bba11379aa5cdd',
    'cobot_cf_firmenbezeichnung_briefkasten': '01e9f41eac032de45ee760dd197d12f7',
    'cobot_cf_fix_desk': 'aeb42929e950a92a4754f3313e44dfba'
};

async function syncCustomFieldsToCobot(cobotId, customAttributes) {
    console.log(`📤 Sync Custom Fields zu Cobot für Member: ${cobotId}`);
    
    const cobotFields = [];
    
    // Prüfe welche Chatwoot-Felder zu Cobot synchronisiert werden sollen
    if (customAttributes.cobot_cf_zugang_24_stunden !== undefined) {
        cobotFields.push({
            id: COBOT_CUSTOM_FIELD_IDS['cobot_cf_zugang_24_stunden'],
            value: customAttributes.cobot_cf_zugang_24_stunden || ''
        });
    }
    
    if (customAttributes.cobot_cf_nachsendeadresse !== undefined) {
        cobotFields.push({
            id: COBOT_CUSTOM_FIELD_IDS['cobot_cf_nachsendeadresse'],
            value: customAttributes.cobot_cf_nachsendeadresse || ''
        });
    }
    
    if (customAttributes.cobot_cf_firmenbezeichnung_briefkasten !== undefined) {
        cobotFields.push({
            id: COBOT_CUSTOM_FIELD_IDS['cobot_cf_firmenbezeichnung_briefkasten'],
            value: customAttributes.cobot_cf_firmenbezeichnung_briefkasten || ''
        });
    }
    
    if (customAttributes.cobot_cf_fix_desk !== undefined) {
        cobotFields.push({
            id: COBOT_CUSTOM_FIELD_IDS['cobot_cf_fix_desk'],
            value: customAttributes.cobot_cf_fix_desk || ''
        });
    }
    
    if (cobotFields.length === 0) {
        console.log('ℹ️  Keine Custom Fields zum Synchronisieren');
        return;
    }
    
    console.log('📤 Sende Custom Fields zu Cobot:', cobotFields);
    
    const response = await fetch(
        `https://${COBOT_SUBDOMAIN}/api/memberships/${cobotId}/custom_fields`,
        {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${COBOT_API_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(cobotFields)
        }
    );
    
    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Cobot Custom Fields Update Error: ${response.status} - ${error}`);
    }
    
    console.log('✅ Custom Fields erfolgreich zu Cobot synchronisiert');
}

async function handleChatwootContactUpdate(contact) {
    console.log(`📝 Chatwoot Contact Update: ${contact.email || contact.id}`);
    
    const customAttributes = contact.custom_attributes || {};
    const cobotId = customAttributes.cobot_id;
    
    if (!cobotId) {
        console.log('ℹ️  Kein cobot_id - Contact nicht mit Cobot verknüpft');
        return;
    }
    
    // Sync Custom Fields zu Cobot
    await syncCustomFieldsToCobot(cobotId, customAttributes);
}

// ===== WEBHOOK ENDPOINTS =====

// Cobot Webhook (bestehend)
app.post('/webhook', async (req, res) => {
    try {
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📥 Cobot Webhook received');
        const { url } = req.body;
        
        if (!url) {
            console.error('❌ Keine URL im Webhook');
            return res.status(400).send('Missing URL');
        }
        
        // Nur Membership Events behandeln
        if (url.includes('/memberships/')) {
            await handleMembershipEvent(url);
        } else {
            console.log('ℹ️  Event ignoriert - nur Membership Events werden verarbeitet');
        }
        
        console.log('✅ Webhook erfolgreich verarbeitet\n');
        res.status(200).send('OK');
        
    } catch (error) {
        console.error('❌ Fehler:', error.message);
        console.error('Stack:', error.stack);
        res.status(500).send('Error');
    }
});

// Chatwoot Webhook (neu)
app.post('/chatwoot-webhook', async (req, res) => {
    try {
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📥 Chatwoot Webhook received');
        console.log('Event:', req.body.event);
        
        const { event, contact } = req.body;
        
        // Nur Contact Update Events behandeln
        if (event === 'contact_updated' && contact) {
            await handleChatwootContactUpdate(contact);
            console.log('✅ Chatwoot Webhook erfolgreich verarbeitet\n');
        } else {
            console.log(`ℹ️  Event "${event}" ignoriert`);
        }
        
        res.status(200).send('OK');
        
    } catch (error) {
        console.error('❌ Fehler:', error.message);
        console.error('Stack:', error.stack);
        res.status(500).send('Error');
    }
});

// ===== SERVER START =====

app.listen(PORT, () => {
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`🚀 Cobot-Chatwoot Sync läuft auf Port ${PORT}`);
    console.log(`📍 Cobot Webhook: https://hilfe-webhook.lieblingsarbeitsort.de/webhook`);
    console.log(`📍 Chatwoot Webhook: https://hilfe-webhook.lieblingsarbeitsort.de/chatwoot-webhook`);
    console.log('═══════════════════════════════════════════════════════════');
});
