const supabase = require("../config/supabase");
const socketService = require("../services/socketService");
const tracking = require("../services/trackingService");
const driverStore = require("../services/driverStore");

// Health Check
exports.healthCheck = async (req, res) => {
    res.json({
        status: true,
        message: "Driver API Working"
    });
};

// Get Driver by ID
exports.getDriver = async (req, res) => {
    try {
        const id = req.params.id;

        const { data, error } = await supabase
            .from("driver_profiles") // We'll confirm this table name later
            .select("*")
            .eq("id", id)
            .single();

        if (error) {
            return res.status(404).json({
                status: false,
                message: error.message
            });
        }

        res.json({
            status: true,
            driver: data
        });

    } catch (err) {
        res.status(500).json({
            status: false,
            message: err.message
        });
    }
};

// ==========================================================
// Complete driver registration — called once, right after the driver
// fills in the registration form (name, ambulance type, vehicle
// number). This is what flips profile_completed to true in the DB —
// and the DB itself will reject the update if any required field is
// missing, matching the driver_profile_complete_requires_details CHECK
// constraint in supabase_schema_strict.sql. That's what stops a
// half-filled row from ever being marked "done".
// ==========================================================
exports.completeProfile = async (req, res) => {
    try {
        const { id, driverName, ambulanceType, vehicleNumber } = req.body;

        if (!id || !driverName || !ambulanceType || !vehicleNumber) {
            return res.status(400).json({
                status: false,
                message: "id, driverName, ambulanceType and vehicleNumber are all required"
            });
        }

        const { data, error } = await supabase
            .from("driver_profiles")
            .update({
                driver_name: driverName,
                ambulance_type: ambulanceType,
                vehicle_number: vehicleNumber,
                profile_completed: true
            })
            .eq("id", id)
            .select()
            .maybeSingle();

        if (error) {
            // If the CHECK constraint somehow still fails, Postgres
            // reports it here instead of allowing a partial "completed" row.
            return res.status(400).json({ status: false, message: error.message });
        }

        driverStore.setProfile(id, driverName, data?.phone ?? null, ambulanceType);

        res.json({ status: true, driver: data });

    } catch (err) {
        res.status(500).json({ status: false, message: err.message });
    }
};

// ==========================================================
// Explicit online/offline toggle via REST (a companion to the
// "driver-online" / "driver-offline" socket events — use whichever
// fits your app flow better, or both; they both end up calling the
// same socketService + Supabase sync so the state stays consistent).
// ==========================================================
exports.setStatus = async (req, res) => {
    try {
        const { id, online } = req.body;

        if (!id || online === undefined) {
            return res.status(400).json({ status: false, message: "id and online are required" });
        }

        if (online) {
            // Note: this marks them online in the DB/logs, but they still
            // need an active socket connection (via "driver-online") to
            // actually RECEIVE ride requests in realtime.
            socketService.syncDriverStatus(id, true);
        } else {
            socketService.removeDriver(id);
        }

        const current = tracking.getDriver(id) || {};
        tracking.updateDriverLocation(id, current.latitude, current.longitude, current.ambulanceType, online);
        driverStore.setOnlineState(id, online);

        console.log(`${online ? "🟢" : "🔴"} Driver ${id} set ${online ? "ONLINE" : "OFFLINE"} via REST`);

        res.json({ status: true, message: `Driver marked ${online ? "online" : "offline"}` });

    } catch (err) {
        res.status(500).json({ status: false, message: err.message });
    }
};