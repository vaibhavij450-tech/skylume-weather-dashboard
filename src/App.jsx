
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

const API_URL = "http://localhost:5000/api/weather?city=";
const ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive";

function getCondition(code) {
  const n = Number(code);
  if (n === 0) return { label: "Clear sky", icon: "☀️", theme: "sunny" };
  if (n === 1) return { label: "Mostly clear", icon: "🌤️", theme: "clear" };
  if (n === 2) return { label: "Partly cloudy", icon: "⛅", theme: "clear" };
  if (n === 3) return { label: "Overcast", icon: "☁️", theme: "cloudy" };
  if (n === 45 || n === 48) return { label: "Foggy", icon: "🌫️", theme: "cloudy" };
  if (n >= 51 && n <= 57) return { label: "Drizzle", icon: "🌦️", theme: "rain" };
  if (n >= 61 && n <= 67) return { label: "Rain", icon: "🌧️", theme: "rain" };
  if (n >= 71 && n <= 77) return { label: "Snow", icon: "❄️", theme: "cloudy" };
  if (n >= 80 && n <= 82) return { label: "Rain showers", icon: "🌧️", theme: "rain" };
  if (n === 85 || n === 86) return { label: "Snow showers", icon: "🌨️", theme: "cloudy" };
  if (n >= 95) return { label: "Thunderstorm", icon: "⛈️", theme: "thunderstorm" };
  return { label: "Cloudy", icon: "☁️", theme: "cloudy" };
}

function formatHour(time) {
  if (!time) return "--";
  const match = String(time).match(/T(\d{2}):(\d{2})/);
  if (match) {
    const h = Number(match[1]);
    return `${h % 12 || 12}${Number(match[2]) ? `:${match[2]}` : ""}${h >= 12 ? "PM" : "AM"}`;
  }
  return time;
}

function formatDay(time, index) {
  if (!time) return "--";
  if (index === 0) return "Today";
  if (index === 1) return "Tomorrow";
  return new Date(`${time}T12:00:00`).toLocaleDateString("en", {
    weekday: "long",
  });
}

function getWeatherDescription(code, isNight) {
  const c = getCondition(code);
  if (isNight && c.theme !== "thunderstorm") return "A quiet night under the sky.";
  const descriptions = {
    sunny: "Sunshine makes everything feel a little brighter.",
    clear: "A beautiful sky with just a few clouds.",
    cloudy: "Clouds are taking center stage today.",
    rain: "A little rain changes the rhythm of the day.",
    thunderstorm: "Stormy skies are moving through. Stay weather-aware.",
  };
  return descriptions[c.theme] || "Here's your local forecast.";
}

function getWeatherAlerts(weather) {
  if (!weather?.current) return [];
  const c = weather.current;
  const h = weather.hourly || {};
  const d = weather.daily || {};
  const cityName = weather.location?.name || weather.location?.city || "your location";
  const code = Number(c.weather_code);
  const temperature = Number(c.temperature_2m);
  const wind = Number(c.wind_speed_10m);

  const nextHours = (h.time || [])
    .map((time, i) => ({
      time,
      code: Number(h.weather_code?.[i]),
      rain: Number(h.precipitation_probability?.[i] ?? 0),
    }))
    .filter((x) => !c.time || x.time >= c.time)
    .slice(0, 6);

  const rainChance = Math.max(
    0,
    Number(d.precipitation_probability_max?.[0] ?? 0),
    ...nextHours.map((x) => x.rain)
  );

  const alerts = [];

  if (code >= 95 || nextHours.some((x) => x.code >= 95)) {
    alerts.push({
      id: "storm",
      severity: "severe",
      icon: "⛈️",
      title: "Thunderstorm advisory",
      message: `Thunderstorm conditions are reported or forecast for ${cityName}.`,
    });
  }

  if (rainChance >= 70) {
    alerts.push({
      id: "rain",
      severity: "warning",
      icon: "🌧️",
      title: "High chance of rain",
      message: `Rain probability may reach ${rainChance}%. Consider carrying an umbrella.`,
    });
  }

  if (Number.isFinite(temperature) && temperature >= 40) {
    alerts.push({
      id: "heat",
      severity: "severe",
      icon: "🌡️",
      title: "Extreme heat advisory",
      message: `The current temperature is ${Math.round(temperature)}°C.`,
    });
  } else if (Number.isFinite(temperature) && temperature <= 0) {
    alerts.push({
      id: "freeze",
      severity: "warning",
      icon: "❄️",
      title: "Freezing conditions",
      message: `The current temperature is ${Math.round(temperature)}°C. Dress warmly.`,
    });
  }

  if (Number.isFinite(wind) && wind >= 50) {
    alerts.push({
      id: "wind",
      severity: "warning",
      icon: "💨",
      title: "Strong winds",
      message: `Wind speed is around ${Math.round(wind)} km/h.`,
    });
  }

  return alerts;
}

function MetricCard({ icon, label, value, detail }) {
  return (
    <article className="metric-card">
      <div className="metric-heading">
        <span className="metric-icon">{icon}</span>
        <span>{label}</span>
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-detail">{detail}</div>
    </article>
  );
}

function HistoryChart({ title, unit, values, color, fill = false }) {
  const valid = values
    .map((value, index) => ({ value: Number(value), index }))
    .filter((item) => Number.isFinite(item.value));

  if (!valid.length) {
    return (
      <section className="history-chart">
        <h3>{title}</h3>
        <p className="history-chart-empty">No data available for this chart.</p>
      </section>
    );
  }

  const width = 720;
  const height = 210;
  const padX = 28;
  const padY = 22;
  const minValue = Math.min(0, ...valid.map((item) => item.value));
  const maxValue = Math.max(...valid.map((item) => item.value));
  const range = Math.max(1, maxValue - minValue);

  const x = (index) =>
    padX + (index / Math.max(1, values.length - 1)) * (width - padX * 2);

  const y = (value) =>
    height - padY - ((value - minValue) / range) * (height - padY * 2);

  const points = valid.map((item) => `${x(item.index)},${y(item.value)}`).join(" ");
  const areaPoints = `${x(valid[0].index)},${height - padY} ${points} ${x(valid[valid.length - 1].index)},${height - padY}`;
  const numericValues = valid.map((item) => item.value);

  return (
    <section className="history-chart">
      <div className="history-chart-heading">
        <h3>{title}</h3>
        <span>{unit}</span>
      </div>

      <div className="history-chart-canvas">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title} chart`}>
          {[0, 1, 2, 3].map((step) => {
            const gy = padY + step * ((height - padY * 2) / 3);
            return (
              <line
                key={step}
                x1={padX}
                y1={gy}
                x2={width - padX}
                y2={gy}
                className="history-chart-gridline"
              />
            );
          })}

          {fill && <polygon points={areaPoints} fill={color} opacity="0.13" />}

          <polyline
            points={points}
            fill="none"
            stroke={color}
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {valid.map((item) => (
            <circle key={item.index} cx={x(item.index)} cy={y(item.value)} r="3.5" fill={color}>
              <title>{formatHourIndex(item.index)}: {item.value}{unit}</title>
            </circle>
          ))}
        </svg>
      </div>

      <div className="history-chart-labels">
        <span>12 AM</span>
        <span>6 AM</span>
        <span>12 PM</span>
        <span>6 PM</span>
        <span>11 PM</span>
      </div>

      <p className="history-chart-range">
        Min: {Math.min(...numericValues).toFixed(1)}{unit} · Max: {Math.max(...numericValues).toFixed(1)}{unit}
      </p>
    </section>
  );
}

function formatHourIndex(index) {
  return formatHour(`2026-01-01T${String(index).padStart(2, "0")}:00`);
}

export default function App() {
  const [city, setCity] = useState("Dehradun");
  const [searchText, setSearchText] = useState("");
  const [weather, setWeather] = useState(null);
  const [activeTab, setActiveTab] = useState("today");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [browserAlertsEnabled, setBrowserAlertsEnabled] = useState(false);
  const [showTestAlert, setShowTestAlert] = useState(false);
  const lastNotifiedAlert = useRef("");

  const [savedCities, setSavedCities] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("skylume-saved-cities") || '["Dehradun"]');
      return Array.isArray(stored) && stored.length ? stored : ["Dehradun"];
    } catch {
      return ["Dehradun"];
    }
  });

  const [historyDate, setHistoryDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [history, setHistory] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  const loadWeather = useCallback(async (cityName) => {
    const requestedCity = String(cityName || "").trim();
    if (!requestedCity) return;

    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_URL}${encodeURIComponent(requestedCity)}`);
      if (!response.ok) throw new Error("City not found. Check the spelling and try again.");

      const data = await response.json();
      if (!data.current || !data.daily) {
        throw new Error("The weather service returned incomplete data.");
      }

      setWeather(data);
      setCity(requestedCity);
      setSearchText("");

      setSavedCities((previous) => {
        const updated = [
          requestedCity,
          ...previous.filter((x) => x.toLowerCase() !== requestedCity.toLowerCase()),
        ].slice(0, 6);
        localStorage.setItem("skylume-saved-cities", JSON.stringify(updated));
        return updated;
      });
    } catch (err) {
      setError(err.message || "Unable to load weather. Check your backend.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWeather("Dehradun");
  }, [loadWeather]);

  useEffect(() => {
    const id = window.setInterval(() => loadWeather(city), 5 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [city, loadWeather]);

  const current = weather?.current;
  const hourly = weather?.hourly;
  const daily = weather?.daily;
  const location = weather?.location || {};
  const weatherCode = Number(current?.weather_code ?? 3);
  const condition = getCondition(weatherCode);

  const hour = current?.time
    ? Number(String(current.time).match(/T(\d{2}):/)?.[1] ?? new Date().getHours())
    : new Date().getHours();

  const isNight = current?.is_day != null
    ? Number(current.is_day) === 0
    : hour >= 19 || hour < 6;

  const theme = condition.theme === "thunderstorm"
    ? "thunderstorm"
    : isNight ? "night" : condition.theme;

  const weatherAlerts = useMemo(() => getWeatherAlerts(weather), [weather]);

  const displayedAlerts = showTestAlert
    ? [{
        id: "test-alert",
        severity: "severe",
        icon: "⛈️",
        title: "TEST ALERT — Thunderstorm advisory",
        message: "This is a simulated alert. It is not a real weather warning.",
      }, ...weatherAlerts]
    : weatherAlerts;

  async function enableBrowserAlerts() {
    if (!("Notification" in window)) {
      window.alert("Browser notifications are not supported.");
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission === "granted") setBrowserAlertsEnabled(true);
      else window.alert("Allow notifications in your browser's site settings.");
    } catch {
      window.alert("Could not enable browser notifications.");
    }
  }

  useEffect(() => {
    if (!browserAlertsEnabled || !weatherAlerts.length || !("Notification" in window)) return;

    const signature = `${city}:${weatherAlerts.map((x) => x.id).sort().join(",")}`;
    if (lastNotifiedAlert.current === signature) return;
    lastNotifiedAlert.current = signature;

    const alert = weatherAlerts.find((x) => x.severity === "severe") || weatherAlerts[0];
    new Notification(`Skylume: ${alert.title}`, { body: alert.message });
  }, [browserAlertsEnabled, city, weatherAlerts]);

  const hourlyForecast = useMemo(() => {
    if (!hourly?.time) return [];
    let startIndex = current?.time ? hourly.time.findIndex((time) => time >= current.time) : 0;
    if (startIndex < 0) startIndex = 0;

    return hourly.time.slice(startIndex, startIndex + 8).map((time, offset) => {
      const i = startIndex + offset;
      return {
        time,
        temperature: hourly.temperature_2m?.[i],
        rainChance: hourly.precipitation_probability?.[i],
        condition: getCondition(hourly.weather_code?.[i] ?? weatherCode),
      };
    });
  }, [hourly, current?.time, weatherCode]);

  const liveChartData = useMemo(() => {
    if (!hourly?.time) return { temperature: [], humidity: [], rainfall: [] };

    let startIndex = current?.time
      ? hourly.time.findIndex((time) => time >= current.time)
      : 0;

    if (startIndex < 0) startIndex = 0;

    const endIndex = Math.min(startIndex + 24, hourly.time.length);

    return {
      temperature: hourly.temperature_2m?.slice(startIndex, endIndex) || [],
      humidity: hourly.relative_humidity_2m?.slice(startIndex, endIndex) || [],
      rainfall: hourly.precipitation?.slice(startIndex, endIndex) || [],
    };
  }, [hourly, current?.time]);

  const currentTimeLabel = current?.time
    ? `${new Date(`${String(current.time).slice(0, 10)}T12:00:00`).toLocaleDateString("en", {
        weekday: "long",
        month: "short",
        day: "numeric",
      })} · ${formatHour(current.time)}`
    : "Local weather";

  const high = daily?.temperature_2m_max?.[0];
  const low = daily?.temperature_2m_min?.[0];

  function handleSearch(event) {
    event.preventDefault();
    if (searchText.trim()) loadWeather(searchText);
  }

  async function loadHistory(event) {
    event?.preventDefault();
    setHistoryLoading(true);
    setHistoryError("");
    setHistory(null);

    try {
      const geoResponse = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`
      );
      if (!geoResponse.ok) throw new Error("Could not find this location.");

      const geo = await geoResponse.json();
      const place = geo.results?.[0];
      if (!place) throw new Error(`No coordinates found for ${city}. Try another city.`);

      const params = new URLSearchParams({
        latitude: place.latitude,
        longitude: place.longitude,
        start_date: historyDate,
        end_date: historyDate,
        hourly: "temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m",
        daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max",
        timezone: "auto",
      });

      const response = await fetch(`${ARCHIVE_URL}?${params.toString()}`);
      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error(data.reason || "Historical data is temporarily unavailable.");
      }

      if (!data.hourly?.time?.length) {
        throw new Error("No hourly historical data was returned for this date.");
      }

      setHistory({ ...data, place });
    } catch (err) {
      setHistoryError(`${err.message} Some recent dates may not yet be available in the archive.`);
    } finally {
      setHistoryLoading(false);
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const historyDaily = history?.daily;
  const historyHourly = history?.hourly;
  const historyTemps = historyHourly?.temperature_2m || [];
  const validTemps = historyTemps.filter((x) => x != null);

  const meanTemp = validTemps.length
    ? Math.round(validTemps.reduce((sum, x) => sum + x, 0) / validTemps.length)
    : null;

  const maxTemp = validTemps.length ? Math.round(Math.max(...validTemps)) : null;
  const minTemp = validTemps.length ? Math.round(Math.min(...validTemps)) : null;
  const totalRain = historyDaily?.precipitation_sum?.[0];
  const maxWind = historyDaily?.wind_speed_10m_max?.[0];

  return (
    <main className={`weather-app theme-${theme}`}>
      <style>{`
        .alerts-section,.history-section {
          margin:22px 0;padding:22px;border:1px solid rgba(255,255,255,.14);
          border-radius:22px;background:rgba(255,255,255,.055);
          backdrop-filter:blur(18px);position:relative;z-index:1;
        }
        .alerts-heading,.history-heading {
          display:flex;justify-content:space-between;align-items:center;
          gap:16px;margin-bottom:18px;flex-wrap:wrap;
        }
        .alerts-heading h2,.history-heading h2 {
          display:flex;align-items:center;gap:9px;margin:5px 0 0;font-size:1.25rem;
        }
        .alerts-count {
          display:inline-flex;align-items:center;justify-content:center;
          min-width:25px;height:25px;padding:0 7px;border-radius:20px;
          background:rgba(255,255,255,.12);font-size:.8rem;
        }
        .alerts-actions {display:flex;gap:10px;flex-wrap:wrap}
        .notification-button,.history-submit {
          padding:10px 14px;border:1px solid rgba(255,255,255,.2);
          border-radius:12px;background:rgba(255,255,255,.09);
          color:inherit;font:inherit;font-size:.82rem;cursor:pointer;
        }
        .notification-button:disabled {opacity:.7;cursor:default}
        .alerts-list {display:grid;gap:12px}
        .weather-alert,.alert-clear {
          display:flex;align-items:flex-start;gap:13px;padding:15px;
          border:1px solid rgba(255,255,255,.12);border-radius:15px;
          background:rgba(255,255,255,.045);
        }
        .alert-severe {border-color:rgba(255,110,110,.45);background:rgba(220,60,60,.1)}
        .alert-warning {border-color:rgba(255,190,90,.35);background:rgba(255,170,50,.075)}
        .weather-alert-icon,.alert-clear-icon {
          display:flex;flex-shrink:0;align-items:center;justify-content:center;
          width:40px;height:40px;border-radius:12px;background:rgba(255,255,255,.09);font-size:1.3rem;
        }
        .weather-alert-copy {flex:1;min-width:0}
        .weather-alert-title {display:flex;flex-wrap:wrap;align-items:center;gap:9px}
        .alert-severity {padding:4px 8px;border-radius:20px;background:rgba(255,255,255,.1);font-size:.7rem}
        .weather-alert-copy p,.alert-clear p {margin:7px 0 0;font-size:.84rem;line-height:1.6;opacity:.8}
        .alert-clear {align-items:center}
        .alerts-disclaimer {margin:13px 0 0;font-size:.72rem;opacity:.65}
        .history-form {display:flex;flex-wrap:wrap;gap:12px;align-items:end;margin:18px 0}
        .history-field {display:flex;flex-direction:column;gap:7px;min-width:180px}
        .history-field label {font-size:.82rem;opacity:.85}
        .history-field input {
          padding:12px;border:1px solid rgba(255,255,255,.25);border-radius:12px;
          color:inherit;background:rgba(255,255,255,.1);font:inherit;
        }
        .history-submit {font-weight:600;padding:12px 18px}
        .history-submit:disabled {opacity:.6;cursor:wait}
        .history-message {padding:14px;border-radius:12px;background:rgba(255,255,255,.07);line-height:1.6}
        .history-grid {display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:18px 0}
        .history-stat {padding:16px;border:1px solid rgba(255,255,255,.13);border-radius:15px;background:rgba(255,255,255,.06)}
        .history-stat span {display:block;font-size:.8rem;opacity:.75}
        .history-stat strong {display:block;font-size:1.5rem;margin-top:8px}
        .history-hourly {overflow-x:auto;border:1px solid rgba(255,255,255,.12);border-radius:15px}
        .history-table {width:100%;border-collapse:collapse;min-width:650px;font-size:.84rem}
        .history-table th,.history-table td {padding:12px;text-align:left;border-bottom:1px solid rgba(255,255,255,.1)}
        .history-table th {background:rgba(255,255,255,.08)}
        .history-table tr:last-child td {border-bottom:0}
        .history-table td:first-child {white-space:nowrap}
        .history-date-label {font-size:.85rem;opacity:.8}
        .history-charts {display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin:18px 0}
        .history-chart {min-width:0;padding:18px;border:1px solid rgba(255,255,255,.13);border-radius:17px;background:rgba(255,255,255,.045)}
        .history-chart-heading {display:flex;justify-content:space-between;align-items:center;gap:12px}
        .history-chart-heading h3 {margin:0;font-size:1rem}
        .history-chart-heading span {font-size:.8rem;opacity:.7}
        .history-chart-canvas {width:100%;margin-top:14px}
        .history-chart-canvas svg {display:block;width:100%;height:auto;overflow:visible}
        .history-chart-gridline {stroke:rgba(255,255,255,.13);stroke-width:1;stroke-dasharray:4 5}
        .history-chart-labels {display:flex;justify-content:space-between;gap:6px;font-size:.68rem;opacity:.65}
        .history-chart-range {margin:12px 0 0;font-size:.78rem;opacity:.8}
        .history-chart-empty {font-size:.85rem;opacity:.7}
        .live-charts-section {margin:22px 0}
        .live-charts-heading {margin-bottom:14px}
        .live-charts-heading h2 {margin:5px 0;font-size:1.25rem}
        .live-charts-note {font-size:.8rem;opacity:.7;margin-top:8px}
        @media(max-width:700px) {
          .history-grid {grid-template-columns:repeat(2,minmax(0,1fr))}
          .history-section,.alerts-section {padding:16px}
          .alerts-heading {align-items:flex-start;flex-direction:column}
          .alerts-actions {width:100%}
          .notification-button {flex:1}
          .history-charts {grid-template-columns:1fr}
        }
      `}</style>

      <div className="sky-orb sky-orb-one" />
      <div className="sky-orb sky-orb-two" />
      <div className="sky-haze" />

      <div className="page-shell">
        <header className="topbar">
          <button className="brand" onClick={() => loadWeather(city)} aria-label="Refresh weather">
            <span className="brand-symbol">✳</span><span>Skylume</span>
          </button>

          <form className="search-form" onSubmit={handleSearch}>
            <span className="search-icon">⌕</span>
            <input
              aria-label="Search for a city"
              placeholder="Search a city..."
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
            <button type="submit" disabled={loading}>{loading ? "Loading" : "Search"}</button>
          </form>

          <div className="live-indicator"><span /> Live conditions</div>
        </header>

        <nav className="view-tabs" aria-label="Weather views">
          <button className={activeTab === "today" ? "selected" : ""} onClick={() => setActiveTab("today")}>Today</button>
          <button className={activeTab === "forecast" ? "selected" : ""} onClick={() => setActiveTab("forecast")}>7-day forecast</button>
          <button className={activeTab === "places" ? "selected" : ""} onClick={() => setActiveTab("places")}>My places</button>
          <button className={activeTab === "history" ? "selected" : ""} onClick={() => setActiveTab("history")}>Historical Weather</button>
        </nav>

        {error && (
          <div className="error-banner" role="alert">
            <span>{error}</span><button onClick={() => loadWeather(city)}>Retry</button>
          </div>
        )}

        {weather && activeTab !== "history" && (
          <section className="alerts-section" aria-label="Weather alerts">
            <div className="alerts-heading">
              <div>
                <p className="section-eyebrow">WEATHER WATCH</p>
                <h2>🔔 Weather alerts <span className="alerts-count">{displayedAlerts.length}</span></h2>
              </div>
              <div className="alerts-actions">
                <button className="notification-button" onClick={() => setShowTestAlert((x) => !x)}>
                  {showTestAlert ? "Hide test alert" : "Test alert"}
                </button>
                <button className="notification-button" onClick={enableBrowserAlerts} disabled={browserAlertsEnabled}>
                  {browserAlertsEnabled ? "✓ Notifications enabled" : "Enable notifications"}
                </button>
              </div>
            </div>

            {displayedAlerts.length === 0 ? (
              <div className="alert-clear">
                <span className="alert-clear-icon">✓</span>
                <div><strong>No significant conditions detected</strong><p>We'll check the forecast again while this dashboard is open.</p></div>
              </div>
            ) : (
              <div className="alerts-list">
                {displayedAlerts.map((alert) => (
                  <article className={`weather-alert alert-${alert.severity}`} key={alert.id}>
                    <span className="weather-alert-icon">{alert.icon}</span>
                    <div className="weather-alert-copy">
                      <div className="weather-alert-title">
                        <strong>{alert.title}</strong>
                        <span className="alert-severity">{alert.severity === "severe" ? "Severe" : "Advisory"}</span>
                      </div>
                      <p>{alert.message}</p>
                    </div>
                  </article>
                ))}
              </div>
            )}
            {showTestAlert && <p className="alerts-disclaimer">Demo mode is on. The test alert is simulated.</p>}
            <p className="alerts-disclaimer">These are automated forecast advisories, not official emergency alerts.</p>
          </section>
        )}

        {loading && !weather ? (
          <section className="loading-card">
            <div className="loading-sun">☼</div><h2>Finding your forecast</h2><p>Looking up the latest sky conditions...</p>
          </section>
        ) : weather ? (
          <>
            {activeTab === "history" && (
              <section className="history-section">
                <div className="history-heading">
                  <div>
                    <p className="section-eyebrow">LOOKING BACK</p>
                    <h2>Historical Weather</h2>
                    <p className="history-date-label">Explore past weather for {city}.</p>
                  </div>
                </div>

                <form className="history-form" onSubmit={loadHistory}>
                  <div className="history-field">
                    <label htmlFor="history-city">Location</label>
                    <input id="history-city" value={city} readOnly />
                  </div>
                  <div className="history-field">
                    <label htmlFor="history-date">Choose a past date</label>
                    <input
                      id="history-date"
                      type="date"
                      value={historyDate}
                      max={today}
                      min="1940-01-01"
                      onChange={(e) => setHistoryDate(e.target.value)}
                      required
                    />
                  </div>
                  <button className="history-submit" type="submit" disabled={historyLoading}>
                    {historyLoading ? "Loading history..." : "Get historical weather"}
                  </button>
                </form>

                <p className="alerts-disclaimer">Historical data is archived weather information, not a forecast. Recent dates may have a reporting delay.</p>
                {historyError && <div className="history-message" role="alert">{historyError}</div>}
                {historyLoading && <div className="history-message">Fetching historical data for {city}...</div>}

                {history && (
                  <>
                    <div className="history-heading">
                      <div>
                        <h2>{history.place.name}{history.place.country ? `, ${history.place.country}` : ""}</h2>
                        <p className="history-date-label">
                          {new Date(`${historyDate}T12:00:00`).toLocaleDateString("en", {
                            weekday: "long", year: "numeric", month: "long", day: "numeric",
                          })}
                        </p>
                      </div>
                    </div>

                    <div className="history-grid">
                      <div className="history-stat"><span>Average temperature</span><strong>{meanTemp == null ? "--" : `${meanTemp}°C`}</strong></div>
                      <div className="history-stat"><span>Highest temperature</span><strong>{maxTemp == null ? "--" : `${maxTemp}°C`}</strong></div>
                      <div className="history-stat"><span>Lowest temperature</span><strong>{minTemp == null ? "--" : `${minTemp}°C`}</strong></div>
                      <div className="history-stat"><span>Total precipitation</span><strong>{totalRain == null ? "--" : `${Number(totalRain).toFixed(1)} mm`}</strong></div>
                    </div>

                    <div className="history-grid">
                      <div className="history-stat"><span>Maximum wind speed</span><strong>{maxWind == null ? "--" : `${Math.round(maxWind)} km/h`}</strong></div>
                      <div className="history-stat"><span>Weather condition</span><strong>{getCondition(historyDaily?.weather_code?.[0]).icon} {getCondition(historyDaily?.weather_code?.[0]).label}</strong></div>
                      <div className="history-stat">
                        <span>Historical humidity</span>
                        <strong>
                          {(() => {
                            const values = (historyHourly.relative_humidity_2m || []).filter((x) => x != null);
                            return values.length ? `${Math.round(values.reduce((a, b) => a + b, 0) / values.length)}%` : "--";
                          })()}
                        </strong>
                      </div>
                      <div className="history-stat"><span>Hours recorded</span><strong>{historyHourly.time.length}</strong></div>
                    </div>

                    <div className="section-heading">
                      <div><p className="section-eyebrow">VISUAL INSIGHTS</p><h2>Historical weather trends</h2></div>
                    </div>

                    <div className="history-charts">
                      <HistoryChart title="Temperature" unit="°C" values={historyHourly.temperature_2m || []} color="#ffb86b" fill />
                      <HistoryChart title="Humidity" unit="%" values={historyHourly.relative_humidity_2m || []} color="#79c7ff" fill />
                      <HistoryChart title="Rainfall" unit="mm" values={historyHourly.precipitation || []} color="#8ce3d2" />
                    </div>

                    <div className="section-heading">
                      <div><p className="section-eyebrow">HOUR BY HOUR</p><h2>Past day's conditions</h2></div>
                    </div>

                    <div className="history-hourly">
                      <table className="history-table">
                        <thead>
                          <tr><th>Time</th><th>Condition</th><th>Temperature</th><th>Humidity</th><th>Rainfall</th><th>Wind</th></tr>
                        </thead>
                        <tbody>
                          {historyHourly.time.map((time, i) => {
                            const c = getCondition(historyHourly.weather_code?.[i]);
                            return (
                              <tr key={time}>
                                <td>{formatHour(time)}</td>
                                <td>{c.icon} {c.label}</td>
                                <td>{historyHourly.temperature_2m?.[i] == null ? "--" : `${Math.round(historyHourly.temperature_2m[i])}°C`}</td>
                                <td>{historyHourly.relative_humidity_2m?.[i] == null ? "--" : `${historyHourly.relative_humidity_2m[i]}%`}</td>
                                <td>{historyHourly.precipitation?.[i] == null ? "--" : `${Number(historyHourly.precipitation[i]).toFixed(1)} mm`}</td>
                                <td>{historyHourly.wind_speed_10m?.[i] == null ? "--" : `${Math.round(historyHourly.wind_speed_10m[i])} km/h`}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </section>
            )}

            {activeTab !== "places" && activeTab !== "history" && (
              <section className="current-weather">
                <div className="hero-copy">
                  <div className="location-kicker"><span className="location-pin">⌖</span> CURRENT WEATHER</div>
                  <h1>{location.name || location.city || city}{location.country ? <span className="country-name">, {location.country}</span> : null}</h1>
                  <p className="date-line">{currentTimeLabel}</p>
                  <div className="temperature-line"><span className="big-temperature">{Math.round(Number(current?.temperature_2m ?? 0))}</span><span className="degree-symbol">°</span></div>
                  <div className="current-condition">{condition.label}</div>
                  <p className="feels-line">
                    Feels like {Math.round(Number(current?.apparent_temperature ?? current?.temperature_2m ?? 0))}°
                    <span className="condition-divider">·</span> H:{high != null ? Math.round(high) : "--"}°
                    <span className="condition-divider">·</span> L:{low != null ? Math.round(low) : "--"}°
                  </p>
                  <p className="weather-description">{getWeatherDescription(weatherCode, isNight)}</p>
                </div>

                <div className="hero-art" aria-hidden="true">
                  <div className="art-halo" /><div className="art-cloud cloud-back" /><div className="art-cloud cloud-front" />
                  <div className="art-sun">{theme === "night" ? "☾" : condition.icon}</div>
                  {theme === "rain" || theme === "thunderstorm" ? <div className="rain-streaks">{Array.from({ length: 11 }, (_, i) => <span key={i} style={{ "--i": i }} />)}</div> : null}
                  {theme === "thunderstorm" ? <div className="lightning">ϟ</div> : null}
                  {theme === "night" ? <div className="night-stars">{Array.from({ length: 9 }, (_, i) => <span key={i} style={{ "--i": i }} />)}</div> : null}
                </div>

                <div className="hero-bottom">
                  <div className="bottom-condition"><span className="bottom-condition-icon">{condition.icon}</span><span>{condition.label}</span></div>
                  <div className="bottom-message">{isNight ? "The world is winding down for the night." : "Here's the sky, right where you are."}</div>
                </div>
              </section>
            )}

            {activeTab === "today" && (
              <>
                <section className="content-section">
                  <div className="section-heading">
                    <div><p className="section-eyebrow">THE NEXT FEW HOURS</p><h2>Hourly forecast</h2></div>
                    <span className="section-aside">Next 8 hours</span>
                  </div>
                  <div className="hourly-card">
                    {hourlyForecast.map((item, index) => (
                      <article className="hourly-item" key={`${item.time}-${index}`}>
                        <span className="hourly-time">{index === 0 ? "Now" : formatHour(item.time)}</span>
                        <span className="hourly-weather-icon">{item.condition.icon}</span>
                        <strong className="hourly-temperature">{item.temperature != null ? `${Math.round(item.temperature)}°` : "--"}</strong>
                        <span className="hourly-rain">{item.rainChance > 0 ? `${item.rainChance}% rain` : " "}</span>
                      </article>
                    ))}
                  </div>
                </section>

                <section className="content-section live-charts-section">
                  <div className="section-heading live-charts-heading">
                    <div><p className="section-eyebrow">LIVE FORECAST INSIGHTS</p><h2>Weather trends for the next 24 hours</h2></div>
                  </div>
                  <div className="history-charts">
                    <HistoryChart title="Forecast temperature" unit="°C" values={liveChartData.temperature} color="#ffb86b" fill />
                    <HistoryChart title="Forecast humidity" unit="%" values={liveChartData.humidity} color="#79c7ff" fill />
                    <HistoryChart title="Forecast rainfall" unit="mm" values={liveChartData.rainfall} color="#8ce3d2" />
                  </div>
                  <p className="live-charts-note">Forecast values are estimates and update when the live weather data refreshes. Missing humidity or precipitation data may leave a chart empty.</p>
                </section>

                <section className="content-section">
                  <div className="section-heading"><div><p className="section-eyebrow">AT A GLANCE</p><h2>Weather details</h2></div></div>
                  <div className="metrics-grid">
                    <MetricCard icon="💧" label="Humidity" value={`${current?.relative_humidity_2m ?? "--"}%`} detail="Relative humidity" />
                    <MetricCard icon="↗" label="Wind" value={`${Math.round(Number(current?.wind_speed_10m ?? 0))} km/h`} detail="Current wind speed" />
                    <MetricCard icon="🌡" label="Feels like" value={`${Math.round(Number(current?.apparent_temperature ?? current?.temperature_2m ?? 0))}°`} detail="Perceived temperature" />
                    <MetricCard icon="☂" label="Precipitation" value={`${current?.precipitation ?? 0} mm`} detail="Current precipitation" />
                  </div>
                </section>

                <section className="content-section compact-forecast">
                  <div className="section-heading"><div><p className="section-eyebrow">PLAN AHEAD</p><h2>The week ahead</h2></div><button className="text-link" onClick={() => setActiveTab("forecast")}>Full forecast <span>↗</span></button></div>
                  <div className="mini-week">
                    {(daily?.time || []).slice(0, 5).map((day, index) => {
                      const c = getCondition(daily.weather_code?.[index] ?? 3);
                      return <div className="mini-day" key={day}><span>{formatDay(day, index)}</span><span className="mini-day-icon">{c.icon}</span><strong>{daily.temperature_2m_max?.[index] != null ? `${Math.round(daily.temperature_2m_max[index])}°` : "--"}</strong><span className="mini-low">{daily.temperature_2m_min?.[index] != null ? `${Math.round(daily.temperature_2m_min[index])}°` : "--"}</span></div>;
                    })}
                  </div>
                </section>
              </>
            )}

            {activeTab === "forecast" && (
              <section className="content-section full-week">
                <div className="section-heading"><div><p className="section-eyebrow">A LITTLE FURTHER OUT</p><h2>7-day forecast</h2></div><span className="section-aside">Daily outlook</span></div>
                <div className="week-card">
                  {(daily?.time || []).slice(0, 7).map((day, index) => {
                    const c = getCondition(daily.weather_code?.[index] ?? 3);
                    const hi = Number(daily.temperature_2m_max?.[index] ?? 0);
                    const lo = Number(daily.temperature_2m_min?.[index] ?? 0);
                    const highs = (daily.temperature_2m_max || []).map(Number);
                    const lows = (daily.temperature_2m_min || []).map(Number);
                    const min = Math.min(...lows);
                    const max = Math.max(...highs);
                    const span = Math.max(1, max - min);
                    return <article className="week-row" key={day}><span className="week-day">{formatDay(day, index)}</span><span className="week-icon">{c.icon}</span><span className="week-condition">{c.label}</span><span className="week-low">{Math.round(lo)}°</span><div className="temperature-track"><div className="temperature-range" style={{ left: `${((lo - min) / span) * 100}%`, width: `${Math.max(5, ((hi - lo) / span) * 100)}%` }} /></div><span className="week-high">{Math.round(hi)}°</span><span className="week-rain">{daily.precipitation_probability_max?.[index] > 0 ? `💧 ${daily.precipitation_probability_max[index]}%` : "—"}</span></article>;
                  })}
                </div>
              </section>
            )}

            {activeTab === "places" && (
              <section className="content-section places-section">
                <div className="section-heading"><div><p className="section-eyebrow">YOUR LITTLE CORNER OF THE WORLD</p><h2>My places</h2></div></div>
                <div className="places-grid">
                  {savedCities.map((savedCity) => (
                    <button key={savedCity} className={`place-card ${savedCity.toLowerCase() === city.toLowerCase() ? "place-active" : ""}`} onClick={() => loadWeather(savedCity)}>
                      <span className="place-icon">{savedCity.toLowerCase() === city.toLowerCase() ? condition.icon : "⌖"}</span>
                      <span className="place-name">{savedCity}</span>
                      <strong>{savedCity.toLowerCase() === city.toLowerCase() && current ? `${Math.round(Number(current.temperature_2m))}°` : "View forecast"}</strong>
                      <span className="place-caption">{savedCity.toLowerCase() === city.toLowerCase() ? condition.label : "Tap to see conditions"}</span>
                    </button>
                  ))}
                </div>
                <p className="places-note">Search for a city above to add it to your saved places.</p>
              </section>
            )}
          </>
        ) : null}

        <footer className="footer">
          <div className="footer-brand"><span>✳</span> Skylume</div>
          <span className="footer-tagline">A little closer to the sky.</span>
          <button className="refresh-button" onClick={() => loadWeather(city)} disabled={loading}>↻ {loading ? "Updating..." : "Refresh"}</button>
        </footer>
      </div>
    </main>
  );
}
