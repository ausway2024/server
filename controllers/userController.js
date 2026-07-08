const supabase = require("../config/supabase");

// ==========================
// Server Health
// ==========================
exports.healthCheck = async (req, res) => {

    res.json({
        status: true,
        message: "User API Working"
    });

};

// ==========================
// Get User Details
// ==========================
exports.getUser = async (req, res) => {

    try {

        const id = req.params.id;

        const { data, error } = await supabase
            .from("user_profiles")
            .select("*")
            .eq("id", id)
            .single();

        if (error) {

            return res.status(404).json({
                status: false,
                message: error.message
            });

        }

        res.json({
            status: true,
            user: data
        });

    } catch (err) {

        res.status(500).json({
            status: false,
            message: err.message
        });

    }

};

// ==========================
// Update User Location
// ==========================
exports.updateLocation = async (req, res) => {

    try {

        const {

            id,
            latitude,
            longitude

        } = req.body;

        const { error } = await supabase

            .from("user_profiles")

            .update({

                latitude,

                longitude

            })

            .eq("id", id);

        if (error) {

            return res.status(400).json({

                status: false,

                message: error.message

            });

        }

        res.json({

            status: true,

            message: "Location Updated"

        });

    }

    catch (err) {

        res.status(500).json({

            status: false,

            message: err.message

        });

    }

};