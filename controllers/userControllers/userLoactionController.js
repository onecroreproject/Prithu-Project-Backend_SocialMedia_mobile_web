const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const Location = require("../../models/userModels/userLoactionSchema");
const axios = require("axios");
const dotenv = require("dotenv");

dotenv.config();

exports.saveUserLocation = async (req, res) => {
  try {
    const userId = req.Id || req.body.userId;
    const { latitude, longitude, permissionStatus } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, message: "User ID required" });
    }



    // 1️⃣ Handle permission denied
    if (permissionStatus === "denied") {
     
      return res.status(200).json({
        success: false,
        message: "User denied location permission.",
      });
    }

    // 2️⃣ Validate coordinates
    if (permissionStatus === "granted" && (!latitude || !longitude)) {
      return res.status(400).json({ success: false, message: "Latitude and Longitude are required" });
    }

    // 3️⃣ Fetch existing location (if any)
    const existingLocation = await Location.findOne({ userId });

    // 4️⃣ Skip update if same lat & lon
    if (
      existingLocation &&
      existingLocation.latitude === latitude &&
      existingLocation.longitude === longitude &&
      existingLocation.permissionStatus === permissionStatus
    ) {

      return res.status(200).json({
        success: true,
        message: "Location unchanged — no update needed",
        data: existingLocation,
      });
    }

    // 5️⃣ Reverse geocode only if coordinates exist
    let address = "Location not available";
    if (latitude && longitude) {
      try {
        const apiKey = process.env.OPENCAGE_API_KEY;
        const url = `https://api.opencagedata.com/geocode/v1/json?q=${latitude},${longitude}&key=${apiKey}`;
        const geoRes = await fetch(url);
        const data = await geoRes.json();
        address = data?.results?.[0]?.formatted || "Address not found";
      } catch (geoErr) {
        console.warn("⚠️ Reverse geocoding failed:", geoErr.message);
      }
    }

    // 6️⃣ Prepare location data
    const locationData = {
      userId,
      latitude,
      longitude,
      address,
      permissionStatus,
      updatedAt: new Date(),
    };

    // 7️⃣ Save or update the user's location
    const updatedLocation = await Location.findOneAndUpdate(
      { userId },
      locationData,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    console.log(`✅ Location updated for user ${userId}: ${address}`);

    return res.status(200).json({
      success: true,
      message: "Location saved successfully",
      data: updatedLocation,
    });
  } catch (err) {
    console.error("❌ saveUserLocation Error:", err);
    res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
};




exports.getUserLocation = async (req, res) => {
  try {
    const userId = req.Id || req.query.userId || req.body.userId;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required to fetch location",
      });
    }

    // Fetch the latest location entry
    const userLocation = await Location.findOne({ userId }).sort({ updatedAt: -1 });

    if (!userLocation) {
      return res.status(404).json({
        success: false,
        message: "No location found for this user",
      });
    }

    return res.status(200).json({
      success: true,
      message: "User location fetched successfully",
      data: userLocation,
    });
  } catch (err) {
    console.error("getUserLocation Error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching user location",
      error: err.message,
    });
  }
};











exports.getUpcomingEvents = async (req, res) => {
  try {
    const userId = req.Id;

    // 🧭 Find user's last known location
    const location = await Location.findOne({ userId }).sort({ createdAt: -1 });
    if (!location || !location.latitude || !location.longitude) {
      return res.status(404).json({
        success: false,
        message: "User location not found. Please allow location access.",
      });
    }

    const { latitude, longitude } = location;

    // 📆 Time range: now → 6 months ahead (in UTC)
    const startDate = new Date().toISOString().split(".")[0] + "Z";
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 6);
    const endDateISO = endDate.toISOString().split(".")[0] + "Z";

    // 🎟️ Ticketmaster API Key
    const apiKey = process.env.TICKETMASTER_API_KEY;
    if (!apiKey)
      return res.status(500).json({ error: "Ticketmaster API key missing." });

    // ✅ Correct Ticketmaster Discovery API call
    const response = await axios.get("https://app.ticketmaster.com/discovery/v2/events.json", {
      params: {
        apikey: apiKey,
        latlong: `${latitude},${longitude}`, // e.g. "12.9716,77.5946"
        radius: 200, // miles
        startDateTime: startDate,
        endDateTime: endDateISO,
        sort: "date,asc",
        size: 20,
      },
    });

    // 🧩 Handle if no events
    const events = response.data?._embedded?.events || [];
    if (!events.length) {
      return res.status(200).json({
        success: true,
        count: 0,
        message: "No upcoming events found near this location.",
        events: [],
      });
    }

    // 🧩 Format events cleanly
    const formatted = events.map((event) => ({
      id: event.id,
      name: event.name,
      url: event.url,
      image: event.images?.[0]?.url || "",
      date: event.dates?.start?.localDate || "TBA",
      time: event.dates?.start?.localTime || "",
      venue: event._embedded?.venues?.[0]?.name || "Unknown Venue",
      city: event._embedded?.venues?.[0]?.city?.name || "Unknown City",
      country: event._embedded?.venues?.[0]?.country?.name || "",
      category: event.classifications?.[0]?.segment?.name || "General",
    }));

    // ✅ Return structured response
    res.status(200).json({
      success: true,
      count: formatted.length,
      location: {
        latitude,
        longitude,
        address: location.address,
      },
      events: formatted,
    });
  } catch (error) {
    console.error("❌ Error fetching events:", error.response?.data || error.message);

    res.status(500).json({
      success: false,
      message: "Failed to fetch events",
      error: error.response?.data || error.message,
    });
  }
};

