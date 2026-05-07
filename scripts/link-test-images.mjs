import fs from 'fs';
const data = JSON.parse(fs.readFileSync('scratch/ebay-html/listings.normalized.json', 'utf8'));

const updates = {
  'WE21X20562': './images/WE21X20562.png',
  'WE11M10001': './images/WE11M10001.png',
  'WE17X22217': './images/WE17X22217.png'
};

data.listings.forEach(l => {
  if (updates[l.partNumber]) {
    l.imageUrl = updates[l.partNumber];
  }
});

fs.writeFileSync('scratch/ebay-html/listings.normalized.json', JSON.stringify(data, null, 2));
console.log('Updated 3 listings with local images.');
