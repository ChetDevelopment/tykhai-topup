/**
 * Payment Flow Validation Test
 * Validates that /api/orders returns QR code instantly
 * 
 * Run: npx tsx scripts/validate-payment-flow.ts
 */

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  duration?: number;
}

async function validatePaymentFlow() {
  console.log("🧪 Payment Flow Validation Test");
  console.log("=".repeat(60));
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log();

  const results: TestResult[] = [];
  
  // Test data - adjust gameId and productId to match your database
  const testData = {
    gameId: "cmonqi0c80001s4e2iioj1tah", // Mobile Legends
    productId: "cmonqi2rg000ds4e2wi6r7dj6", // 257 Diamonds - $5.20
    playerUid: "123456789",
    paymentMethod: "BAKONG" as const,
    currency: "USD" as const,
    customerEmail: "test@gmail.com",
  };

  console.log("📦 Test Data:");
  console.log(`   Game: ${testData.gameId}`);
  console.log(`   Product: ${testData.productId}`);
  console.log(`   Payment Method: ${testData.paymentMethod}`);
  console.log(`   Currency: ${testData.currency}`);
  console.log();

  // Test 1: API Response Time
  console.log("⏱️  Testing API response time...");
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

    results.push({
      name: "Response Time",
      passed: responseTime < 2000,
      message: `${responseTime}ms (target: <2000ms)`,
      duration: responseTime,
    });

    data = await response.json();
  } catch (error) {
    results.push({
      name: "API Connection",
      passed: false,
      message: `Failed to connect: ${error instanceof Error ? error.message : String(error)}`,
    });
    printResults(results);
    process.exit(1);
  }

  // Test 2: HTTP Status Code
  results.push({
    name: "HTTP Status Code",
    passed: response.status === 200,
    message: `Status: ${response.status}`,
  });

  // Test 3: Order Number Exists
  results.push({
    name: "Order Number",
    passed: !!data.orderNumber,
    message: data.orderNumber ? `Order: ${data.orderNumber}` : "Missing order number",
  });

  // Test 4: QR Code Exists (CRITICAL)
  results.push({
    name: "QR Code Exists",
    passed: !!data.qr && typeof data.qr === "string",
    message: data.qr ? `QR length: ${data.qr.length} chars` : "❌ QR IS NULL OR MISSING!",
  });

  // Test 5: QR Code Format (KHQR starts with "000201")
  if (data.qr) {
    const isValidFormat = data.qr.startsWith("000201") && data.qr.length > 50;
    results.push({
      name: "QR Code Format",
      passed: isValidFormat,
      message: isValidFormat ? "Valid KHQR format" : `Invalid format: ${data.qr.slice(0, 30)}...`,
    });
  }

  // Test 6: Payment Reference Exists
  results.push({
    name: "Payment Reference",
    passed: !!data.paymentRef,
    message: data.paymentRef ? `Ref: ${data.paymentRef}` : "Missing payment reference",
  });

  // Test 7: MD5 Hash Exists
  results.push({
    name: "MD5 Hash",
    passed: !!data.md5Hash && typeof data.md5Hash === "string",
    message: data.md5Hash ? `Hash length: ${data.md5Hash.length} chars` : "Missing MD5 hash",
  });

  // Test 8: Expiry Date Exists
  results.push({
    name: "Expiry Date",
    passed: !!data.expiresAt,
    message: data.expiresAt ? `Expires: ${new Date(data.expiresAt).toLocaleString()}` : "Missing expiry",
  });

  // Test 9: No 503 Error
  results.push({
    name: "No 503 Timeout",
    passed: response.status !== 503,
    message: response.status === 503 ? "❌ Got 503 timeout error" : `Status ${response.status} (not 503)`,
  });

  // Test 10: Simulation Mode Check
  const isSimulation = data._debug?.simulationMode === true || data.paymentRef?.startsWith("SIM-");
  results.push({
    name: "Simulation Mode",
    passed: isSimulation,
    message: isSimulation ? "Simulation mode active" : "Real payment mode",
  });

  // Test 11: Debug Info (dev only)
  if (process.env.NODE_ENV === "development") {
    results.push({
      name: "Debug Info Present",
      passed: !!data._debug,
      message: data._debug ? "Debug info included" : "Debug info missing",
    });
    
    if (data._debug) {
      console.log();
      console.log("🔍 Debug Information:");
      console.log(`   Simulation Mode: ${data._debug.simulationMode}`);
      console.log(`   Processing Time: ${data._debug.processingTime}`);
      console.log(`   Skipped Checks: ${data._debug.skippedChecks?.join(", ") || "none"}`);
      console.log(`   Payment Method: ${data._debug.paymentMethodUsed}`);
    }
  }

  console.log();
  printResults(results);

  // Exit with error code if critical tests failed
  const criticalFailures = results.filter(r => 
    !r.passed && ["QR Code Exists", "QR Code Format", "Order Number"].includes(r.name)
  );

  if (criticalFailures.length > 0) {
    console.log();
    console.log("🚨 CRITICAL FAILURES DETECTED");
    console.log("The payment flow is NOT working correctly.");
    process.exit(1);
  } else {
    console.log();
    console.log("✅ All critical tests passed!");
    console.log("Payment flow is working correctly.");
    
    // Check performance
    const responseTimeTest = results.find(r => r.name === "Response Time");
    if (responseTimeTest?.duration) {
      if (responseTimeTest.duration < 1000) {
        console.log(`⚡ Excellent! Response time: ${responseTimeTest.duration}ms (<1s)`);
      } else if (responseTimeTest.duration < 2000) {
        console.log(`✓ Good! Response time: ${responseTimeTest.duration}ms (<2s)`);
      } else {
        console.log(`⚠️  Warning! Response time: ${responseTimeTest.duration}ms (>2s target)`);
      }
    }
    
    process.exit(0);
  }
}

function printResults(results: TestResult[]) {
  console.log();
  console.log("=".repeat(60));
  console.log("📊 Test Results:");
  console.log("=".repeat(60));
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  results.forEach(r => {
    const icon = r.passed ? "✅" : "❌";
    console.log(`${icon} ${r.name}`);
    console.log(`   ${r.message}`);
  });
  
  console.log();
  console.log(`Summary: ${passed}/${results.length} passed, ${failed} failed`);
  console.log("=".repeat(60));
}

// Run test
validatePaymentFlow().catch((error) => {
  console.error("Test script error:", error);
  process.exit(1);
});
