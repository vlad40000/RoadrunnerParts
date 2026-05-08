import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';

const MANIFEST_PATH = 'scratch/ebay-images/image-candidates.json';
const OUTPUT_DIR = 'scratch/images';

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));

const downloadImage = (url, dest) => {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        const protocol = url.startsWith('https') ? https : http;
        
        protocol.get(url, (response) => {
            if (response.statusCode === 200) {
                response.pipe(file);
                file.on('finish', () => {
                    file.close();
                    resolve();
                });
            } else if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                // follow redirect
                const redirectUrl = new URL(response.headers.location, url).href;
                file.close();
                fs.unlinkSync(dest);
                downloadImage(redirectUrl, dest).then(resolve).catch(reject);
            } else {
                file.close();
                fs.unlinkSync(dest);
                reject(new Error(`Status Code: ${response.statusCode}`));
            }
        }).on('error', (err) => {
            file.close();
            fs.unlinkSync(dest);
            reject(err);
        });
    });
};

async function main() {
    let downloaded = 0;
    let failed = 0;
    let skipped = 0;

    for (const record of manifest.records) {
        const partNumber = record.partNumber;
        if (!record.candidates || record.candidates.length === 0) {
            console.log(`Skipping ${partNumber} (no candidates)`);
            skipped++;
            continue;
        }

        // Get the best candidate (first one)
        const candidate = record.candidates[0];
        let url = candidate.imageUrl;
        
        // Use a simple extension detection based on URL or default to jpg
        let ext = '.jpg';
        if (url.toLowerCase().endsWith('.png')) ext = '.png';
        if (url.toLowerCase().endsWith('.webp')) ext = '.webp';
        
        const dest = path.join(OUTPUT_DIR, `${partNumber}${ext}`);
        
        if (fs.existsSync(dest)) {
            console.log(`Already downloaded ${partNumber}`);
            skipped++;
            continue;
        }

        console.log(`Downloading image for ${partNumber}...`);
        try {
            await downloadImage(url, dest);
            downloaded++;
            await new Promise(r => setTimeout(r, 100)); // be nice
        } catch (e) {
            console.error(`Failed to download ${partNumber}: ${e.message}`);
            failed++;
        }
    }

    console.log(`\nDone! Downloaded: ${downloaded}, Failed: ${failed}, Skipped: ${skipped}`);
}

main().catch(console.error);
