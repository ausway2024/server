const express = require("express");

const router = express.Router();

const locationController = require("../controllers/locationController");

router.post("/user", locationController.updateUser);

router.post("/driver", locationController.updateDriver);

router.get("/drivers", locationController.getDrivers);

router.get("/users", locationController.getUsers);

module.exports = router;