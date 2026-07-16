const supabase = require("../config/supabase");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

// ==========================================================
// DEV-MODE OTP STORE
// ==========================================================
// In-memory only — fine for one dev server instance. Resets on
// restart, and won't work if you run multiple server instances
// behind a load balancer. Swap for a Redis/DB table before
// going to production, and swap the console.log below for a
// real SMS provider (Twilio/MSG91) at the same time. Nothing
// else (routes, Flutter apps) needs to change when you do.
// ==========================================================

const otpStore = new Map(); // phone -> { code, expiresAt }

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const JWT_SECRET = process.env.JWT_SECRET;

function generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// ==========================
// SEND OTP
// ==========================
exports.sendOtp = async (req, res) => {
    try {
        const { phone } = req.body;

        if (!phone) {
            return res.status(400).json({
                success: false,
                message: "Phone number is required"
            });
        }

        const code = generateOtp();

        otpStore.set(phone, {
            code,
            expiresAt: Date.now() + OTP_TTL_MS
        });

        // DEV MODE: no SMS provider wired up yet, so we log the OTP on the
        // server console AND return it in the response so you can test
        // end-to-end without paying for SMS. Remove `devOtp` from the
        // response once a real provider (Twilio/MSG91) is wired in below.
        console.log(`[DEV OTP] ${phone} -> ${code}`);

        res.json({
            success: true,
            message: "OTP sent (dev mode)",
            devOtp: code
        });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ==========================
// VERIFY OTP
// ==========================
exports.verifyOtp = async (req, res) => {
    try {
        const { phone, otp } = req.body;

        if (!phone || !otp) {
            return res.status(400).json({
                success: false,
                message: "Phone and OTP are required"
            });
        }

        const record = otpStore.get(phone);

        if (!record) {
            return res.status(400).json({
                success: false,
                message: "No OTP requested for this number"
            });
        }

        if (Date.now() > record.expiresAt) {
            otpStore.delete(phone);
            return res.status(400).json({
                success: false,
                message: "OTP expired, request a new one"
            });
        }

        if (record.code !== otp) {
            return res.status(400).json({
                success: false,
                message: "Incorrect OTP"
            });
        }

        // Correct — consume it so it can't be replayed
        otpStore.delete(phone);

        // Look up an existing driver by phone
        const { data: existing, error: lookupError } = await supabase
            .from("driver_profiles")
            .select("*")
            .eq("phone", phone)
            .maybeSingle();

        if (lookupError) {
            return res.status(500).json({
                success: false,
                message: lookupError.message
            });
        }

        let driverId;
        let ambulanceType = null;
        let newDriver;

        if (existing) {
            // Returning driver
            driverId = existing.id;
            ambulanceType = existing.ambulance_type ?? null;
            newDriver = false;
        } else {
            // First-time driver — create a bare profile row now (id + phone
            // only). driver reg.dart fills in the rest (name, ambulance
            // type, vehicle info) using this same id.
            driverId = crypto.randomUUID();
            newDriver = true;

            const { error: insertError } = await supabase
                .from("driver_profiles")
                .insert({ id: driverId, phone });

            if (insertError) {
                return res.status(500).json({
                    success: false,
                    message: insertError.message
                });
            }
        }

        const token = jwt.sign(
            { driverId, phone },
            JWT_SECRET,
            { expiresIn: "30d" }
        );

        res.json({
            success: true,
            token,
            driverId,
            newDriver,
            ambulanceType
        });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
