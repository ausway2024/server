const store = require("./jsonFileStore");

// ==========================================================
// Drivers.json
// ==========================================================
// One row per driver, keyed by their Supabase auth UUID:
//
// {
//   "<uuid>": {
//     uuid, name, number,
//     location: { latitude, longitude, updatedAt },
//     ambulanceType,
//     online,
//     updatedAt
//   }
// }
// ==========================================================

const FILE = "Drivers.json";

// Called every ~2s from DriverTrackingService (home page) AND from
// DriverNavigationPage's live-ping-while-on-a-ride timer, so this file
// always has the driver's latest position, whether idle or on a trip.
function updateLocation(uuid, latitude, longitude, ambulanceType, online) {
    return store.upsertRecord(FILE, uuid, (rec) => ({
        uuid,
        name: rec.name ?? null,
        number: rec.number ?? null,
        location: { latitude, longitude, updatedAt: new Date().toISOString() },
        ambulanceType: ambulanceType ?? rec.ambulanceType ?? null,
        online: online !== undefined ? online : rec.online ?? false,
        updatedAt: new Date().toISOString()
    }));
}

function setOnlineState(uuid, online) {
    return store.upsertRecord(FILE, uuid, (rec) => ({
        ...rec,
        uuid,
        online,
        updatedAt: new Date().toISOString()
    }));
}

function setProfile(uuid, name, number, ambulanceType) {
    return store.upsertRecord(FILE, uuid, (rec) => ({
        ...rec,
        uuid,
        name: name ?? rec.name ?? null,
        number: number ?? rec.number ?? null,
        ambulanceType: ambulanceType ?? rec.ambulanceType ?? null,
        updatedAt: new Date().toISOString()
    }));
}

function getDriver(uuid) {
    return store.getRecord(FILE, uuid);
}

function getAllDrivers() {
    return store.getAllRecords(FILE);
}

module.exports = {
    updateLocation,
    setOnlineState,
    setProfile,
    getDriver,
    getAllDrivers
};
