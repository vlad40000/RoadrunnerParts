const fs = require('fs');
const path = require('path');

const missingParts = [
  "WE21X20407", "WE10X20418", "WE18M28", "WE12X21574", "WE13X30697",
  "WD21X557", "WH2M270", "WE09X20441", "WE3M51", "WE1M1101",
  "WE3M52", "WE12X20395", "WE1M966", "WE1M536", "WE1M505",
  "WZ05X0158", "WE00X1811"
];

const files = fs.readdirSync('.').filter(f => f.startsWith('fix_com_') && f.endsWith('.txt'));

files.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  missingParts.forEach(part => {
    if (content.includes(part)) {
      console.log(`Found ${part} in ${file}`);
    }
  });
});
