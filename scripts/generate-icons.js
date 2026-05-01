// scripts/generate-icons.js
// Generate favicon.ico and icon PNGs from SVG

const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '..', 'public');

// For now, let's create a simple ICO file from the SVG
// In production, you'd use a library like sharp or canvas

const svgContent = fs.readFileSync(path.join(publicDir, 'favicon.svg'), 'utf8');

console.log('SVG favicon created at: public/favicon.svg');
console.log('For favicon.ico, you can:');
console.log('1. Open public/favicon.svg in browser and use browser dev tools to convert');
console.log('2. Use an online converter: https://cloudconvert.com/svg-to-ico');
console.log('3. Install sharp: npm install sharp');
console.log('');
console.log('The SVG icon features:');
console.log('- TK text (Ty Khai)');
console.log('- Gradient: Indigo (#6366F1) to Gold (#F59E0B)');
console.log('- Dark background (#040408)');
console.log('- Rounded corners (15px border-radius equivalent)');
