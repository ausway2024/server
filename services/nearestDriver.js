const driverStore = require("./driverStore");

// Haversine Formula
function calculateDistance(lat1, lon1, lat2, lon2) {

    const R = 6371;

    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) *
        Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

function findNearestDriver(userLat, userLng, ambulanceType) {

    // Drivers.json is the source of truth here — every driver location
    // ping (idle or mid-ride) and every online/offline flip is written
    // straight into it, so reading it fresh on every booking request
    // guarantees this always matches against current data.
    const drivers = driverStore.getAllDrivers();

    let nearest = null;
    let minDistance = Number.MAX_VALUE;

    for (const driverId in drivers) {

        const driver = drivers[driverId];

        if (!driver.online) continue;
        if (!driver.location) continue;

        if (driver.ambulanceType !== ambulanceType) continue;

        const distance = calculateDistance(
            userLat,
            userLng,
            driver.location.latitude,
            driver.location.longitude
        );

        if (distance < minDistance) {

            minDistance = distance;

            nearest = {
                driverId,
                distance,
                latitude: driver.location.latitude,
                longitude: driver.location.longitude,
                ambulanceType: driver.ambulanceType,
                online: driver.online
            };
        }
    }

    return nearest;
}

module.exports = {
    findNearestDriver
};