/**
 * Payment QR Code Test Script
 * 
 * Tests that /api/orders always returns a valid QR code
 * Run: npx tsx scripts/test-payment-qr.ts
 */

import { $ } from "bunx";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  details?: unknown;
}

const results: TestResult[] = [];

function logResult(result: TestResult) {
  const icon = result.passed ? "✅" : "❌";
  console.log(`\n${icon} ${result.name}`);
  console.log(`   ${result.message}`);
  if (result.details) {
    console.log(`   Details:`, result.details);
  }
  results.push(result);
}

async function testPaymentQR() {
  console.log("🧪 Payment QR Code Test");
  console.log("=" .repeat(50));
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);

  // Test data - adjust gameId and productId to match your database
  const testData = {
    gameId: "cmonqi0c80001s4e2iioj1tah", // Mobile Legends
    productId: "cmonqi2rg000ds4e2wi6r7dj6", // 257 Diamonds - $5.20
    playerUid: "123456789",
    paymentMethod: "BAKONG",
    currency: "USD" as const,
    customerEmail: "test@gmail.com",
    customerName: "Test User",
  };

  console.log("\n📦 Test Data:");
  console.log(JSON.stringify(testData, null, 2));

  // Test 1: API Response Time
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

    logResult({
      name: "Response Time",
      passed: responseTime < 2000,
      message: `${responseTime}ms (target: <2000ms)`,
      details: { responseTime, status: response.status },
    });

    data = await response.json();
  } catch (error) {
    logResult({
      name: "API Connection",
      passed: false,
      message: `Failed to connect: ${error instanceof Error ? error.message : String(error)}`,
    });
    printSummary();
    process.exit(1);
  }

  // Test 2: HTTP Status Code
  logResult({
    name: "HTTP Status Code",
    passed: response.status === 200,
    message: `Status: ${response.status}`,
    details: data.error ? { error: data.error, code: data.code } : undefined,
  });

  // Test 3: Order Number Exists
  logResult({
    name: "Order Number",
    passed: !!data.orderNumber,
    message: data.orderNumber ? `Order: ${data.orderNumber}` : "Missing order number",
  });

  // Test 4: QR Code Exists (CRITICAL)
  logResult({
    name: "QR Code Exists",
    passed: !!data.qr && typeof data.qr === "string",
    message: data.qr ? `QR length: ${data.qr.length} chars` : "❌ QR IS NULL OR MISSING!",
    details: data.qr ? { length: data.qr.length, startsWith: data.qr.slice(0, 20) } : { received: data.qr },
  });

  // Test 5: QR Code Format (KHQR starts with "000201")
  if (data.qr) {
    const isValidFormat = data.qr.startsWith("000201") && data.qr.length > 50;
    logResult({
      name: "QR Code Format",
      passed: isValidFormat,
      message: isValidFormat ? "Valid KHQR format" : `Invalid format: ${data.qr.slice(0, 30)}...`,
      details: { 
        startsWith000201: data.qr.startsWith("000201"),
        length: data.qr.length,
        minLength: 50,
      },
    });
  }

  // Test 6: Payment Reference Exists
  logResult({
    name: "Payment Reference",
    passed: !!data.paymentRef,
    message: data.paymentRef ? `Ref: ${data.paymentRef}` : "Missing payment reference",
  });

  // Test 7: MD5 Hash Exists
  logResult({
    name: "MD5 Hash",
    passed: !!data.md5Hash && typeof data.md5Hash === "string",
    message: data.md5Hash ? `Hash length: ${data.md5Hash.length} chars` : "Missing MD5 hash",
  });

  // Test 8: Expiry Date Exists
  logResult({
    name: "Expiry Date",
    passed: !!data.expiresAt,
    message: data.expiresAt ? `Expires: ${new Date(data.expiresAt).toLocaleString()}` : "Missing expiry",
  });

  // Test 9: Instructions Exist
  logResult({
    name: "Instructions",
    passed: !!data.instructions,
    message: data.instructions ? data.instructions.slice(0, 50) + "..." : "Missing instructions",
  });

  // Test 10: Simulation Mode Active
  const isSimulation = data._debug?.simulationMode === "true" || data.qr?.includes("SIM-");
  logResult({
    name: "Simulation Mode",
    passed: isSimulation,
    message: isSimulation ? "Simulation mode detected" : "Real payment mode (or debug info missing)",
    details: data._debug,
  });

  // Test 11: No 503 Error
  logResult({
    name: "No 503 Timeout",
    passed: response.status !== 503,
    message: response.status === 503 ? "❌ Got 503 timeout error" : `Status ${response.status} (not 503)`,
  });

  // Test 12: Response Has No Null QR
  logResult({
    name: "QR Not Null",
    passed: data.qr !== null && data.qr !== undefined,
    message: data.qr !== null ? "QR is not null" : "❌ QR is explicitly null",
  });

  printSummary();

  // Exit with error code if any critical tests failed
  const criticalFailures = results.filter(r => 
    !r.passed && ["QR Code Exists", "QR Code Format", "QR Not Null"].includes(r.name)
  );

  if (criticalFailures.length > 0) {
    console.log("\n🚨 CRITICAL FAILURES DETECTED");
    console.log("The payment QR fix may not be working correctly.");
    process.exit(1);
  } else {
    console.log("\n✅ All critical tests passed!");
    console.log("Payment QR code is working correctly.");
    process.exit(0);
  }
}

function printSummary() {
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;

  console.log("\n" + "=".repeat(50));
  console.log(`📊 Test Summary: ${passed}/${total} passed, ${failed} failed`);
  console.log("=".repeat(50));

  if (failed > 0) {
    console.log("\n❌ Failed Tests:");
    results.filter(r => !r.passed).forEach(r => {
      console.log(`   - ${r.name}: ${r.message}`);
    });
  }
}

// Run test
testPaymentQR().catch((error) => {
  console.error("Test script error:", error);
  process.exit(1);
});
