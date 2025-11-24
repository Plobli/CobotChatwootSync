import express from 'express';
import dotenv from 'dotenv';

// .env Datei laden
dotenv.config();

const app = express();
app.use(express.json());

// ===== KONFIGURATION AUS .ENV =====
const COBOT_SUBDOMAIN = process.env.COBOT_SUBDOMAIN;
const COBOT_API_TOKEN = process.env.COBOT_API_TOKEN;

const CHATWOOT_URL = process.env.CHATWOOT_URL;
const CHATWOOT_ACCOUNT_ID = process.env.CHATWOOT_ACCOUNT_ID;
const CHATWOOT_API_KEY = process.env.CHATWOOT_API_KEY;

const PORT = process.env.PORT || 3002;

// Validierung: Prüfen ob alle nötigen Variablen gesetzt sind
const requiredEnvVars = [
    'COBOT_SUBDOMAIN',
    'COBOT_API_TOKEN',
    'CHATWOOT_URL',
    'CHATWOOT_ACCOUNT_ID',
    'CHATWOOT_API_KEY'
];

for (const varName of requiredEnvVars) {
    if (!process.env[varName]) {
        console.error(`❌ Fehler: Umgebungsvariable ${varName} fehlt in .env Datei`);
        process.exit(1);
    }
}

// ===== HILFSFUNKTIONEN =====

function formatToGermanDateTime(dateString) {
    if (!dateString) return '';
    try {
        const date = new Date(dateString);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${day}.${month}.${year} ${hours}:${minutes}`;
    } catch (error) {
        return dateString;
    }
}

async function getCobotCustomFields(membershipId) {
    console.log(`📥 Lade Custom Fields für Mitglied: ${membershipId}`);
    
    try {
        const response = await fetch(
            `https://bunte-butze-coworking.cobot.me/api/memberships/${membershipId}/custom_fields`,
            {
                headers: {
                    'Authorization': `Bearer ${COBOT_API_TOKEN}`,
                    'Accept': 'application/json'
                }
            }
        );
        
        if (!response.ok) {
            console.log(`⚠️  Custom Fields API Error: ${response.status}`);
            return {};
        }
        
        const data = await response.json();
        const customFieldAttributes = {};
        
        if (data && data.fields && data.fields.length > 0) {
            for (const field of data.fields) {
                const key = `cobot_cf_${field.label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`;
                customFieldAttributes[key] = field.value || '';
                console.log(`  ✅ ${field.label}: ${field.value || '(leer)'}`);
            }
        }
        
        return customFieldAttributes;
    } catch (error) {
        console.log('⚠️  Custom Fields konnten nicht geladen werden:', error.message);
        return {};
    }
}

async function getCobotMembership(membershipUrl) {
    console.log(`📥 Lade Mitglied von Cobot: ${membershipUrl}`);
    
    const response = await fetch(membershipUrl, {
        headers: {
            'Authorization': `Bearer ${COBOT_API_TOKEN}`,
            'Accept': 'application/json'
        }
    });
    
    if (!response.ok) {
        throw new Error(`Cobot API Error: ${response.status}`);
    }
    
    const member = await response.json();
    console.log('📦 Cobot Member Data:', JSON.stringify({
        id: member.id,
        name: member.name,
        email: member.email,
        phone: member.phone,
        address: member.address
    }, null, 2));
    
    return member;
}

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

// ===== EVENT HANDLER =====

async function handleCreatedInvoice(invoiceUrl) {
    console.log('💰 Event: created_invoice');
    
    const response = await fetch(invoiceUrl, {
        headers: {
            'Authorization': `Bearer ${COBOT_API_TOKEN}`,
            'Accept': 'application/json'
        }
    });
    
    if (!response.ok) {
        throw new Error(`Cobot API Error: ${response.status}`);
    }
    
    const invoice = await response.json();
    
    const memberResponse = await fetch(
        `https://${COBOT_SUBDOMAIN}.cobot.me/api/memberships/${invoice.membership_id}`,
        {
            headers: {
                'Authorization': `Bearer ${COBOT_API_TOKEN}`,
                'Accept': 'application/json'
            }
        }
    );
    
    if (!memberResponse.ok) {
        throw new Error(`Cobot API Error: ${memberResponse.status}`);
    }
    
    const member = await memberResponse.json();
    const contact = await getOrCreateContact(member);
    
    // Custom Fields laden
    const customFieldAttributes = await getCobotCustomFields(member.id);
    
    await updateChatwootContact(contact.id, {
        custom_attributes: {
            cobot_id: member.id,
            cobot_status: member.canceled_to ? `Gekündigt zum ${member.canceled_to}` : 'Aktiv',
            cobot_plan: member.plan?.name || 'Unbekannt',
            cobot_member_since: member.confirmed_at,
            cobot_profile_url: `https://mitglieder.lieblingsarbeitsort.de/admin/memberships/${member.id}`,
            cobot_phone: member.phone || '',
            cobot_adresse: member.address ? 
                `${member.address.company || ''} ${member.address.full_address || ''}`.trim() : '',
            cobot_plan_change_date: member.upcoming_plan ? 'Tarifänderung geplant' : (member.canceled_to || ''),
            cobot_next_invoice_date: formatToGermanDateTime(member.next_invoice_at) || '',
            cobot_last_invoice_date: formatToGermanDateTime(invoice.created_at) || '',
            cobot_last_invoice_amount: invoice.total_amount ? `${parseFloat(invoice.total_amount).toFixed(2)} ${invoice.currency}` : '',
            cobot_last_invoice_status: invoice.paid_at ? 'Bezahlt' : 'Offen',
            ...customFieldAttributes
        }
    });
}

async function handleDeletedMembership(data) {
    console.log('🗑️  Event: deleted_membership');
    const member = data.membership;
    
    const contact = await findChatwootContactByEmail(member.email);
    
    if (contact) {
        await updateChatwootContact(contact.id, {
            custom_attributes: {
                ...contact.custom_attributes,
                cobot_status: 'Gelöscht'
            }
        });
    }
}

// ===== BOOKING HANDLER =====

async function handleCreatedBooking(bookingUrl) {
    console.log('📅 Event: created_booking');
    
    const response = await fetch(bookingUrl, {
        headers: {
            'Authorization': `Bearer ${COBOT_API_TOKEN}`,
            'Accept': 'application/json'
        }
    });
    
    if (!response.ok) {
        throw new Error(`Cobot API Error: ${response.status}`);
    }
    
    const booking = await response.json();
    
    // Membership laden
    const memberResponse = await fetch(
        `https://${COBOT_SUBDOMAIN}.cobot.me/api/memberships/${booking.membership.id}`,
        {
            headers: {
                'Authorization': `Bearer ${COBOT_API_TOKEN}`,
                'Accept': 'application/json'
            }
        }
    );
    
    if (!memberResponse.ok) {
        throw new Error(`Cobot API Error: ${memberResponse.status}`);
    }
    
    const member = await memberResponse.json();
    const contact = await getOrCreateContact(member);
    
    // Buchungshistorie formatieren (letzte 5 Buchungen)
    const bookingEntry = `${booking.resource.name} (${formatToGermanDateTime(booking.from)} - ${formatToGermanDateTime(booking.to)})`;
    let bookingHistory = contact.custom_attributes?.cobot_booking_history || '';
    
    // Neue Buchung vorne anfügen
    const historyArray = bookingHistory ? bookingHistory.split(' | ') : [];
    historyArray.unshift(bookingEntry);
    
    // Nur die letzten 5 behalten
    const limitedHistory = historyArray.slice(0, 5).join(' | ');
    
    await updateChatwootContact(contact.id, {
        custom_attributes: {
            ...contact.custom_attributes,
            cobot_last_booking_resource: booking.resource.name,
            cobot_last_booking_date: booking.from ? formatToGermanDateTime(booking.from).split(' ')[0] : '',
            cobot_last_booking_from: formatToGermanDateTime(booking.from),
            cobot_last_booking_to: formatToGermanDateTime(booking.to),
            cobot_booking_history: limitedHistory
        }
    });
}

async function handleDeletedBooking(data) {
    console.log('🗑️ Event: deleted_booking');
    const booking = data.booking;
    
    // Membership laden
    const memberResponse = await fetch(
        `https://${COBOT_SUBDOMAIN}.cobot.me/api/memberships/${booking.membership.id}`,
        {
            headers: {
                'Authorization': `Bearer ${COBOT_API_TOKEN}`,
                'Accept': 'application/json'
            }
        }
    );
    
    if (!memberResponse.ok) {
        console.log('⚠️  Membership nicht gefunden, überspringe Update');
        return;
    }
    
    const member = await memberResponse.json();
    const contact = await findChatwootContactByEmail(member.email);
    
    if (contact) {
        // Entfernte Buchung zur Historie hinzufügen
        const bookingEntry = `[Storniert] ${booking.resource.name} (${formatToGermanDateTime(booking.from)} - ${formatToGermanDateTime(booking.to)})`;
        let bookingHistory = contact.custom_attributes?.cobot_booking_history || '';
        
        const historyArray = bookingHistory ? bookingHistory.split(' | ') : [];
        historyArray.unshift(bookingEntry);
        const limitedHistory = historyArray.slice(0, 5).join(' | ');
        
        await updateChatwootContact(contact.id, {
            custom_attributes: {
                ...contact.custom_attributes,
                cobot_booking_history: limitedHistory
            }
        });
    }
}

// ===== CUSTOM FIELDS HANDLER =====

async function handleUpdatedCustomField(membershipUrl) {
    console.log('🏷️  Event: updated_custom_field');
    
    const member = await getCobotMembership(membershipUrl);
    const contact = await getOrCreateContact(member);
    
    // Custom Fields laden
    const customFieldAttributes = await getCobotCustomFields(member.id);
    
    await updateChatwootContact(contact.id, {
        custom_attributes: {
            ...contact.custom_attributes,
            ...customFieldAttributes
        }
    });
}

// ===== WEBHOOK ENDPOINT =====

app.post('/webhook/cobot', async (req, res) => {
    try {
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📨 Webhook empfangen');
        console.log('Body:', JSON.stringify(req.body, null, 2));
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        const { url, membership } = req.body;
        
        if (!url) {
            console.error('❌ Keine URL im Webhook');
            return res.status(400).send('Missing URL');
        }
        
        if (url.includes('/memberships/')) {
            if (membership) {
                await handleDeletedMembership(req.body);
            } else {
                const member = await getCobotMembership(url);
                const contact = await getOrCreateContact(member);
                
                // Custom Fields laden
                const customFieldAttributes = await getCobotCustomFields(member.id);
                
                await updateChatwootContact(contact.id, {
                    custom_attributes: {
                        cobot_id: member.id,
                        cobot_status: member.canceled_to ? `Gekündigt zum ${member.canceled_to}` : 'Aktiv',
                        cobot_plan: member.plan?.name || 'Unbekannt',
                        cobot_member_since: member.confirmed_at,
                        cobot_profile_url: `https://mitglieder.lieblingsarbeitsort.de/admin/memberships/${member.id}`,
                        cobot_phone: member.phone || '',
                        cobot_adresse: member.address ? 
                            `${member.address.company || ''} ${member.address.full_address || ''}`.trim() : '',
                        cobot_plan_change_date: member.upcoming_plan ? 'Tarifänderung geplant' : (member.canceled_to || ''),
                        cobot_next_invoice_date: member.next_invoice_at || '',
                        ...customFieldAttributes
                    }
                });
            }
        } else if (url.includes('/invoices/')) {
            await handleCreatedInvoice(url);
        } else if (url.includes('/bookings/')) {
            if (req.body.booking) {
                // deleted_booking sendet Daten mit
                await handleDeletedBooking(req.body);
            } else {
                // created_booking oder updated_booking
                await handleCreatedBooking(url);
            }
        }
        
        console.log('✅ Webhook erfolgreich verarbeitet\n');
        res.status(200).send('OK');
        
    } catch (error) {
        console.error('❌ Fehler:', error.message);
        console.error('Stack:', error.stack);
        res.status(500).send('Error');
    }
});

app.get('/test', (req, res) => {
    res.send('Webhook-Server läuft! 🚀');
});

app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        config: {
            cobot_subdomain: COBOT_SUBDOMAIN,
            chatwoot_url: CHATWOOT_URL,
            port: PORT
        }
    });
});

// ===== SERVER STARTEN =====

app.listen(PORT, () => {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🚀 Cobot-Chatwoot Webhook-Server');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📍 Webhook URL: https://hilfe-webhook.lieblingsarbeitsort.de/webhook/cobot`);
    console.log(`🏥 Health Check: http://localhost:${PORT}/health`);
    console.log(`🧪 Test Endpoint: http://localhost:${PORT}/test`);
    console.log(`🔐 Config loaded from: .env`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
});
