const socketService = require("../services/socketService");
const tracking = require("../services/trackingService");

let io;

function initialize(server) {

    const { Server } = require("socket.io");

    io = new Server(server, {

        cors: {

            origin: "*",

            methods: ["GET", "POST"]

        }

    });

    io.on("connection", (socket) => {

        console.log("Socket Connected :", socket.id);

        // ==========================================================
        // Driver Online — driver app calls this right after connect
        // (and again after every reconnect). Store the driverId on the
        // socket itself so "disconnect" below knows who to schedule for
        // removal without needing a separate lookup table.
        // ==========================================================
        socket.on("driver-online", (driverId) => {

            socket.driverId = driverId;
            socketService.registerDriver(driverId, socket.id);

        });

        // Driver Offline — driver app calls this the moment the user
        // taps the "Go Offline" toggle. This is immediate (no 45s grace
        // period), because it's a deliberate action, not a dropped
        // connection.
        socket.on("driver-offline", (driverId) => {

            socketService.removeDriver(driverId);

        });

        // ==========================================================
        // User Online / Offline — same idea as above, for the rider app.
        // ==========================================================
        socket.on("user-online", (userId) => {

            socket.userId = userId;
            socketService.registerUser(userId, socket.id);

        });

        socket.on("user-offline", (userId) => {

            socketService.removeUser(userId);

        });

        // ==========================================================
        // Live driver location during an active ride. The driver app
        // should emit this every few seconds while a ride is ACCEPTED
        // (in addition to / instead of the REST POST /api/location/driver
        // poll, which is fine for matching but too slow for a live moving
        // marker). We look up which rider currently has this driver
        // assigned and forward the ping straight to them.
        // ==========================================================
        socket.on("driver-location", (payload) => {
            // payload: { driverId, latitude, longitude }
            const { driverId, latitude, longitude } = payload || {};
            if (!driverId || latitude === undefined || longitude === undefined) return;

            tracking.updateDriverLocation(driverId, latitude, longitude, undefined, true);

            // Lazy require to avoid a circular require at module load time
            // (bookingController requires this file for io.getIO()).
            const bookingController = require("../controllers/bookingController");
            const activeBooking = bookingController.findActiveBookingByDriverId(driverId);

            if (activeBooking) {
                const userSocket = socketService.getUserSocket(activeBooking.userId);
                if (userSocket) {
                    io.to(userSocket).emit("driver-location-update", { driverId, latitude, longitude });
                }
            }
        });

        socket.on("disconnect", () => {

            socketService.scheduleRemoval(socket.id);

            console.log("Disconnected :", socket.id);

        });

    });

}

function getIO() {

    return io;

}

module.exports = {

    initialize,

    getIO

};
