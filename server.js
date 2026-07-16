require("dotenv").config();

const express = require("express");
const cors = require("cors");
const http = require("http");

const socket = require("./sockets/socket");

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO
socket.initialize(server);

// ============================
// Middleware
// ============================

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================
// Routes
// ============================

const userRoutes = require("./routes/userRoutes");
const driverRoutes = require("./routes/driverRoutes");
const locationRoutes = require("./routes/locationRoutes");
const bookingRoutes = require("./routes/bookingRoutes");
const otpRoutes = require("./routes/otpRoutes");

app.use("/api/users", userRoutes);
app.use("/api/drivers", driverRoutes);
app.use("/api/location", locationRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/otp", otpRoutes);

// ============================
// Default Route
// ============================

app.get("/", (req, res) => {
    res.json({
        status: true,
        message: "AUSWAY SERVER RUNNING"
    });
});

// ============================
// Start Server
// ============================

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {

    console.log("--------------------------------");
    console.log("AUSWAY SERVER STARTED");
    console.log("PORT :", PORT);
    console.log("--------------------------------");

});