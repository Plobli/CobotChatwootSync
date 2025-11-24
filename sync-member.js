import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const COBOT_SUBDOMAIN = process.env.COBOT_SUBDOMAIN;
const COBOT_API_TOKEN = process.env.COBOT_API_TOKEN;
const CHATWOOT_URL = process.env.CHATWOOT_URL;
const CHATWOOT_ACCOUNT_ID = process.env.CHATWOOT_ACCOUNT_ID;
const CHATWOOT_API_KEY = process.env.CHATWOOT_API_KEY;

const MEMBER_ID = process.argv[2];

if (!MEMBER_ID) {
    console.error('❌ Bitte Mitglieds-ID angeben: node sync-member.js <MEMBER_ID>');
    process.exit(1);
}

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

async function getCobotData(url) {
    const response = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${COBOT_API_TOKEN}`,
            'Accept': 'application/json'
        }
    });
    
    if (!response.ok) {
        throw new Error(`Cobot API Error: ${response.status}`);
    }
    
    return await response.json();
}

async function findChatwootContactByEmail(email) {
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

async function syncMember() {
    try {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🔄 Sync Member Data to Chatwoot');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        
        // 1. Mitgliedsdaten laden
        console.log(`📥 Lade Mitglied: ${MEMBER_ID}`);
        const member = await getCobotData(`https://bunte-butze-coworking.cobot.me/api/memberships/${MEMBER_ID}`);
        console.log(`✅ Mitglied geladen: ${member.name} (${member.email})`);
        
        // 2. Custom Fields laden
        console.log('\n📥 Lade Custom Fields...');
        let customFieldAttributes = {};
        
        try {
            const customFieldsData = await getCobotData(`https://bunte-butze-coworking.cobot.me/api/memberships/${MEMBER_ID}/custom_fields`);
            
            if (customFieldsData && customFieldsData.fields && customFieldsData.fields.length > 0) {
                for (const field of customFieldsData.fields) {
                    // Erstelle einen sicheren Key aus dem Label
                    const key = `cobot_cf_${field.label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`;
                    customFieldAttributes[key] = field.value || '';
                    console.log(`  ✅ ${field.label}: ${field.value || '(leer)'}`);
                }
            } else {
                console.log('ℹ️  Keine Custom Fields gefunden');
            }
        } catch (error) {
            console.log('⚠️  Custom Fields konnten nicht geladen werden:', error.message);
        }
        
        // 3. Letzte Rechnungen laden
        console.log('\n📥 Lade Rechnungen...');
        let lastInvoiceDate = '';
        let lastInvoiceAmount = '';
        let lastInvoiceStatus = '';
        
        try {
            const invoices = await getCobotData(`https://bunte-butze-coworking.cobot.me/api/invoices?membership_id=${MEMBER_ID}&per_page=1`);
            
            if (invoices && invoices.length > 0) {
                const lastInvoice = invoices[0];
                lastInvoiceDate = formatToGermanDateTime(lastInvoice.created_at) || '';
                lastInvoiceAmount = lastInvoice.total_amount ? `${parseFloat(lastInvoice.total_amount).toFixed(2)} ${lastInvoice.currency}` : '';
                lastInvoiceStatus = lastInvoice.paid_at ? 'Bezahlt' : 'Offen';
                console.log(`✅ Letzte Rechnung: ${lastInvoiceDate} - ${lastInvoiceAmount} (${lastInvoiceStatus})`);
            } else {
                console.log('ℹ️  Keine Rechnungen gefunden');
            }
        } catch (error) {
            console.log('⚠️  Rechnungen konnten nicht geladen werden (403 - keine Berechtigung)');
        }
        
        // 4. Letzte Buchungen laden
        console.log('\n📥 Lade Buchungen...');
        let lastBookingResource = '';
        let lastBookingDate = '';
        let lastBookingFrom = '';
        let lastBookingTo = '';
        let bookingHistory = '';
        
        try {
            // Lade Buchungen der letzten 3 Monate + 1 Monat in die Zukunft (API-Limit: max 4 Monate)
            const today = new Date();
            const threeMonthsAgo = new Date(today);
            threeMonthsAgo.setMonth(today.getMonth() - 3);
            const oneMonthAhead = new Date(today);
            oneMonthAhead.setMonth(today.getMonth() + 1);
            const fromDate = threeMonthsAgo.toISOString().split('T')[0];
            const toDate = oneMonthAhead.toISOString().split('T')[0];
            
            const bookings = await getCobotData(`https://bunte-butze-coworking.cobot.me/api/memberships/${MEMBER_ID}/bookings?from=${fromDate}&to=${toDate}`);
            
            if (bookings && bookings.length > 0) {
                // Sortiere nach Datum (neueste zuerst)
                const sortedBookings = bookings.sort((a, b) => new Date(b.from) - new Date(a.from));
                
                if (sortedBookings.length > 0) {
                    const lastBooking = sortedBookings[0];
                    lastBookingResource = lastBooking.resource?.name || '';
                    lastBookingDate = lastBooking.from ? formatToGermanDateTime(lastBooking.from).split(' ')[0] : '';
                    lastBookingFrom = formatToGermanDateTime(lastBooking.from);
                    lastBookingTo = formatToGermanDateTime(lastBooking.to);
                    
                    console.log(`✅ Letzte Buchung: ${lastBookingResource} (${lastBookingDate})`);
                }
                
                // Historie erstellen (letzte 5)
                const historyArray = sortedBookings.slice(0, 5).map(booking => 
                    `${booking.resource?.name || 'Unbekannt'} (${formatToGermanDateTime(booking.from)} - ${formatToGermanDateTime(booking.to)})`
                );
                bookingHistory = historyArray.join(' | ');
                console.log(`✅ Buchungshistorie: ${historyArray.length} Einträge`);
            } else {
                console.log('ℹ️  Keine Buchungen gefunden');
            }
        } catch (error) {
            console.log('⚠️  Buchungen konnten nicht geladen werden:', error.message);
        }
        
        // 5. Kontakt in Chatwoot finden
        console.log('\n🔍 Suche Kontakt in Chatwoot...');
        const contact = await findChatwootContactByEmail(member.email);
        
        if (!contact) {
            console.error('❌ Kontakt nicht in Chatwoot gefunden!');
            process.exit(1);
        }
        
        console.log(`✅ Kontakt gefunden: ${contact.name} (ID: ${contact.id})`);
        
        // 6. Alle Daten an Chatwoot senden
        console.log('\n📤 Sende Daten an Chatwoot...');
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
                cobot_last_invoice_date: lastInvoiceDate,
                cobot_last_invoice_amount: lastInvoiceAmount,
                cobot_last_invoice_status: lastInvoiceStatus,
                cobot_last_booking_resource: lastBookingResource,
                cobot_last_booking_date: lastBookingDate,
                cobot_last_booking_from: lastBookingFrom,
                cobot_last_booking_to: lastBookingTo,
                cobot_booking_history: bookingHistory,
                ...customFieldAttributes
            }
        });
        
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('✅ Sync erfolgreich abgeschlossen!');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        
    } catch (error) {
        console.error('\n❌ Fehler:', error.message);
        console.error('Stack:', error.stack);
        process.exit(1);
    }
}

syncMember();
