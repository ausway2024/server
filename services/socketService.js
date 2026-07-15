const supabase = require("../config/supabase");
const driverStore = require("./driverStore");

const connectedDrivers = new Map(); // driverId -> socketId
const connectedUsers = new Map();   // userId -> socketId

// ==========================================================
// GRACE PERIOD FOR DISCONNECTS
// ==========================================================
// A raw socket disconnect (screen off, app backgrounded, brief network
// drop) is not the same as someone actually closing the app or tapping
// "Go Offline". Instead of immediately treating a disconnected socket as
// "gone", we wait a short grace period — if they reconnect within it
// (their socket.io client auto-reconnects, this is automatic), we just
// cancel the pending removal and nothing else changes. Only if the grace
// period expires without a reconnect do we actually drop them.
//
// NOTE: this only applies to *unexpected* disconnects (network drop,
// backgrounding). An explicit "driver-offline" / "user-offline" event
// (the app deliberately telling us the toggle was flipped) is handled
// immediately below, with no grace period — the person made a decision,
// we should not wait 45s to reflect it.
const GRACE_PERIOD_MS = 45000; // 45 seconds

const pendingDriverRemovals = new Map(); // driverId -> Timeout
const pendingUserRemovals = new Map();   // userId -> Timeout

// ==========================================================
// Supabase sync helpers
// ==========================================================
// Best-effort — a Supabase hiccup should never crash the socket layer or
// block realtime delivery, so every call here is fire-and-forget with its
// own error handling.
async function syncDriverStatus(driverId, isOnline) {
    try {
        const { error } = await supabase
            .from("driver_profiles")
            .update({
                is_online: isOnline,
                last_seen: new Date().toISOString()
            })
            .eq("id", driverId);

        if (error) {
            console.log("⚠️  Supabase driver status sync failed:", error.message);
        }
    } catch (err) {
        console.log("⚠️  Supabase driver status sync threw:", err.message);
    }
}

function registerDriver(driverId, socketId) {
    const pending = pendingDriverRemovals.get(driverId);
    if (pending) {
        clearTimeout(pending);
        pendingDriverRemovals.delete(driverId);
        console.log("🟡 Driver reconnected within grace period:", driverId);
    }
    connectedDrivers.set(driverId, socketId);
    console.log("🟢 DRIVER ONLINE:", driverId, "| total online:", connectedDrivers.size);
    syncDriverStatus(driverId, true);
    driverStore.setOnlineState(driverId, true);
}

function registerUser(userId, socketId) {
    const pending = pendingUserRemovals.get(userId);
    if (pending) {
        clearTimeout(pending);
        pendingUserRemovals.delete(userId);
        console.log("🟡 User reconnected within grace period:", userId);
    }
    connectedUsers.set(userId, socketId);
    console.log("🟢 USER ONLINE:", userId, "| total online:", connectedUsers.size);
}

// Explicit, immediate offline — called when the driver app itself sends
// a "driver-offline" event (user tapped the toggle), as opposed to a raw
// socket drop. No grace period: this is a deliberate action.
function removeDriver(driverId) {
    connectedDrivers.delete(driverId);

    const pending = pendingDriverRemovals.get(driverId);
    if (pending) {
        clearTimeout(pending);
        pendingDriverRemovals.delete(driverId);
    }

    console.log("🔴 DRIVER OFFLINE:", driverId, "| total online:", connectedDrivers.size);
    syncDriverStatus(driverId, false);
    driverStore.setOnlineState(driverId, false);
}

function removeUser(userId) {
    connectedUsers.delete(userId);

    const pending = pendingUserRemovals.get(userId);
    if (pending) {
        clearTimeout(pending);
        pendingUserRemovals.delete(userId);
    }

    console.log("🔴 USER OFFLINE:", userId, "| total online:", connectedUsers.size);
}

// Called on socket "disconnect". Schedules removal after the grace
// period instead of removing immediately.
function scheduleRemoval(socketId) {

    for (const [driverId, id] of connectedDrivers.entries()) {
        if (id === socketId) {
            const timeout = setTimeout(() => {
                // Only remove if this driver hasn't reconnected with a
                // newer socket in the meantime.
                if (connectedDrivers.get(driverId) === socketId) {
                    connectedDrivers.delete(driverId);
                    console.log("🔴 DRIVER OFFLINE (grace period expired):", driverId);
                    syncDriverStatus(driverId, false);
                    driverStore.setOnlineState(driverId, false);
                }
                pendingDriverRemovals.delete(driverId);
            }, GRACE_PERIOD_MS);
            pendingDriverRemovals.set(driverId, timeout);
            return;
        }
    }

    for (const [userId, id] of connectedUsers.entries()) {
        if (id === socketId) {
            const timeout = setTimeout(() => {
                if (connectedUsers.get(userId) === socketId) {
                    connectedUsers.delete(userId);
                    console.log("🔴 USER OFFLINE (grace period expired):", userId);
                }
                pendingUserRemovals.delete(userId);
            }, GRACE_PERIOD_MS);
            pendingUserRemovals.set(userId, timeout);
            return;
        }
    }

}

function getDriverSocket(driverId) {
    return connectedDrivers.get(driverId);
}

function getUserSocket(userId) {
    return connectedUsers.get(userId);
}

function isDriverOnline(driverId) {
    return connectedDrivers.has(driverId);
}

module.exports = {

    registerDriver,

    registerUser,

    removeDriver,

    removeUser,

    scheduleRemoval,

    getDriverSocket,

    getUserSocket,

    isDriverOnline,

    syncDriverStatus,

    connectedDrivers,

    connectedUsers

};
