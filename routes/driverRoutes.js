const express = require("express");

const router = express.Router();

const driverController = require("../controllers/driverController");

router.get("/health", driverController.healthCheck);

router.post("/status", driverController.setStatus);

router.post("/complete-profile", driverController.completeProfile);

router.get("/:id", driverController.getDriver);

module.exports = router;