// =============================
// User Live Locations
// =============================

const users = {};

// =============================
// Driver Live Locations
// =============================

const drivers = {};

// =============================
// Save User Location
// =============================

function updateUserLocation(id, latitude, longitude) {

    users[id] = {

        latitude,

        longitude,

        updatedAt: new Date()

    };

}

// =============================
// Save Driver Location
// =============================

function updateDriverLocation(

    id,

    latitude,

    longitude,

    ambulanceType,

    online

) {

    drivers[id] = {

        latitude,

        longitude,

        ambulanceType,

        online,

        updatedAt: new Date()

    };

}

// =============================
// Get User
// =============================

function getUser(id) {

    return users[id];

}

// =============================
// Get Driver
// =============================

function getDriver(id) {

    return drivers[id];

}

// =============================
// Get All Drivers
// =============================

function getAllDrivers() {

    return drivers;

}

// =============================
// Get All Users
// =============================

function getAllUsers() {

    return users;

}

module.exports = {

    updateUserLocation,

    updateDriverLocation,

    getUser,

    getDriver,

    getAllDrivers,

    getAllUsers

};