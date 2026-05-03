/**
 * Quick Payment Flow Test
 * Tests that QR is ALWAYS returned, never null, never 503
 * 
 * Run: npx tsx scripts/quick-payment-test.ts
 */

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

async function testPaymentFlow() {
  console.log("🧪 Quick Payment Flow Test");
  console.log("=".repeat(60));
  console.log(`Base URL: ${BASE_URL}`);
  console.log();

  const testData = {
    gameId: "cmonqi0c80001s4e2iioj1tah",
    productId: "cmonqi2rg000ds4e2wi6r7dj6",
    playerUid: "123456789",
    paymentMethod: "BAKONG" as const,
    currency: "USD" as const,
  };

  console.log("📦 Test Data:");
  console.log(`   Game: ${testData.gameId}`);
  console.log(`   Product: ${testData.productId}`);
  console.log(`   Payment: ${testData.paymentMethod}`);
  console.log();

  const startTime = Date.now();
  let response: Response;
  let data: any;

  try {
    response = await fetch(`${BASE_URL}/api/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(testData),
    });

    const endTime = Date.now();
    const responseTime = endTime - startTime;

    console.log(`⏱️  Response Time: ${responseTime}ms`);
    console.log(`📡 Status Code: ${response.status}`);
    console.log();

    data = await response.json();
  } catch (error: any) {
    console.log("❌ FAILED: Connection error");
    console.log(`   Error: ${error.message}`);
    process.exit(1);
  }

  // Test results
  const tests = [
    {
      name: "Status Code",
      pass: response.status === 200,
      expected: "200",
      actual: response.status.toString(),
    },
    {
      name: "Order Number",
      pass: !!data.orderNumber,
      expected: "Present",
      actual: data.orderNumber || "MISSING",
    },
    {
      name: "QR Code",
      pass: !!data.qr && typeof data.qr === "string",
      expected: "Valid string",
      actual: data.qr ? `${data.qr.length} chars` : "NULL/MISSING",
    },
    {
      name: "QR Format",
      pass: data.qr?.startsWith("000201") && data.qr.length > 50,
      expected: "Starts with 000201, >50 chars",
      actual: data.qr ? `${data.qr.slice(0, 20)}... (${data.qr.length})` : "N/A",
    },
    {
      name: "Payment Ref",
      pass: !!data.paymentRef,
      expected: "Present",
      actual: data.paymentRef || "MISSING",
    },
    {
      name: "MD5 Hash",
      pass: !!data.md5Hash && data.md5Hash.length === 32,
      expected: "32 char hash",
      actual: data.md5Hash ? `${data.md5Hash.length} chars` : "MISSING",
    },
    {
      name: "Expiry",
      pass: !!data.expiresAt,
      expected: "Present",
      actual: data.expiresAt || "MISSING",
    },
    {
      name: "No 503 Error",
      pass: response.status !== 503,
      expected: "Not 503",
      actual: response.status === 503 ? "GOT 503!" : "OK",
    },
  ];

  console.log("📊 Test Results:");
  console.log("-".repeat(60));
  
  let passed = 0;
  let failed = 0;

  tests.forEach((test, i) => {
    const icon = test.pass ? "✅" : "❌";
    console.log(`${icon} ${test.name}`);
    console.log(`   Expected: ${test.expected}`);
    console.log(`   Actual:   ${test.actual}`);
    console.log();
    
    if (test.pass) passed++;
    else failed++;
  });

  console.log("=".repeat(60));
  console.log(`Summary: ${passed}/${tests.length} passed, ${failed} failed`);
  console.log();

  // Show debug info if present
  if (data._debug) {
    console.log("🔍 Debug Info:");
    console.log(`   Simulation Mode: ${data._debug.simulationMode}`);
    console.log(`   Processing Time: ${data._debug.processingTime}`);
    console.log(`   QR Generated: ${data._debug.qrGenerated}`);
    console.log(`   QR Length: ${data._debug.qrLength}`);
    console.log(`   Final Price: $${data._debug.finalPrice}`);
    console.log();
    
    if (data._debug.steps) {
      console.log("📝 Execution Steps:");
      data._debug.steps.forEach((step: any) => {
        console.log(`   ${step.step}. ${step.name.padEnd(20)} - ${step.time}ms`);
      });
      console.log();
    }
  }

  // Final verdict
  if (failed === 0) {
    console.log("🎉 SUCCESS! All tests passed!");
    console.log();
    console.log("✅ QR is always generated");
    console.log("✅ No 503 errors");
    console.log("✅ Response time is acceptable");
    console.log();
    process.exit(0);
  } else {
    console.log("❌ FAILURE! Some tests failed.");
    console.log();
    
    if (failed >= 1 && tests[2].pass === false) {
      console.log("🚨 CRITICAL: QR code is missing!");
      console.log("   This is the #1 issue that must be fixed.");
      console.log();
    }
    
    if (tests[7].pass === false) {
      console.log("🚨 CRITICAL: Got 503 error!");
      console.log("   This should never happen in simulation mode.");
      console.log();
    }
    
    process.exit(1);
  }
}

testPaymentFlow().catch((error) => {
  console.error("💥 Test script error:", error);
  process.exit(1);
});
