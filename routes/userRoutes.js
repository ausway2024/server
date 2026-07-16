const express = require("express");

const router = express.Router();

const userController = require("../controllers/userController");

// Health Check
router.get("/health", userController.healthCheck);

// Get User Profile
router.get("/:id", userController.getUser);

// Update User Location
router.post("/location", userController.updateLocation);

module.exports = router;