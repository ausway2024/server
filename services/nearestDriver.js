const tracking = require("./trackingService");

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

    const drivers = tracking.getAllDrivers();

    let nearest = null;
    let minDistance = Number.MAX_VALUE;

    for (const driverId in drivers) {

        const driver = drivers[driverId];

        if (!driver.online) continue;

        if (driver.ambulanceType !== ambulanceType) continue;

        const distance = calculateDistance(
            userLat,
            userLng,
            driver.latitude,
            driver.longitude
        );

        if (distance < minDistance) {

            minDistance = distance;

            nearest = {
                driverId,
                distance,
                ...driver
            };
        }
    }

    return nearest;
}

module.exports = {
    findNearestDriver
};