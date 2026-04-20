// Global configuration for the mural map prototype.
// Update these values for your own Sheet / defaults.

window.MURAL_MAP_CONFIG = {
    // 1. CSV URL from "Publish to web" in Google Sheets (format: CSV).
    // Example:
    // "https://docs.google.com/spreadsheets/d/XYZ/pub?output=csv"
  CSV_URL:
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vQrPWPKNThBw5cAUYFCWb4-S6J9_Du2u3tDnqQno3v6fYq5sjx_qCB2c8T0raIE7OZvLN1ANuczcD4Y/pub?gid=911993096&single=true&output=csv",
  
    // 2. Default map view (New York City center).
    DEFAULT_CENTER: { lat: 40.7128, lng: -74.006 },
  
    // 3. Default zoom level (11 = city level view).
    DEFAULT_ZOOM: 11
  };
  
// Curated tours that can be extended by Thrive staff.
// Add a new object with an `id`, `name`, `description`, `borough`,
// optional highlight `color`, and `keywords` that help match murals.
// Keywords are matched against mural name, school, borough, and theme fields.
// Use `limit` to cap the number of stops that are auto-selected.
window.MURAL_TOURS = [
  {
    id: "harlem",
    name: "Harlem Highlights",
    borough: "Manhattan",
    description: "Community murals clustered around Harlem and upper Manhattan.",
    keywords: ["harlem"],
    color: "#f472b6",
    limit: 6
  },
  {
    id: "bronx",
    name: "Bronx Storyline",

    description: "A route stitching Bronx campus murals together.",
    borough: "Bronx",
    keywords: ["bronx", "149", "fordham", "ms"],
    color: "#34d399",
    limit: 6
  },
  {
    id: "brooklyn",
    name: "Brooklyn Block Party",
    description: "East New York, Bushwick, and Downtown Brooklyn collaborations.",
    borough: "Brooklyn",
    keywords: ["brooklyn", "bushwick", "envision", "high"],
    color: "#60a5fa",
    limit: 6
  }
];
