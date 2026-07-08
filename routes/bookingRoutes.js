const express = require("express");

const router = express.Router();

const bookingController = require("../controllers/bookingController");

router.post(
    "/request",
    bookingController.requestBooking
);

router.post(
    "/accept",
    bookingController.acceptBooking
);

router.post(
    "/reject",
    bookingController.rejectBooking
);

router.post(
    "/complete",
    bookingController.completeBooking
);

router.post(
    "/cancel",
    bookingController.cancelBooking
);

// IMPORTANT: this must come BEFORE "/:userId" below, or Express will
// treat "driver" as a userId and this route will never be reached.
router.get(
    "/driver/:driverId/active",
    bookingController.getActiveBookingForDriver
);

router.get(
    "/:userId",
    bookingController.getBooking
);

module.exports = router;
