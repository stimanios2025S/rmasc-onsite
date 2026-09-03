const { execSync } = require('child_process');
const fs = require('fs');

try {
  const mech = execSync('pdftotext "d:/rmasc-onsite-main/backend/public/uploads/guides/guide-mecanique.pdf" -', { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  fs.writeFileSync('d:/rmasc-onsite-main/guide-mecanique.txt', mech);
  console.log('=== GUIDE MECANIQUE ===');
  console.log(mech);
} catch(e) {
  console.error('Error reading mechanical guide:', e.message);
}

try {
  const elec = execSync('pdftotext "d:/rmasc-onsite-main/backend/public/uploads/guides/guide-electrique.pdf" -', { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  fs.writeFileSync('d:/rmasc-onsite-main/guide-electrique.txt', elec);
  console.log('=== GUIDE ELECTRIQUE ===');
  console.log(elec);
} catch(e) {
  console.error('Error reading electrical guide:', e.message);
}
