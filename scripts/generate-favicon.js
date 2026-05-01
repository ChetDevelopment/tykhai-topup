// scripts/generate-favicon.js
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '..', 'public');
const svgPath = path.join(publicDir, 'favicon.svg');
const icoPath = path.join(publicDir, 'favicon.ico');
const png16 = path.join(publicDir, 'favicon-16x16.png');
const png32 = path.join(publicDir, 'favicon-32x32.png');
const png180 = path.join(publicDir, 'apple-touch-icon.png');

async function generateIcons() {
  try {
    const svgBuffer = fs.readFileSync(svgPath);

    // Generate PNGs in different sizes
    await sharp(svgBuffer).png().resize(16, 16).toFile(png16);
    console.log('✓ Generated favicon-16x16.png');

    await sharp(svgBuffer).png().resize(32, 32).toFile(png32);
    console.log('✓ Generated favicon-32x32.png');

    await sharp(svgBuffer).png().resize(180, 180).toFile(png180);
    console.log('✓ Generated apple-touch-icon.png');

    // For ICO, we need to create it from PNGs
    // Simple approach: use 32x32 PNG as favicon.ico (browsers support PNG as ICO)
    fs.copyFileSync(png32, icoPath);
    console.log('✓ Generated favicon.ico (from 32x32 PNG)');

    console.log('\nAll icons generated successfully!');
  } catch (error) {
    console.error('Error generating icons:', error.message);
  }
}

generateIcons();
