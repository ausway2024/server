const nearestDriver = require("../services/nearestDriver");
const socket = require("../sockets/socket");
const socketService = require("../services/socketService");
const supabase = require("../config/supabase");
const userStore = require("../services/userStore");
const driverStore = require("../services/driverStore");

// In-memory bookings, keyed by userId (one active booking per user at a
// time). This is mirrored into the Supabase "bookings" table (see
// syncBookingToDb below) so history survives a server restart and so the
// table you already created actually gets populated instead of staying
// empty — previously nothing in this file ever wrote to "bookings".
let bookings = {};

// ==========================================================
// Supabase sync — best effort, never blocks the realtime path
// ==========================================================
async function syncBookingToDb(booking) {
    try {
        const { error } = await supabase
            .from("bookings")
            .upsert({
                booking_ref: booking.bookingId,
                user_id: booking.userId,
                driver_id: booking.driverId,
                ambulance_type: booking.ambulanceType,
                pickup_lat: booking.pickupLat,
                pickup_lng: booking.pickupLng,
                pickup_address: booking.pickupAddress,
                dest_lat: booking.destLat,
                dest_lng: booking.destLng,
                dest_address: booking.destAddress,
                status: booking.status
            }, { onConflict: "booking_ref" });

        if (error) {
            console.log("⚠️  Supabase booking sync failed:", error.message);
        }
    } catch (err) {
        console.log("⚠️  Supabase booking sync threw:", err.message);
    }
}

// ==========================================================
// REQUEST BOOKING
// ==========================================================
exports.requestBooking = async (req, res) => {

    try {
        const {
            userId,
            latitude,
            longitude,
            ambulanceType,
            pickupAddress,
            destLatitude,
            destLongitude,
            destAddress
        } = req.body;

        if (!userId || latitude === undefined || longitude === undefined || !ambulanceType) {
            return res.status(400).json({
                status: false,
                message: "userId, latitude, longitude and ambulanceType are required"
            });
        }

        const driver = nearestDriver.findNearestDriver(
            latitude,
            longitude,
            ambulanceType
        );

        if (!driver) {
            console.log(`🚫 No driver available for type "${ambulanceType}" near (${latitude}, ${longitude})`);
            return res.json({
                status: false,
                message: "No Driver Available"
            });
        }

        // Look up the rider's name/phone so the driver sees who they're
        // picking up, not just a raw userId.
        let userName = "Rider";
        let userPhone = null;
        try {
            const { data: userProfile } = await supabase
                .from("user_profiles")
                .select("first_name, last_name, phone")
                .eq("id", userId)
                .maybeSingle();

            if (userProfile) {
                userName = `${userProfile.first_name ?? ""} ${userProfile.last_name ?? ""}`.trim() || "Rider";
                userPhone = userProfile.phone ?? null;
            }
        } catch (_) {
            // Non-fatal — booking still goes out even if the profile lookup fails.
        }

        bookings[userId] = {
            bookingId: Date.now().toString(),
            userId,
            userName,
            userPhone,
            driverId: driver.driverId,
            ambulanceType,
            pickupLat: latitude,
            pickupLng: longitude,
            pickupAddress: pickupAddress || null,
            destLat: destLatitude ?? null,
            destLng: destLongitude ?? null,
            destAddress: destAddress || null,
            status: "PENDING"
        };

        syncBookingToDb(bookings[userId]);

        // Users.json — record the ambulance type picked and the red-pin
        // pickup / green-pin destination exactly as set on SetLocation.dart,
        // the moment "Confirm" is tapped.
        userStore.setBookingDetails(userId, {
            name: userName,
            number: userPhone,
            ambulanceType,
            pickupLatitude: latitude,
            pickupLongitude: longitude,
            pickupAddress,
            destLatitude: destLatitude ?? null,
            destLongitude: destLongitude ?? null,
            destAddress
        });

        const io = socket.getIO();
        const driverSocket = socketService.getDriverSocket(driver.driverId);

        if (driverSocket) {
            io.to(driverSocket).emit("new-booking", bookings[userId]);
            console.log(`📨 new-booking sent to driver ${driver.driverId} (socket ${driverSocket})`);
        } else {
            // This is the #1 cause of "request not reaching the driver app":
            // the matching logic (nearestDriver / trackingService, fed by
            // POST /api/location/driver) found a driver, but that driver's
            // socket ID isn't registered in socketService — meaning the
            // driver app never emitted "driver-online" on this connection,
            // or emitted it with a DIFFERENT id than the one stored via the
            // location endpoint. Both ids must be the exact same driverId.
            console.log(`⚠️  Driver ${driver.driverId} matched but has NO live socket connection — booking saved, but the driver app will not get a push. Check that the driver app calls socket.emit("driver-online", driverId) with the same id used for /api/location/driver.`);
        }

        res.json({
            status: true,
            booking: bookings[userId]
        });

    } catch (err) {
        res.status(500).json({ status: false, message: err.message });
    }

};

// ==========================================================
// GET BOOKING (by userId) — used by the User App to poll status
// ==========================================================
exports.getBooking = (req, res) => {

    const booking = bookings[req.params.userId];

    if (!booking) {
        return res.json({
            status: false,
            message: "Booking Not Found"
        });
    }

    res.json({
        status: true,
        booking
    });

};

// ==========================================================
// ACCEPT BOOKING — driver taps the check mark
// ==========================================================
exports.acceptBooking = async (req, res) => {

    try {
        const { userId, driverId } = req.body;

        const booking = bookings[userId];

        if (!booking) {
            return res.status(404).json({ status: false, message: "Booking not found" });
        }

        if (booking.driverId !== driverId) {
            return res.status(403).json({ status: false, message: "This booking wasn't assigned to you" });
        }

        booking.status = "ACCEPTED";
        syncBookingToDb(booking);

        // Fetch this driver's real profile so the User App can show a real
        // name/phone/vehicle instead of the placeholder that used to be
        // hardcoded in the Flutter UI.
        const { data: driverProfile, error } = await supabase
            .from("driver_profiles")
            .select("driver_name, phone, ambulance_type, vehicle_number")
            .eq("id", driverId)
            .maybeSingle();

        if (error) {
            return res.status(500).json({ status: false, message: error.message });
        }

        const driverInfo = {
            driverId,
            name: driverProfile?.driver_name || "Driver",
            phone: driverProfile?.phone || null,
            ambulanceType: driverProfile?.ambulance_type || booking.ambulanceType,
            vehicleNumber: driverProfile?.vehicle_number || null
        };

        // Drivers.json — fill in name/number now that we've looked the
        // profile up, so the file has more than just id/location/online.
        driverStore.setProfile(driverId, driverInfo.name, driverInfo.phone, driverInfo.ambulanceType);

        const io = socket.getIO();
        const userSocket = socketService.getUserSocket(userId);

        const payload = { booking, driver: driverInfo };

        if (userSocket) {
            io.to(userSocket).emit("booking-accepted", payload);
            console.log(`📨 booking-accepted sent to user ${userId} (socket ${userSocket})`);
        } else {
            console.log(`⚠️  User ${userId} has no live socket — they won't get a realtime push for this accept. Check the User app emits "user-online" with this same id.`);
        }

        res.json({ status: true, ...payload });

    } catch (err) {
        res.status(500).json({ status: false, message: err.message });
    }

};

// ==========================================================
// REJECT BOOKING — driver taps the cross mark
// ==========================================================
exports.rejectBooking = (req, res) => {

    try {
        const { userId, driverId } = req.body;

        const booking = bookings[userId];

        if (!booking) {
            return res.status(404).json({ status: false, message: "Booking not found" });
        }

        if (booking.driverId !== driverId) {
            return res.status(403).json({ status: false, message: "This booking wasn't assigned to you" });
        }

        booking.status = "REJECTED";
        syncBookingToDb(booking);
        userStore.clearBooking(userId);
        delete bookings[userId];

        const io = socket.getIO();
        const userSocket = socketService.getUserSocket(userId);

        if (userSocket) {
            io.to(userSocket).emit("booking-rejected", { userId, driverId });
        }

        // NOTE: this does not currently re-search for another nearby
        // driver — the user just gets a "rejected" event and would need
        // to request again. Re-dispatch to the next-nearest driver is a
        // reasonable next step if you want automatic retry.
        res.json({ status: true, message: "Booking rejected" });

    } catch (err) {
        res.status(500).json({ status: false, message: err.message });
    }

};

// ==========================================================
// COMPLETE RIDE — driver marks the trip finished
// ==========================================================
exports.completeBooking = async (req, res) => {

    try {
        const { userId, driverId } = req.body;

        const booking = bookings[userId];

        if (!booking) {
            return res.status(404).json({ status: false, message: "Booking not found" });
        }

        if (booking.driverId !== driverId) {
            return res.status(403).json({ status: false, message: "This booking wasn't assigned to you" });
        }

        booking.status = "COMPLETED";
        syncBookingToDb(booking);
        userStore.clearBooking(userId);

        const io = socket.getIO();
        const userSocket = socketService.getUserSocket(userId);

        if (userSocket) {
            io.to(userSocket).emit("ride-completed", { userId, driverId, booking });
        }

        delete bookings[userId];

        res.json({ status: true, message: "Ride completed" });

    } catch (err) {
        res.status(500).json({ status: false, message: err.message });
    }

};

// ==========================================================
// CANCEL RIDE — either side cancels before/after acceptance
// ==========================================================
exports.cancelBooking = async (req, res) => {

    try {
        const { userId, cancelledBy } = req.body; // cancelledBy: "user" | "driver"

        const booking = bookings[userId];

        if (!booking) {
            return res.status(404).json({ status: false, message: "Booking not found" });
        }

        booking.status = "CANCELLED";
        syncBookingToDb(booking);
        userStore.clearBooking(userId);

        const io = socket.getIO();

        const userSocket = socketService.getUserSocket(userId);
        const driverSocket = socketService.getDriverSocket(booking.driverId);

        if (cancelledBy === "driver" && userSocket) {
            io.to(userSocket).emit("ride-cancelled", { userId, driverId: booking.driverId });
        }
        if (cancelledBy === "user" && driverSocket) {
            io.to(driverSocket).emit("ride-cancelled", { userId, driverId: booking.driverId });
        }

        delete bookings[userId];

        res.json({ status: true, message: "Ride cancelled" });

    } catch (err) {
        res.status(500).json({ status: false, message: err.message });
    }

};

// ==========================================================
// ACTIVE BOOKING FOR A DRIVER — used by DriverNavigationPage to
// reload the current accepted ride (e.g. after an app restart).
// ==========================================================
exports.getActiveBookingForDriver = (req, res) => {

    const { driverId } = req.params;

    const active = findActiveBookingByDriverId(driverId);

    if (!active) {
        return res.json({ status: false, message: "No active booking" });
    }

    res.json({ status: true, booking: active });

};

// ==========================================================
// Internal helper (used by socket.js to route live driver-location
// updates to the right rider during an active ride)
// ==========================================================
function findActiveBookingByDriverId(driverId) {
    return Object.values(bookings).find(
        (b) => b.driverId === driverId && b.status === "ACCEPTED"
    );
}

exports.findActiveBookingByDriverId = findActiveBookingByDriverId;
