/**
 * Invoice Test Script
 * 
 * Usage: npx tsx scripts/test-invoice.ts <ORDER_NUMBER>
 * 
 * This script tests the invoice generation endpoint and saves the PDF locally.
 */

import fs from 'fs';
import path from 'path';

const ORDER_NUMBER = process.argv[2];

if (!ORDER_NUMBER) {
  console.error('❌ Usage: npx tsx scripts/test-invoice.ts <ORDER_NUMBER>');
  console.error('Example: npx tsx scripts/test-invoice.ts TY-ABC123');
  process.exit(1);
}

async function testInvoice() {
  const baseUrl = process.env.PUBLIC_APP_URL || 'https://tykhai.vercel.app';
  const url = `${baseUrl}/api/orders/${ORDER_NUMBER}/invoice`;
  
  console.log(`📄 Testing invoice for order: ${ORDER_NUMBER}`);
  console.log(`🔗 URL: ${url}`);
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    console.log(`\n📊 Response Status: ${response.status} ${response.statusText}`);
    
    const contentType = response.headers.get('content-type');
    console.log(`📄 Content-Type: ${contentType}`);
    
    const contentLength = response.headers.get('content-length');
    console.log(`📦 Content-Length: ${contentLength} bytes`);
    
    const disposition = response.headers.get('content-disposition');
    console.log(`💾 Disposition: ${disposition}`);
    
    if (!response.ok) {
      const error = await response.json();
      console.error('\n❌ Error Response:');
      console.error(JSON.stringify(error, null, 2));
      process.exit(1);
    }
    
    // Get the PDF buffer
    const pdfBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(pdfBuffer);
    
    console.log(`\n✅ PDF Generated Successfully!`);
    console.log(`📏 PDF Size: ${buffer.length} bytes`);
    
    // Save to file
    const outputPath = path.join(process.cwd(), `invoice-${ORDER_NUMBER}.pdf`);
    fs.writeFileSync(outputPath, buffer);
    
    console.log(`💾 Saved to: ${outputPath}`);
    console.log(`\n🎉 Invoice test completed successfully!`);
    
    // Open the file (optional)
    console.log(`\n📖 Open the PDF to verify it contains data:`);
    console.log(`   - Check if customer info is displayed`);
    console.log(`   - Check if product details are shown`);
    console.log(`   - Check if amounts are correct`);
    console.log(`   - Check if PAID stamp is visible`);
    
  } catch (error) {
    console.error('\n❌ Test Failed:');
    console.error(error);
    process.exit(1);
  }
}

testInvoice();
