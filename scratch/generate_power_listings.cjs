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
    'Switch': 'Fixes issues with the dryer not starting when the door is closed or the button is pushed.',
    'Knob': 'Replaces cracked or stripped controls, restoring the ability to select cycles.',
    'Baffle': 'Fixes issues with clothes tangling or not tumbling properly during the cycle.'
};

const MASTER_TEMPLATE = (listing, symptoms) => `
<div id="roadrunner-listing" style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 900px; margin: auto; padding: 20px; border: 1px solid #eee;">
    <!-- Brand Header -->
    <div style="background: #0053a0; color: white; padding: 10px 20px; text-align: center; border-radius: 5px 5px 0 0;">
        <h2 style="margin: 0; letter-spacing: 1px;">ROADRUNNER PARTS</h2>
        <p style="margin: 0; font-size: 0.9em;">Expert-Inspected Appliance Components</p>
    </div>

    <!-- Product Title -->
    <h1 style="color: #0053a0; border-bottom: 2px solid #0053a0; padding: 15px 0; font-size: 1.5em; text-align: center;">
        ${listing.title} <br>
        <span style="color: #666; font-size: 0.8em;">Part Number: ${listing.partNumber}</span>
    </h1>

    <!-- Symptom/Problem Solver -->
    <div style="background: #f9f9f9; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 5px solid #d32f2f;">
        <h3 style="margin-top: 0; color: #d32f2f;">Common Symptoms This Part Fixes:</h3>
        <p style="font-size: 1.1em; margin-bottom: 0;">${symptoms}</p>
    </div>

    <!-- The Compatibility Gate (Anti-Return Logic) -->
    <div style="border: 2px dashed #ff9800; padding: 20px; background: #fff8e1; text-align: center; margin: 20px 0; border-radius: 5px;">
        <h3 style="margin: 0; color: #e65100;">⚠️ STOP! VERIFY COMPATIBILITY</h3>
        <p style="margin: 10px 0; font-weight: bold;">
            Do not buy based on photos or "looks" alone. Appliance parts often have internal differences.
        </p>
        <p style="font-size: 1.1em; background: #fff; padding: 10px; border-radius: 3px; display: inline-block;">
            Please message us with your <b>MODEL NUMBER</b> and <b>SERIAL NUMBER</b> before ordering.<br>
            Our experts will verify the fit within minutes to ensure you get the right part.
        </p>
    </div>

    <!-- Specs Section -->
    <div style="display: flex; flex-wrap: wrap; gap: 20px; margin: 20px 0;">
        <div style="flex: 1; min-width: 250px;">
            <h3 style="color: #0053a0; border-bottom: 1px solid #eee;">Product Specifications:</h3>
            <ul style="list-style: none; padding: 0;">
                <li style="padding: 5px 0;"><strong>Brand:</strong> ${listing.specs.brand || 'OEM GE / Compatible'}</li>
                <li style="padding: 5px 0;"><strong>Condition:</strong> Professional Grade (Tested & Cleaned)</li>
                <li style="padding: 5px 0;"><strong>Category:</strong> ${listing.specs.type || 'Appliance Component'}</li>
                <li style="padding: 5px 0;"><strong>Shipping:</strong> Fast Midwest-Based Logistics</li>
            </ul>
        </div>
        <div style="flex: 1; min-width: 250px; background: #f0f4f8; padding: 15px; border-radius: 5px;">
            <h3 style="color: #0053a0; margin-top: 0;">Quality Assurance:</h3>
            <p style="font-size: 0.9em; margin-bottom: 0;">
                Every component is hand-inspected for structural integrity and electrical performance. We focus on high-reliability OEM pulls that offer the best value for your repair.
            </p>
        </div>
    </div>

    <!-- Store Policies -->
    <div style="background: #333; color: white; padding: 20px; margin-top: 40px; border-radius: 5px;">
        <h3 style="margin-top: 0; border-bottom: 1px solid #555; padding-bottom: 10px;">ROADRUNNER STORE POLICIES</h3>
        
        <div style="display: flex; flex-wrap: wrap; gap: 20px; font-size: 0.9em;">
            <div style="flex: 1; min-width: 200px;">
                <h4 style="color: #4fc3f7; margin-bottom: 5px;">Shipping</h4>
                Orders ship Mon-Fri via USPS, UPS, or FedEx. 1-3 day processing on most items.
            </div>
            <div style="flex: 1; min-width: 200px;">
                <h4 style="color: #4fc3f7; margin-bottom: 5px;">Returns</h4>
                To keep prices low, all sales are final. Please use our compatibility check service!
            </div>
        </div>
    </div>

    <!-- Disclaimer -->
    <p style="font-size: 0.75em; color: #999; margin-top: 20px; text-align: center; border-top: 1px solid #eee; padding-top: 10px;">
        <strong>Disclaimer:</strong> RoadrunnerParts is an independent distributor. We are not affiliated with GE, Whirlpool, or Samsung. All logos are property of their respective owners.
    </p>
</div>
`;

// Execution logic
let raw = fs.readFileSync(path, 'utf8').trim();
if (!raw.endsWith('}')) raw += '\n}';
const data = JSON.parse(raw);

const automated = data.listings.map(listing => {
    // Determine symptoms
    const type = listing.specs.type || '';
    let symptoms = 'General mechanical failure, physical damage, or loss of efficiency.';
    for (const [key, note] of Object.entries(SYMPTOM_MAP)) {
        if (type.toLowerCase().includes(key.toLowerCase()) || listing.title.toLowerCase().includes(key.toLowerCase())) {
            symptoms = note;
            break;
        }
    }

    return {
        ...listing,
        description: MASTER_TEMPLATE(listing, symptoms).replace(/\s+/g, ' ').trim() // Clean whitespace for eBay
    };
});

fs.writeFileSync(path, JSON.stringify({ listings: automated }, null, 2));
console.log(`Successfully automated 88 write-ups using the Power Seller Master Template.`);
