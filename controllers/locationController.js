const tracking = require("../services/trackingService");
const supabase = require("../config/supabase");
const userStore = require("../services/userStore");
const driverStore = require("../services/driverStore");

// =================================
// Update User Location
// =================================

exports.updateUser = (req, res) => {

    const {

        id,

        latitude,

        longitude

    } = req.body;

    tracking.updateUserLocation(

        id,

        latitude,

        longitude

    );

    // Mirror into Users.json — this is what keeps the file's
    // "current location, every 2 sec" field up to date while the
    // rider app is open (see LocationService in the User App).
    userStore.updateLocation(id, latitude, longitude);

    res.json({

        status: true,

        message: "User Location Updated"

    });

};

// =================================
// Update Driver Location
// =================================

exports.updateDriver = (req, res) => {

    const {

        id,

        latitude,

        longitude,

        ambulanceType,

        online

    } = req.body;

    tracking.updateDriverLocation(

        id,

        latitude,

        longitude,

        ambulanceType,

        online

    );

    console.log(`📍 Driver ${id} location update | online=${online} | (${latitude}, ${longitude})`);

    // Mirror into Drivers.json — every ~2s ping from DriverTrackingService
    // (idle) or DriverNavigationPage (on a ride) lands here.
    driverStore.updateLocation(id, latitude, longitude, ambulanceType, online);

    // Best-effort mirror into Supabase so the driver's status/location is
    // visible from the dashboard/DB, not just in this server's memory.
    supabase
        .from("driver_profiles")
        .update({
            is_online: online,
            current_latitude: latitude,
            current_longitude: longitude,
            last_seen: new Date().toISOString()
        })
        .eq("id", id)
        .then(({ error }) => {
            if (error) console.log("⚠️  Supabase driver location sync failed:", error.message);
        });

    res.json({

        status: true,

        message: "Driver Location Updated"

    });

};

// =================================
// Get Drivers
// =================================

exports.getDrivers = (req, res) => {

    res.json(

        driverStore.getAllDrivers()

    );

};

// =================================
// Get Users
// =================================

exports.getUsers = (req, res) => {

    res.json(

        userStore.getAllUsers()

    );

};