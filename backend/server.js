
require("dotenv").config();

const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 5000;


app.use(cors({
  origin: [
    "http://localhost:5173",
    "https://skylume-weather-dashboard-1.onrender.com"
  ]
}));


app.use(express.json());

// Test the backend
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    message: "Weather Dashboard backend is running!"
  });
});

// Get real weather data from Open-Meteo
app.get("/api/weather", async (req, res) => {
  try {
    const city = req.query.city?.trim();

    if (!city) {
      return res.status(400).json({
        error: "Please enter a city name."
      });
    }

    // Find city coordinates
    const geoUrl = new URL(
      "https://geocoding-api.open-meteo.com/v1/search"
    );

    geoUrl.searchParams.set("name", city);
    geoUrl.searchParams.set("count", "1");
    geoUrl.searchParams.set("language", "en");
    geoUrl.searchParams.set("format", "json");

    const geoResponse = await fetch(geoUrl);
    if (!geoResponse.ok) throw new Error("City lookup failed");

    const geoData = await geoResponse.json();

    if (!geoData.results?.length) {
      return res.status(404).json({
        error: "City not found. Please try another city."
      });
    }

    const location = geoData.results[0];

    // Request current conditions and forecasts
    const weatherUrl = new URL(
      "https://api.open-meteo.com/v1/forecast"
    );

    weatherUrl.searchParams.set("latitude", location.latitude);
    weatherUrl.searchParams.set("longitude", location.longitude);
    weatherUrl.searchParams.set("timezone", "auto");
    weatherUrl.searchParams.set("forecast_days", "7");

    weatherUrl.searchParams.set(
      "current",
      "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m,surface_pressure"
    );

    weatherUrl.searchParams.set(
      "hourly",
      "temperature_2m,precipitation_probability,weather_code"
    );

    weatherUrl.searchParams.set(
      "daily",
      "weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max"
    );

    const weatherResponse = await fetch(weatherUrl);
    if (!weatherResponse.ok) throw new Error("Weather lookup failed");

    const weather = await weatherResponse.json();

    res.json({
      location: {
        name: location.name,
        country: location.country,
        latitude: location.latitude,
        longitude: location.longitude,
        timezone: weather.timezone
      },
      current: weather.current,
      currentUnits: weather.current_units,
      hourly: weather.hourly,
      daily: weather.daily
    });
  } catch (error) {
    console.error("Weather API error:", error.message);

    res.status(502).json({
      error: "Unable to fetch weather. Check your internet connection and try again."
    });
  }
});

app.listen(PORT, () => {
  console.log(
    `Weather Dashboard backend running at http://localhost:${PORT}`
  );
});
