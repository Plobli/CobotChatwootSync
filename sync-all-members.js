import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const COBOT_SUBDOMAIN = process.env.COBOT_SUBDOMAIN;
const COBOT_API_TOKEN = process.env.COBOT_API_TOKEN;
const CHATWOOT_URL = process.env.CHATWOOT_URL;
const CHATWOOT_ACCOUNT_ID = process.env.CHATWOOT_ACCOUNT_ID;
const CHATWOOT_API_KEY = process.env.CHATWOOT_API_KEY;

// Delay zwischen Requests (in ms) um Rate Limits zu vermeiden
const DELAY_BETWEEN_MEMBERS = 2000;
const DELAY_BETWEEN_PAGES = 3000;

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

async function getCobotData(url, retries = 3) {
    for (let i = 0; i < retries; i++) {
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${COBOT_API_TOKEN}`,
                'Accept': 'application/json'
            }
        });
        
        if (response.ok) {
            return await response.json();
        }
        
        if (response.status === 429) {
            const waitTime = Math.pow(2, i) * 5000; // 5s, 10s, 20s
            console.log(`  ⏳ Rate Limit erreicht, warte ${waitTime/1000}s...`);
            await delay(waitTime);
            continue;
        }
        
        throw new Error(`Cobot API Error: ${response.status}`);
    }
    
    throw new Error(`Cobot API Error: 429 (Max Retries erreicht)`);
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

async function createChatwootContact(member) {
    console.log(`  ➕ Erstelle neuen Kontakt: ${member.email}`);
    
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
                    cobot_adresse: member.address ? 
                        `${member.address.company || ''} ${member.address.full_address || ''}`.trim() : ''
                }
            })
        }
    );
    
    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Chatwoot Create Error: ${response.status} - ${error}`);
    }
    
    const data = await response.json();
    const contact = data.payload || data;
    return contact;
}

async function updateChatwootContact(contactId, updates) {
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
        throw new Error(`Chatwoot Update Error: ${response.status} - ${error}`);
    }
    
    const data = await response.json();
    return data.payload || data;
}

async function syncSingleMember(member, stats, allInvoices) {
    try {
        console.log(`\n[${stats.processed}/${stats.total}] ${member.name} (${member.email})`);
        
        // 1. Custom Fields laden
        let customFieldAttributes = {};
        try {
            const customFieldsData = await getCobotData(`https://mitglieder.lieblingsarbeitsort.de/api/memberships/${member.id}/custom_fields`);
            
            if (customFieldsData && customFieldsData.fields && customFieldsData.fields.length > 0) {
                for (const field of customFieldsData.fields) {
                    const key = `cobot_cf_${field.label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`;
                    customFieldAttributes[key] = field.value || '';
                }
                console.log(`  ✅ Custom Fields: ${customFieldsData.fields.length}`);
            }
        } catch (error) {
            console.log(`  ⚠️  Custom Fields nicht verfügbar`);
        }
        
        // 2. Letzte Rechnung aus vorgeladener Liste filtern
        let lastInvoiceDate = '';
        let lastInvoiceAmount = '';
        let lastInvoiceStatus = '';
        
        try {
            // Filtere nach diesem Mitglied
            const memberInvoices = allInvoices.filter(inv => inv.membership_id === member.id);
            
            if (memberInvoices && memberInvoices.length > 0) {
                // Sortiere nach Datum (neueste zuerst)
                const sortedInvoices = memberInvoices.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                const lastInvoice = sortedInvoices[0];
                lastInvoiceDate = formatToGermanDateTime(lastInvoice.created_at) || '';
                lastInvoiceAmount = lastInvoice.total_amount ? `${parseFloat(lastInvoice.total_amount).toFixed(2)} ${lastInvoice.currency}` : '';
                lastInvoiceStatus = lastInvoice.paid_at ? 'Bezahlt' : 'Offen';
                console.log(`  ✅ Letzte Rechnung: ${lastInvoiceAmount}`);
            }
        } catch (error) {
            console.log(`  ⚠️  Rechnungen nicht verfügbar`);
        }
        
        // 3. Letzte Buchungen laden
        let lastBookingResource = '';
        let lastBookingDate = '';
        let lastBookingFrom = '';
        let lastBookingTo = '';
        let bookingHistory = '';
        
        try {
            const today = new Date();
            const threeMonthsAgo = new Date(today);
            threeMonthsAgo.setMonth(today.getMonth() - 3);
            const oneMonthAhead = new Date(today);
            oneMonthAhead.setMonth(today.getMonth() + 1);
            const fromDate = threeMonthsAgo.toISOString().split('T')[0];
            const toDate = oneMonthAhead.toISOString().split('T')[0];
            
            const bookings = await getCobotData(`https://mitglieder.lieblingsarbeitsort.de/api/memberships/${member.id}/bookings?from=${fromDate}&to=${toDate}`);
            
            if (bookings && bookings.length > 0) {
                const sortedBookings = bookings.sort((a, b) => new Date(b.from) - new Date(a.from));
                
                if (sortedBookings.length > 0) {
                    const lastBooking = sortedBookings[0];
                    lastBookingResource = lastBooking.resource?.name || '';
                    lastBookingDate = lastBooking.from ? formatToGermanDateTime(lastBooking.from).split(' ')[0] : '';
                    lastBookingFrom = formatToGermanDateTime(lastBooking.from);
                    lastBookingTo = formatToGermanDateTime(lastBooking.to);
                }
                
                const historyArray = sortedBookings.slice(0, 5).map(booking => 
                    `${booking.resource?.name || 'Unbekannt'} (${formatToGermanDateTime(booking.from)} - ${formatToGermanDateTime(booking.to)})`
                );
                bookingHistory = historyArray.join(' | ');
                console.log(`  ✅ Buchungen: ${bookings.length}`);
            }
        } catch (error) {
            console.log(`  ⚠️  Buchungen nicht verfügbar`);
        }
        
        // 4. Kontakt in Chatwoot finden oder erstellen
        let contact = await findChatwootContactByEmail(member.email);
        
        if (!contact) {
            // Kontakt erstellen mit allen Daten direkt
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
                    })
                }
            );
            
            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Chatwoot Create Error: ${response.status} - ${error}`);
            }
            
            console.log(`  ✅ Kontakt erstellt mit allen Daten`);
            stats.created++;
            stats.success++;
            return;
        }
        
        // Kontakt existiert bereits - aktualisieren
        console.log(`  🔄 Update existierenden Kontakt`);
        stats.updated++;
        
        // 5. Alle Daten synchronisieren
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
        
        console.log(`  ✅ Erfolgreich aktualisiert`);
        stats.success++;
        
    } catch (error) {
        console.error(`  ❌ Fehler: ${error.message}`);
        stats.failed++;
        stats.errors.push({
            member: member.name || member.email,
            error: error.message
        });
    }
}

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function syncAllMembers() {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔄 INITIAL SYNC: Alle Cobot-Mitglieder → Chatwoot');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    const stats = {
        total: 0,
        processed: 0,
        success: 0,
        failed: 0,
        created: 0,
        updated: 0,
        errors: []
    };
    
    try {
        // Alle Mitglieder laden
        console.log('📥 Lade alle Mitglieder von Cobot...\n');
        
        const allMembers = await getCobotData(`https://mitglieder.lieblingsarbeitsort.de/api/memberships?per_page=200`);
        console.log(`✅ ${allMembers.length} Mitglieder gefunden\n`);
        
        // Alle Rechnungen einmalig laden
        console.log('📥 Lade alle Rechnungen von Cobot...\n');
        const allInvoices = await getCobotData(`https://mitglieder.lieblingsarbeitsort.de/api/invoices?per_page=5000`);
        console.log(`✅ ${allInvoices.length} Rechnungen gefunden\n`);
        
        stats.total = allMembers.length;
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('Starte Synchronisation...');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        // Mitglieder einzeln synchronisieren
        for (const member of allMembers) {
            stats.processed++;
            await syncSingleMember(member, stats, allInvoices);
            
            // Pause zwischen Requests
            if (stats.processed < stats.total) {
                await delay(DELAY_BETWEEN_MEMBERS);
            }
        }
        
        // Zusammenfassung
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📊 SYNC ABGESCHLOSSEN');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`Gesamt:      ${stats.total}`);
        console.log(`Erfolgreich: ${stats.success} ✅`);
        console.log(`  - Neu erstellt: ${stats.created}`);
        console.log(`  - Aktualisiert: ${stats.updated}`);
        console.log(`Fehler:      ${stats.failed} ❌`);
        
        if (stats.errors.length > 0) {
            console.log('\n⚠️  Fehlerhafte Kontakte:');
            stats.errors.forEach(err => {
                console.log(`  - ${err.member}: ${err.error}`);
            });
        }
        
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        
    } catch (error) {
        console.error('\n❌ Kritischer Fehler:', error.message);
        console.error('Stack:', error.stack);
        process.exit(1);
    }
}

syncAllMembers();
