const fs = require('fs');
const path = require('path');

const inputPath = 'C:/Users/bradv/Downloads/Ebay listings revised 1.txt';
const outputPath = path.join(__dirname, 'finalized_52_listings.json');

const partsToKeep = new Set([
  "WE21X20562", "WE21X20407", "WE19M1713", "WE11M10001", "WE11X20397", 
  "WE17X22217", "WE17M66", "WE20X20596", "WE4M160", "WE4M532", 
  "WE49X22295", "WE10X20418", "WE20X20409", "WE20X20412", "WE03X20434", 
  "WE20X20417", "WE20X20396", "WE4M137", "WE20X20391", "WE49X22294", 
  "WE14X20392", "WE19M1481", "WE10X20468", "WE4M181", "WE19M1478", 
  "WE16X20393", "WE18X25100", "WE18M28", "WE14X20425", "WE13M39", 
  "WE20X20406", "WE1M1002", "WE1X921", "WE1M300", "WE03X29897", 
  "WE4M404", "WE12X21574", "WE1M1003", "WE4M255", "WE13X30697", 
  "WE11X29438", "WE1M1007", "WE3M56", "WE03X20228", 
  "WE4M415", "WE1M462", "WE11X20400", "WE01X20419", "WE4M416", 
  "WE4M127", "WE4M525"
]);

let raw = fs.readFileSync(inputPath, 'utf8').trim();
if (!raw.endsWith('}')) raw += '\n}';

const data = JSON.parse(raw);

const filteredListings = data.listings.filter(listing => 
  partsToKeep.has(listing.partNumber.toUpperCase())
);

console.log(`Original listings: ${data.listings.length}`);
console.log(`Filtered listings: ${filteredListings.length}`);

fs.writeFileSync(outputPath, JSON.stringify({ listings: filteredListings }, null, 2));
console.log(`Saved filtered listings to ${outputPath}`);
