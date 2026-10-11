const XLSX = require('xlsx-js-style');
const fs = require('fs');
const path = require('path');
const file = 'C:/laragon/www/sisnerling/Sisnerling/server/storage/workbooks/WB_001/original-7502adecb7ad.xlsx';
const wb = XLSX.read(fs.readFileSync(file), { type: 'buffer', cellDates: true, cellStyles: true });
const ws = wb.Sheets['Penyusutan'];
console.log(ws['C8'], ws['D8'], ws['C9'], ws['D9']);
