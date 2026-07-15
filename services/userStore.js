const store = require("./jsonFileStore");

// ==========================================================
// Users.json
// ==========================================================
// One row per user, keyed by their Supabase auth UUID:
//
// {
//   "<uuid>": {
//     uuid, name, number,
//     location: { latitude, longitude, updatedAt },
//     ambulanceType,
//     pickupLocation:      { latitude, longitude, address },
//     destinationLocation: { latitude, longitude, address },
//     updatedAt
//   }
// }
//
// This file is the plain-JSON mirror of what's needed for matching /
// dispatch. Supabase (user_profiles / bookings tables) remains the
// durable system of record for anything beyond "current live state" —
// this file exists purely so the live state can be inspected/consumed
// directly on disk, per the requested Rapido-style flow.
// ==========================================================

const FILE = "Users.json";

// Called every ~2s by POST /api/location/user while the rider has the
// app open — keeps location (and, once known, name/number) current.
function updateLocation(uuid, latitude, longitude) {
    return store.upsertRecord(FILE, uuid, (rec) => ({
        uuid,
        name: rec.name ?? null,
        number: rec.number ?? null,
        location: { latitude, longitude, updatedAt: new Date().toISOString() },
        ambulanceType: rec.ambulanceType ?? null,
        pickupLocation: rec.pickupLocation ?? null,
        destinationLocation: rec.destinationLocation ?? null,
        updatedAt: new Date().toISOString()
    }));
}

// Called once a booking is requested (SetLocation.dart's Confirm button)
// — records which ambulance type was picked and both the red-pin pickup
// / green-pin destination points, exactly as set on that screen.
function setBookingDetails(uuid, {
    name,
    number,
    ambulanceType,
    pickupLatitude,
    pickupLongitude,
    pickupAddress,
    destLatitude,
    destLongitude,
    destAddress
}) {
    return store.upsertRecord(FILE, uuid, (rec) => ({
        uuid,
        name: name ?? rec.name ?? null,
        number: number ?? rec.number ?? null,
        location: rec.location ?? null,
        ambulanceType: ambulanceType ?? rec.ambulanceType ?? null,
        pickupLocation: {
            latitude: pickupLatitude,
            longitude: pickupLongitude,
            address: pickupAddress ?? null
        },
        destinationLocation:
            destLatitude !== undefined && destLatitude !== null
                ? {
                      latitude: destLatitude,
                      longitude: destLongitude,
                      address: destAddress ?? null
                  }
                : rec.destinationLocation ?? null,
        updatedAt: new Date().toISOString()
    }));
}

function setProfile(uuid, name, number) {
    return store.upsertRecord(FILE, uuid, (rec) => ({
        ...rec,
        uuid,
        name: name ?? rec.name ?? null,
        number: number ?? rec.number ?? null,
        updatedAt: new Date().toISOString()
    }));
}

// Once a ride completes/cancels, clear the pickup/destination/ambulance
// selection so the file reflects "no active request" for this rider —
// their profile + last known location stay.
function clearBooking(uuid) {
    return store.upsertRecord(FILE, uuid, (rec) => ({
        ...rec,
        uuid,
        ambulanceType: null,
        pickupLocation: null,
        destinationLocation: null,
        updatedAt: new Date().toISOString()
    }));
}

function getUser(uuid) {
    return store.getRecord(FILE, uuid);
}

function getAllUsers() {
    return store.getAllRecords(FILE);
}

module.exports = {
    updateLocation,
    setBookingDetails,
    setProfile,
    clearBooking,
    getUser,
    getAllUsers
};
