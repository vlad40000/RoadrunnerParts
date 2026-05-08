const fs = require('fs');
const path = 'C:/Users/bradv/Downloads/Ebay listings revised 1.txt';

const SYMPTOM_MAP = {
    'Drum Assembly': 'Commonly fixes thumping noises, screeching, or drums that won\'t rotate smoothly.',
    'Heating Element': 'Resolves issues where the dryer runs but produces no heat, or clothes take too long to dry.',
    'Motor': 'Fixes dryers that won\'t start, motor humming but not turning, or intermittent stopping.',
    'Thermostat': 'Addresses dryers that won\'t heat, stop prematurely, or have a blown thermal fuse.',
    'Fuse': 'A vital safety component that restores power to the dryer when it won\'t start due to overheating.',
    'Timer': 'Fixes issues with the dryer not advancing through cycles or not turning off.',
    'Belt': 'Restores drum rotation when the motor is running but the drum remains stationary.',
    'Pulley': 'Eliminates loud squealing or friction noises during the drying cycle.',
    'Bearing': 'Reduces mechanical noise and restores smooth rotation to the dryer drum.',
    'Switch': 'Fixes issues with the dryer not starting when the door is closed or the button is pushed.'
};

const ROADRUNNER_FOOTER = `
<br><br>
<hr>
<b>Shipping & Handling:</b>
All orders are processed and shipped Monday through Friday. Most OEM components ship within 1-3 business days. We utilize USPS, UPS, and FedEx to ensure the fastest delivery to your door.

<b>Need Help? Model Verification:</b>
Not sure if this part fits your appliance? Please send us a message with your <b>Model Number</b> and <b>Serial Number</b> before purchasing. Our team will verify compatibility to ensure you get the right part the first time.

<b>Returns & Quality:</b>
This part has been professionally inspected and prepared for resale. To keep our prices low and ensure quality, we do not accept returns. If there is any issue with your order, please contact us immediately via eBay messages and we will make it right.

<b>Disclaimer:</b>
RoadrunnerParts is an independent distributor. We are not affiliated with or endorsed by the original manufacturers. All brand names and logos are the property of their respective owners and are used for identification purposes only.
`;

let raw = fs.readFileSync(path, 'utf8').trim();
if (!raw.endsWith('}')) raw += '\n}';

const data = JSON.parse(raw);

const improved = data.listings.map(listing => {
    let description = listing.description || '';
    
    // 1. Fix Truncations
    description = description.replace(/- This 6\s*\n\s*- 0/g, '- This 6.0');
    description = description.replace(/- This 6$/gm, '- This high-quality replacement component.');
    description = description.replace(/-\s*$/gm, '');
    
    // 2. Add Symptom Logic
    const type = listing.specs.type || '';
    let symptomNote = '';
    for (const [key, note] of Object.entries(SYMPTOM_MAP)) {
        if (type.toLowerCase().includes(key.toLowerCase()) || listing.title.toLowerCase().includes(key.toLowerCase())) {
            symptomNote = note;
            break;
        }
    }
    
    if (symptomNote && !description.includes('Commonly fixes')) {
        description += `\n\n<b>Common Symptoms Fixed:</b>\n${symptomNote}`;
    }

    // 3. Add Professional Policy Footer
    if (!description.includes('RoadrunnerParts')) {
        description += ROADRUNNER_FOOTER;
    }

    // 4. Update Specs
    const specs = {
        ...listing.specs,
        condition: 'Used',
        brand: listing.specs.brand || (listing.title.toUpperCase().includes('GE') ? 'GE' : null)
    };

    return {
        ...listing,
        description,
        specs
    };
});

fs.writeFileSync(path, JSON.stringify({ listings: improved }, null, 2));
console.log(`Successfully improved ${improved.length} listings with Roadrunner policies.`);

