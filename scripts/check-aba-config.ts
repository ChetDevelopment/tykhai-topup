/**
 * ABA Configuration Diagnostic Script
 * Quick check to verify ABA PayWay is properly configured
 * 
 * Run: npx tsx scripts/check-aba-config.ts
 */

import { readFileSync } from "fs";
import { join } from "path";

console.log("🔍 ABA PayWay Configuration Check\n");

// Check .env.local
const envPath = join(process.cwd(), ".env.local");
let envContent = "";

try {
  envContent = readFileSync(envPath, "utf-8");
  console.log("✅ Found .env.local\n");
} catch (error) {
  console.log("❌ .env.local not found\n");
  console.log("   Create .env.local file with ABA credentials\n");
  process.exit(1);
}

// Parse env vars
const envVars: Record<string, string> = {};
envContent.split("\n").forEach(line => {
  const match = line.match(/^([^#][^=]+)=(.*)$/);
  if (match) {
    const key = match[1].trim();
    const value = match[2].trim().replace(/^["']|["']$/g, "");
    envVars[key] = value;
  }
});

// Check ABA credentials
const checks = [
  { key: "ABA_PAYWAY_API", label: "ABA API URL", required: false, default: "https://checkout.payway.com.kh" },
  { key: "ABA_MERCHANT_ID", label: "Merchant ID", required: true },
  { key: "ABA_SECRET_KEY", label: "Secret Key", required: true },
  { key: "ABA_PUBLIC_KEY", label: "Public Key", required: true },
  { key: "PUBLIC_APP_URL", label: "Public App URL", required: true },
];

let allOk = true;

checks.forEach(check => {
  const value = envVars[check.key];
  const hasValue = !!value && value.length > 0;
  const isDefault = check.default && value === check.default;
  
  if (check.required && !hasValue) {
    console.log(`❌ ${check.label}: MISSING`);
    console.log(`   Add to .env.local: ${check.key}="your_value_here"`);
    allOk = false;
  } else if (hasValue && isDefault) {
    console.log(`⚠️  ${check.label}: DEFAULT VALUE (update for production)`);
  } else if (hasValue) {
    const masked = value.length > 8 ? value.slice(0, 4) + "..." + value.slice(-4) : "****";
    console.log(`✅ ${check.label}: ${masked}`);
  } else {
    console.log(`⚪ ${check.label}: Not set (optional)`);
  }
});

console.log("");

// Check webhook configuration
console.log("📡 Webhook Configuration:");
const publicUrl = envVars.PUBLIC_APP_URL;
if (publicUrl) {
  const webhookUrl = `${publicUrl}/api/payment/webhook/aba`;
  console.log(`   Webhook URL: ${webhookUrl}`);
  
  if (publicUrl.includes("localhost") || publicUrl.includes("127.0.0.1")) {
    console.log("   ⚠️  WARNING: Localhost webhooks won't work with ABA!");
    console.log("   Use ngrok or Cloudflare Tunnel for local testing:");
    console.log("   cloudflared tunnel --url http://localhost:3000");
  } else if (publicUrl.startsWith("http://")) {
    console.log("   ⚠️  WARNING: Use HTTPS for production webhooks!");
  } else {
    console.log("   ✅ Webhook URL looks good");
  }
} else {
  console.log("   ❌ PUBLIC_APP_URL not configured");
  allOk = false;
}

console.log("");

// Check files
console.log("📁 File Check:");
const files = [
  "lib/aba-payway.ts",
  "app/api/payment/webhook/aba/route.ts",
  "public/aba-logo.png",
];

files.forEach(file => {
  const filePath = join(process.cwd(), file);
  try {
    readFileSync(filePath, "utf-8");
    console.log(`   ✅ ${file}`);
  } catch (error) {
    console.log(`   ❌ ${file} NOT FOUND`);
    allOk = false;
  }
});

console.log("");

// Summary
if (allOk) {
  console.log("✅ ABA configuration looks good!\n");
  console.log("🚀 Next steps:");
  console.log("   1. Restart your dev server");
  console.log("   2. Test payment flow in browser");
  console.log("   3. Configure webhook URL in ABA dashboard");
  console.log("");
} else {
  console.log("❌ Configuration incomplete\n");
  console.log("   Please update .env.local with required values\n");
  process.exit(1);
}
