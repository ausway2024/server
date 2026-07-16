const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

// ==========================================================
// IMPORTANT: this server must use the SERVICE ROLE key, not the anon
// key. The Flutter apps use Supabase Auth (auth.uid()) with Row Level
// Security policies like "auth.uid() = id" — that's correct and secure
// for the apps, but it means a plain anon-key request (no end-user JWT
// attached, which is what this server sends) has no auth.uid() and
// would get silently blocked by those same policies. The service role
// key bypasses RLS entirely, which is the right choice for a trusted
// backend that legitimately needs to read/write across every user and
// driver (matching riders to drivers, delivering bookings, etc — things
// no single end-user's RLS policy would ever allow).
//
// Get it from: Supabase Dashboard → Project Settings → API → "service_role"
// NEVER put this key in the Flutter apps — only this server should have it.
// ==========================================================
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log("⚠️  SUPABASE_SERVICE_ROLE_KEY not set in .env — falling back to the anon key.");
    console.log("   With RLS enabled (see supabase_schema.sql), server-side reads/writes WILL fail.");
    console.log("   Add SUPABASE_SERVICE_ROLE_KEY to .env — see config/supabase.js for details.");
}

const supabase = createClient(
    process.env.SUPABASE_URL,
    key
);

module.exports = supabase;
