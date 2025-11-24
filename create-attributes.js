import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const CHATWOOT_URL = process.env.CHATWOOT_URL;
const CHATWOOT_ACCOUNT_ID = process.env.CHATWOOT_ACCOUNT_ID;
const CHATWOOT_API_KEY = process.env.CHATWOOT_API_KEY;

// Alle Custom Attributes, die angelegt werden sollen
const attributes = [
    {
        attribute_display_name: 'Cobot ID',
        attribute_key: 'cobot_id',
        attribute_display_type: 'text',
        attribute_description: 'Cobot Membership ID'
    },
    {
        attribute_display_name: 'Mitgliedschaftsstatus',
        attribute_key: 'cobot_status',
        attribute_display_type: 'text',
        attribute_description: 'Status der Mitgliedschaft (Aktiv/Gekündigt)'
    },
    {
        attribute_display_name: 'Tarif',
        attribute_key: 'cobot_plan',
        attribute_display_type: 'text',
        attribute_description: 'Aktueller Tarif'
    },
    {
        attribute_display_name: 'Mitglied seit',
        attribute_key: 'cobot_member_since',
        attribute_display_type: 'date',
        attribute_description: 'Startdatum der Mitgliedschaft'
    },
    {
        attribute_display_name: 'Cobot Profil URL',
        attribute_key: 'cobot_profile_url',
        attribute_display_type: 'link',
        attribute_description: 'Link zum Cobot-Profil'
    },
    {
        attribute_display_name: 'Telefonnummer',
        attribute_key: 'cobot_phone',
        attribute_display_type: 'text',
        attribute_description: 'Telefonnummer aus Cobot'
    },
    {
        attribute_display_name: 'Adresse',
        attribute_key: 'cobot_adresse',
        attribute_display_type: 'text',
        attribute_description: 'Cobot Adresse'
    },
    {
        attribute_display_name: 'Tarif Änderungsdatum',
        attribute_key: 'cobot_plan_change_date',
        attribute_display_type: 'text',
        attribute_description: 'Datum der nächsten Tarifänderung'
    },
    {
        attribute_display_name: 'Nächste Rechnung',
        attribute_key: 'cobot_next_invoice_date',
        attribute_display_type: 'text',
        attribute_description: 'Datum der nächsten Rechnung'
    },
    {
        attribute_display_name: 'Letzte Rechnung',
        attribute_key: 'cobot_last_invoice_date',
        attribute_display_type: 'text',
        attribute_description: 'Datum der letzten Rechnung'
    },
    {
        attribute_display_name: 'Rechnungsbetrag',
        attribute_key: 'cobot_last_invoice_amount',
        attribute_display_type: 'text',
        attribute_description: 'Betrag der letzten Rechnung'
    },
    {
        attribute_display_name: 'Rechnungsstatus',
        attribute_key: 'cobot_last_invoice_status',
        attribute_display_type: 'text',
        attribute_description: 'Status der letzten Rechnung (Offen/Bezahlt)'
    },
    {
        attribute_display_name: 'Letzte Buchung (Ressource)',
        attribute_key: 'cobot_last_booking_resource',
        attribute_display_type: 'text',
        attribute_description: 'Ressource der letzten Buchung'
    },
    {
        attribute_display_name: 'Letzte Buchung (Datum)',
        attribute_key: 'cobot_last_booking_date',
        attribute_display_type: 'text',
        attribute_description: 'Datum der letzten Buchung'
    },
    {
        attribute_display_name: 'Letzte Buchung (Von)',
        attribute_key: 'cobot_last_booking_from',
        attribute_display_type: 'text',
        attribute_description: 'Startzeit der letzten Buchung'
    },
    {
        attribute_display_name: 'Letzte Buchung (Bis)',
        attribute_key: 'cobot_last_booking_to',
        attribute_display_type: 'text',
        attribute_description: 'Endzeit der letzten Buchung'
    },
    {
        attribute_display_name: 'Buchungshistorie',
        attribute_key: 'cobot_booking_history',
        attribute_display_type: 'text',
        attribute_description: 'Historie der letzten 5 Buchungen'
    },
    // Custom Fields aus Cobot
    {
        attribute_display_name: 'Zugang 24 Stunden',
        attribute_key: 'cobot_cf_zugang_24_stunden',
        attribute_display_type: 'text',
        attribute_description: 'Custom Field: Zugang 24 Stunden'
    },
    {
        attribute_display_name: 'Nachsendeadresse',
        attribute_key: 'cobot_cf_nachsendeadresse',
        attribute_display_type: 'text',
        attribute_description: 'Custom Field: Nachsendeadresse'
    },
    {
        attribute_display_name: 'Firmenbezeichnung Briefkasten',
        attribute_key: 'cobot_cf_firmenbezeichnung_briefkasten',
        attribute_display_type: 'text',
        attribute_description: 'Custom Field: Firmenbezeichnung Briefkasten'
    },
    {
        attribute_display_name: 'Welcher Fix Desk wird genutzt?',
        attribute_key: 'cobot_cf_welcher_fix_desk_wird_genutzt',
        attribute_display_type: 'text',
        attribute_description: 'Custom Field: Welcher Fix Desk wird genutzt?'
    }
];

async function getExistingAttributes() {
    const response = await fetch(
        `${CHATWOOT_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/custom_attribute_definitions`,
        {
            headers: {
                'api_access_token': CHATWOOT_API_KEY
            }
        }
    );
    
    if (!response.ok) {
        throw new Error(`Failed to get attributes: ${response.status}`);
    }
    
    const data = await response.json();
    return data.map(attr => attr.attribute_key);
}

async function createAttribute(attribute) {
    const response = await fetch(
        `${CHATWOOT_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/custom_attribute_definitions`,
        {
            method: 'POST',
            headers: {
                'api_access_token': CHATWOOT_API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                attribute_model: 'contact_attribute',
                ...attribute
            })
        }
    );
    
    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to create attribute: ${response.status} - ${error}`);
    }
    
    return await response.json();
}

async function main() {
    try {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🔧 Chatwoot Custom Attributes Setup');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        
        // Bestehende Attributes abrufen
        console.log('📥 Lade bestehende Attributes...');
        const existingKeys = await getExistingAttributes();
        console.log(`✅ ${existingKeys.length} Attributes bereits vorhanden\n`);
        
        // Neue Attributes anlegen
        let created = 0;
        let skipped = 0;
        
        for (const attribute of attributes) {
            if (existingKeys.includes(attribute.attribute_key)) {
                console.log(`⏭️  ${attribute.attribute_display_name} (${attribute.attribute_key}) - bereits vorhanden`);
                skipped++;
            } else {
                try {
                    await createAttribute(attribute);
                    console.log(`✅ ${attribute.attribute_display_name} (${attribute.attribute_key}) - erstellt`);
                    created++;
                } catch (error) {
                    console.error(`❌ ${attribute.attribute_display_name} (${attribute.attribute_key}) - Fehler: ${error.message}`);
                }
            }
        }
        
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`✅ Setup abgeschlossen!`);
        console.log(`   Neu erstellt: ${created}`);
        console.log(`   Übersprungen: ${skipped}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        
    } catch (error) {
        console.error('\n❌ Fehler:', error.message);
        console.error('Stack:', error.stack);
        process.exit(1);
    }
}

main();
