let map;
let markers = [];
let infoWindow;
let allMurals = [];
let clusterer;
let currentVisibleMurals = [];
let activeFilters = {
  search: "",
  year: null,
  school: null,
  borough: null,
  tour: null,
  muralView: 100 // Percentage of murals to show (25, 50, 75, 100)
};
let userLocation = null;
let userLocationMarker = null;
let userAccuracyCircle = null;
let curatedTours = [];
let curatedTourStops = new Map();
let activeTourPolyline = null;
let modalData = { schools: [], boroughs: [], tours: [] };
let modalListenersBound = false;
let tourStopNumbers = new Map(); // Maps mural UID to stop number for active tour
let tourMarkers = []; // Separate array for numbered tour markers (not clustered)
// Services for Directions
let directionsService = null;
let directionsRenderer = null;
let routeRenderers = [];

// ── Reverse-geocoding ────────────────────────────────────────────────────────
// geocoder is initialised inside initMap() once the Maps API is ready.
// geocodeCache stores lat,lng → street address so each location is only
// fetched once per session, no matter how many times its popup is opened.
let geocoder = null;
const geocodeCache = new Map(); // key: "lat,lng"  value: resolved address string
/**
 * Fetches the street address for a given lat/lng.
 * Uses the existing geocodeCache to minimize API calls.
 */
async function getAddressFromLatLng(lat, lng) {
  const key = `${lat},${lng}`;
  
  // Return cached address if we already fetched it this session
  if (geocodeCache.has(key)) {
    return geocodeCache.get(key);
    
  }

  // Initialize geocoder if it hasn't been already
  if (!geocoder) {
    geocoder = new google.maps.Geocoder();
  }

  try {
    const response = await geocoder.geocode({ location: { lat: parseFloat(lat), lng: parseFloat(lng) } });
    if (response.results && response.results[0]) {
      // Get the most relevant street address
      const address = response.results[0].formatted_address;
      // Cache it for future clicks
      geocodeCache.set(key, address);
      return address;
    }
  } catch (error) {
    console.error("Geocoding failed: ", error);
  }
  
  // Fallback if the API fails or no address is found
  return "Location coordinates only";
}

// Convenience access to config with fallbacks
const CONFIG = window.MURAL_MAP_CONFIG || {};
const CSV_URL = CONFIG.CSV_URL || "";
const DEFAULT_CENTER = CONFIG.DEFAULT_CENTER || { lat: 40.7128, lng: -74.006 };
const DEFAULT_ZOOM = CONFIG.DEFAULT_ZOOM || 11;
const TOUR_DEFINITIONS = Array.isArray(window.MURAL_TOURS) ? window.MURAL_TOURS : [];
const CURATED_TOUR_PREFIX = "curated:";
const DATA_TOUR_PREFIX = "data:";
const LOCATION_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 0
};
const NEAREST_DEFAULT_MESSAGE =
  "Tap “Find murals near me” to surface the closest murals and walking directions.";




// Dark theme for Google Maps
const DARK_MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#212121" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#212121" }] },
  {
    featureType: "administrative",
    elementType: "geometry",
    stylers: [{ color: "#757575" }]
  },
  {
    featureType: "administrative.country",
    elementType: "labels.text.fill",
    stylers: [{ color: "#9e9e9e" }]
  },
  {
    featureType: "administrative.land_parcel",
    stylers: [{ visibility: "off" }]
  },
  {
    featureType: "administrative.locality",
    elementType: "labels.text.fill",
    stylers: [{ color: "#bdbdbd" }]
  },
  {
    featureType: "poi",
    elementType: "labels.text.fill",
    stylers: [{ color: "#757575" }]
  },
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [{ color: "#181818" }]
  },
  {
    featureType: "poi.park",
    elementType: "labels.text.fill",
    stylers: [{ color: "#616161" }]
  },
  {
    featureType: "poi.park",
    elementType: "labels.text.stroke",
    stylers: [{ color: "#1b1b1b" }]
  },
  {
    featureType: "road",
    elementType: "geometry.fill",
    stylers: [{ color: "#2c2c2c" }]
  },
  {
    featureType: "road",
    elementType: "labels.text.fill",
    stylers: [{ color: "#8a8a8a" }]
  },
  {
    featureType: "road.arterial",
    elementType: "geometry",
    stylers: [{ color: "#373737" }]
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#3c3c3c" }]
  },
  {
    featureType: "road.highway.controlled_access",
    elementType: "geometry",
    stylers: [{ color: "#4e4e4e" }]
  },
  {
    featureType: "road.local",
    elementType: "labels.text.fill",
    stylers: [{ color: "#616161" }]
  },
  {
    featureType: "transit",
    elementType: "labels.text.fill",
    stylers: [{ color: "#757575" }]
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#000000" }]
  },
  {
    featureType: "water",
    elementType: "labels.text.fill",
    stylers: [{ color: "#3d3d3d" }]
  }
];

function calculateDistanceMeters(pointA, pointB) {
  const toRad = deg => (deg * Math.PI) / 180;
  const R = 6371000; // meters
  const dLat = toRad(pointB.lat - pointA.lat);
  const dLng = toRad(pointB.lng - pointA.lng);
  const lat1 = toRad(pointA.lat);
  const lat2 = toRad(pointB.lat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function formatDistance(meters) {
  const feet = meters * 3.28084; // Convert meters to feet
  if (feet >= 5280) {
    const miles = feet / 5280;
    return `${miles.toFixed(miles >= 10 ? 0 : 1)} mi`;
  }
  return `${Math.round(feet)} ft`;
}

// Group murals by location (same lat/lng rounded to ~10 meters precision)
function getLocationKey(lat, lng) {
  // Round to ~5 decimal places (~1 meter precision)
  return `${Math.round(lat * 100000) / 100000},${Math.round(lng * 100000) / 100000}`;
}

// Group murals at the same location, keeping the first mural as representative
function groupByLocation(murals) {
  const locationMap = new Map();
  
  murals.forEach(mural => {
    if (mural.lat == null || mural.lng == null) return;
    const key = getLocationKey(mural.lat, mural.lng);
    if (!locationMap.has(key)) {
      locationMap.set(key, mural);
    }
  });
  
  return Array.from(locationMap.values());
}

function selectStopsForTour(definition) {
  if (!definition || !allMurals.length) return [];

  const boroughNeedle = definition.borough ? definition.borough.toLowerCase().trim() : null;
  const keywordNeedles = Array.isArray(definition.keywords)
    ? definition.keywords.map(k => k.toLowerCase())
    : [];

  let candidates = allMurals.filter(mural => {
    // Strict borough matching - must be exact match (case-insensitive)
    if (boroughNeedle) {
      const muralBorough = (mural.borough || "").toLowerCase().trim();
      if (muralBorough !== boroughNeedle) {
        return false;
      }
    }
    
    // If keywords are specified, at least one must match
    if (keywordNeedles.length > 0) {
      const haystack = `${mural.name} ${mural.school || ""} ${mural.theme || ""} ${mural.borough || ""}`.toLowerCase();
      return keywordNeedles.some(kw => haystack.includes(kw));
    }
    
    return true;
  });

  // If no candidates found with keywords, fall back to borough-only (but still strict match)
  if (!candidates.length && boroughNeedle && keywordNeedles.length > 0) {
    candidates = allMurals.filter(mural => {
      const muralBorough = (mural.borough || "").toLowerCase().trim();
      return muralBorough === boroughNeedle;
    });
  }

  // Group by location to get unique stops
  const uniqueLocationStops = groupByLocation(candidates);

  // Apply limit to unique locations
  if (definition.limit && uniqueLocationStops.length > definition.limit) {
    return uniqueLocationStops.slice(0, definition.limit);
  }

  return uniqueLocationStops;
}

function buildCuratedTours() {
  curatedTours = [];
  curatedTourStops = new Map();

  TOUR_DEFINITIONS.forEach(definition => {
    // Get all matching murals (for display)
    const allMatching = selectAllMatchingMurals(definition);
    // Get unique location stops (for polyline)
    const uniqueStops = selectStopsForTour(definition);
    
    curatedTours.push({ ...definition, stops: uniqueStops });
    curatedTourStops.set(definition.id, {
      definition,
      stops: uniqueStops, // For polyline - unique locations only
      allMurals: allMatching, // For filtering - all matching murals
      uidSet: new Set(allMatching.map(m => m.uid)) // For filtering
    });
  });

  renderTourCards();
}

// Get all murals matching tour criteria (before location grouping)
function selectAllMatchingMurals(definition) {
  if (!definition || !allMurals.length) return [];

  const boroughNeedle = definition.borough ? definition.borough.toLowerCase().trim() : null;
  const keywordNeedles = Array.isArray(definition.keywords)
    ? definition.keywords.map(k => k.toLowerCase())
    : [];

  let candidates = allMurals.filter(mural => {
    // Strict borough matching - must be exact match (case-insensitive)
    if (boroughNeedle) {
      const muralBorough = (mural.borough || "").toLowerCase().trim();
      if (muralBorough !== boroughNeedle) {
        return false;
      }
    }
    
    // If keywords are specified, at least one must match
    if (keywordNeedles.length > 0) {
      const haystack = `${mural.name} ${mural.school || ""} ${mural.theme || ""} ${mural.borough || ""}`.toLowerCase();
      return keywordNeedles.some(kw => haystack.includes(kw));
    }
    
    return true;
  });

  // If no candidates found with keywords, fall back to borough-only (but still strict match)
  if (!candidates.length && boroughNeedle && keywordNeedles.length > 0) {
    candidates = allMurals.filter(mural => {
      const muralBorough = (mural.borough || "").toLowerCase().trim();
      return muralBorough === boroughNeedle;
    });
  }

  return candidates;
}

function renderTourCards() {
  const container = document.getElementById("tourCards");
  if (!container) return;

  container.innerHTML = "";

  if (!curatedTours.length) {
    const note = document.createElement("p");
    note.className = "tours-panel-subtitle";
    note.textContent = "Add tour definitions in js/config.js to surface curated walking routes.";
    container.appendChild(note);
    return;
  }

  curatedTours.forEach(tour => {
    const card = document.createElement("article");
    card.className = "tour-card";

    const chipBg     = tour.color || "rgba(59, 130, 246, 0.2)";
    const chipBorder = tour.color || "rgba(59, 130, 246, 0.4)";
    const prefixedId = `${CURATED_TOUR_PREFIX}${tour.id}`;
    const isActive   = activeFilters.tour === prefixedId;

    card.innerHTML = `
      <div class="tour-card-head">
        <h3>${tour.name}</h3>
        <span class="tour-chip" style="background:${chipBg}; border:1px solid ${chipBorder};">
          ${tour.stops.length || 0} stops
        </span>
      </div>
      <p>${tour.description || "Add a description in js/config.js"}</p>
      <footer>
        <span class="tour-card-meta">${tour.borough || "Multi-borough"}</span>
        <button type="button"
                data-tour-id="${tour.id}"
                class="${isActive ? 'end-tour' : ''}">
          ${isActive ? 'End tour' : 'Start tour'}
        </button>
      </footer>
    `;

    const btn = card.querySelector("button");
    btn?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (isActive) {
        // ── End tour: clear everything and return to default map ──
        activeFilters.tour = null;
        tourStopNumbers.clear();
        // Remove the polyline
        if (activeTourPolyline) {
          activeTourPolyline.setMap(null);
          activeTourPolyline = null;
        }
        // Remove numbered tour markers
        tourMarkers.forEach(m => m.setMap(null));
        tourMarkers = [];
        // Restore all murals and re-cluster
        currentVisibleMurals = allMurals;
        createMarkers(allMurals);
      } else {
        // ── Start tour: activate this tour ──
        activeFilters.tour = prefixedId;
        applyFilters();
      }

      // Re-render cards so every button reflects the new state
      renderTourCards();
      populateFilters();
    });

    container.appendChild(card);
  });
}

// Order stops using nearest-neighbor algorithm for logical routing
function orderStopsForTour(stops) {
  if (stops.length <= 1) return stops;

  // Start with the northernmost stop (highest latitude) as the starting point
  const sortedByLat = [...stops].sort((a, b) => b.lat - a.lat);
  const ordered = [sortedByLat[0]];
  const remaining = sortedByLat.slice(1);

  // Use nearest-neighbor to find the next closest stop
  while (remaining.length > 0) {
    const current = ordered[ordered.length - 1];
    let nearestIndex = 0;
    let nearestDistance = calculateDistanceMeters(
      { lat: current.lat, lng: current.lng },
      { lat: remaining[0].lat, lng: remaining[0].lng }
    );

    for (let i = 1; i < remaining.length; i++) {
      const distance = calculateDistanceMeters(
        { lat: current.lat, lng: current.lng },
        { lat: remaining[i].lat, lng: remaining[i].lng }
      );
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = i;
      }
    }

    ordered.push(remaining[nearestIndex]);
    remaining.splice(nearestIndex, 1);
  }

  return ordered;
}

function updateTourPolyline() {
  // Clear any existing tour polyline
  if (activeTourPolyline) {
    activeTourPolyline.setMap(null);
    activeTourPolyline = null;
  }

  // If no tour is active, just clear stop numbers — caller handles markers
  if (!map || !activeFilters.tour || !activeFilters.tour.startsWith(CURATED_TOUR_PREFIX)) {
    tourStopNumbers.clear();
    return;
  }

  const tourId = activeFilters.tour.replace(CURATED_TOUR_PREFIX, "");
  const entry = curatedTourStops.get(tourId);
  if (!entry) {
    tourStopNumbers.clear();
    return;
  }

  const color = entry.definition.color || "#3b82f6";

  // Only keep tour stops that survived all active filters
  // currentVisibleMurals is already filtered by year/school/borough/search
  const visibleUids = new Set(currentVisibleMurals.map(m => m.uid));
  const filteredStops = entry.stops.filter(stop => visibleUids.has(stop.uid));

  // Need at least 2 stops to draw a meaningful route
  if (filteredStops.length < 2) {
    tourStopNumbers.clear();
    return;
  }

  // Order the surviving stops logically
  const orderedStops = orderStopsForTour(filteredStops);

  // Rebuild tourStopNumbers — createMarkers will use this immediately after
  tourStopNumbers.clear();
  orderedStops.forEach((stop, index) => {
    tourStopNumbers.set(stop.uid, index + 1);
  });

  // Draw the polyline connecting only the filtered stops
  const path = orderedStops.map(stop => ({ lat: stop.lat, lng: stop.lng }));
  activeTourPolyline = new google.maps.Polyline({
    map,
    path,
    strokeColor: color,
    strokeOpacity: 0.9,
    strokeWeight: 3
  });
}

function showLoading(show) {
  const el = document.getElementById("map-loading");
  if (!el) return;
  el.classList.toggle("hidden", !show);
}

function showError(show, message) {
  const el = document.getElementById("map-error");
  if (!el) return;
  if (message) {
    el.textContent = message;
  }
  el.classList.toggle("hidden", !show);
}

/**
 * Minimal CSV parser that respects quoted fields.
 */
function parseCSV(text) {
  const rows = [];
  let current = "";
  let row = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = i + 1 < text.length ? text[i + 1] : null;

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        row.push(current);
        current = "";
      } else if (char === "\r") {
        // ignore
      } else if (char === "\n") {
        row.push(current);
        rows.push(row);
        row = [];
        current = "";
      } else {
        current += char;
      }
    }
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current);
    rows.push(row);
  }

  return rows;
}

function getColumnIndex(headerRow, possibleNames) {
  for (const name of possibleNames) {
    const idx = headerRow.indexOf(name);
    if (idx !== -1) return idx;
  }
  return -1;
}

async function loadMuralsFromSheet() {
  if (!CSV_URL) {
    throw new Error("CSV_URL is not configured in config.js");
  }

  try {
    const response = await fetch(CSV_URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch CSV: ${response.status} ${response.statusText}`);
    }

    const text = await response.text();
    const rows = parseCSV(text);

    if (!rows.length) {
      throw new Error("CSV appears to be empty");
    }

    const header = rows[0].map(h => h.trim());
    const dataRows = rows.slice(1);

    const idxName = getColumnIndex(header, ["mural_title", "mural_name", "name", "title"]);
    const idxLat = getColumnIndex(header, ["lat", "latitude"]);
    const idxLng = getColumnIndex(header, ["lng", "lon", "long", "longitude"]);
    const idxBorough = getColumnIndex(header, ["borough"]);
    const idxYear = getColumnIndex(header, ["year"]);
    const idxSchool = getColumnIndex(header, ["school_name", "school"]);
    const idxDetailUrl = getColumnIndex(header, ["detail_url", "url", "project_url"]);
    const idxImageUrl = getColumnIndex(header, ["image_url", "image_urls", "thumbnail_url"]);
    const idxArtistNames = getColumnIndex(header, ["artist_names", "artists"]);
    const idxTheme = getColumnIndex(header, ["theme", "tags"]);
    const idxTourId = getColumnIndex(header, ["tour_id", "tour"]);
    const idxStudents = getColumnIndex(header, ["students_involved", "students"]);
    const idxAddress = getColumnIndex(header, ["address", "street_address", "location_address"]);
    const idxNeighborhood = getColumnIndex(header, ["neighborhood", "area", "district"]);
    const idxDescription = getColumnIndex(header, ["mural_description", "description", "about"]);

    if (idxName === -1) {
      throw new Error("Could not find name column. Expected one of: mural_title, mural_name, name, title");
    }
    if (idxLat === -1) {
      throw new Error("Could not find latitude column. Expected one of: lat, latitude");
    }
    if (idxLng === -1) {
      throw new Error("Could not find longitude column. Expected one of: lng, lon, long, longitude");
    }

    return dataRows
      .map(row => {
        const val = index => (index >= 0 && index < row.length ? row[index].trim() : "");

        const latStr = val(idxLat);
        const lngStr = val(idxLng);
        const lat = parseFloat(latStr);
        const lng = parseFloat(lngStr);
        const nameValue = val(idxName);
        const uid = `${nameValue}-${lat}-${lng}`;

        return {
          uid,
          name: nameValue,
          lat: !Number.isNaN(lat) ? lat : null,
          lng: !Number.isNaN(lng) ? lng : null,
          borough: val(idxBorough),
          year: val(idxYear),
          school: val(idxSchool),
          detail_url: val(idxDetailUrl),
          image_url: val(idxImageUrl),
          artist_names: val(idxArtistNames),
          theme: val(idxTheme),
          tour_id: val(idxTourId),
          students_involved: val(idxStudents),
          address: val(idxAddress),
          neighborhood: val(idxNeighborhood),
          description: val(idxDescription)
        };
      })
      .filter(m => {
        if (!m.name || m.lat === null || m.lng === null) {
          return false;
        }
        return true;
      });
  } catch (err) {
    if (err.message.includes('Failed to fetch') || err.message.includes('CORS') || err.name === 'TypeError') {
      throw new Error('CORS error: Please run this app from a local web server, not by opening the HTML file directly. See README.md for instructions.');
    }
    throw err;
  }
}

// Create a numbered marker icon for tour stops
function createNumberedMarkerIcon(number, color = "#3b82f6") {
  const svg = `
    <svg width="36" height="36" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg">
      <circle cx="18" cy="18" r="16" fill="${color}" stroke="#ffffff" stroke-width="3"/>
      <text x="18" y="18" text-anchor="middle" dominant-baseline="central" 
            fill="#ffffff" font-size="16" font-weight="bold" font-family="Arial, sans-serif">
        ${number}
      </text>
    </svg>
  `;
  return {
    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
    scaledSize: new google.maps.Size(36, 36),
    anchor: new google.maps.Point(18, 18)
  };
}

function createMarkers(murals) {
  // Clear existing markers
  markers.forEach(marker => marker.setMap(null));
  markers = [];
  
  // Clear existing tour markers
  tourMarkers.forEach(marker => marker.setMap(null));
  tourMarkers = [];
  
  if (clusterer) {
    clusterer.clearMarkers();
  }

  // Check if a curated tour is active
  const isTourActive = activeFilters.tour && activeFilters.tour.startsWith(CURATED_TOUR_PREFIX);
  
  // Get tour color if a tour is active
  let tourColor = "#3b82f6";
  if (isTourActive) {
    const tourId = activeFilters.tour.replace(CURATED_TOUR_PREFIX, "");
    const entry = curatedTourStops.get(tourId);
    if (entry) {
      tourColor = entry.definition.color || "#3b82f6";
    }
  }

  // If a tour is active, only show tour markers (no regular markers or clusters)
  if (isTourActive) {
    // Create only numbered tour markers
    murals.forEach(mural => {
      const stopNumber = tourStopNumbers.get(mural.uid);
      if (stopNumber !== undefined) {
        const icon = createNumberedMarkerIcon(stopNumber, tourColor);

        const marker = new google.maps.Marker({
          position: { lat: mural.lat, lng: mural.lng },
          map: map, // Add directly to map, bypassing clusterer
          title: mural.name,
          icon: icon,
          zIndex: google.maps.Marker.MAX_ZINDEX + 1000
        });

        marker.mural = mural;

        marker.addListener("click", () => {
          showMuralPopup(marker);
        });
      }
    });
    // Don't create clusterer when tour is active - only show tour markers
    return;
  }

  // Regular view: separate tour markers from regular markers
  const regularMurals = [];
  const tourMurals = [];

  murals.forEach(mural => {
    const stopNumber = tourStopNumbers.get(mural.uid);
    if (stopNumber !== undefined) {
      tourMurals.push({ mural, stopNumber });
    } else {
      regularMurals.push(mural);
    }
  });

 // Keep track of coordinates we have already seen
 const seenCoordinates = new Set();

 // Create regular markers (will be clustered)
 regularMurals.forEach(mural => {
   let lat = parseFloat(mural.lat);
   let lng = parseFloat(mural.lng);
   const coordKey = `${lat},${lng}`;

   // If this exact coordinate already exists, add a tiny offset
   if (seenCoordinates.has(coordKey)) {
     lat += (Math.random() - 0.5) * 0.0001; // Tiny shift north/south
     lng += (Math.random() - 0.5) * 0.0001; // Tiny shift east/west
   } else {
     seenCoordinates.add(coordKey);
   }

   const icon = {
     url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
       <svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
         <circle cx="16" cy="16" r="12" fill="#65cccc" stroke="#ffffff" stroke-width="2"/>
         <circle cx="16" cy="16" r="6" fill="#ffffff"/>
       </svg>
     `),
     scaledSize: new google.maps.Size(32, 32),
     anchor: new google.maps.Point(16, 16)
   };

   const marker = new google.maps.Marker({
     position: { lat: lat, lng: lng }, // Use the updated lat/lng with jitter
     map: null, // Don't add to map directly, let clusterer handle it
     title: mural.name,
     icon: icon
   });

   marker.mural = mural;
   marker.addListener("click", () => {
     showMuralPopup(marker);
   });

   markers.push(marker);
 });

  // Create numbered tour markers (added directly to map, not clustered)
  tourMurals.forEach(({ mural, stopNumber }) => {
    const icon = createNumberedMarkerIcon(stopNumber, tourColor);

    const marker = new google.maps.Marker({
      position: { lat: mural.lat, lng: mural.lng },
      map: map, // Add directly to map, bypassing clusterer
      title: mural.name,
      icon: icon,
      zIndex: google.maps.Marker.MAX_ZINDEX + 1000 // High z-index to appear above clusters
    });

    marker.mural = mural;

    marker.addListener("click", () => {
      showMuralPopup(marker);
    });

    tourMarkers.push(marker);
  });

  // Update clusterer with only regular markers
  updateClusterer();
}

// Create custom renderer for blue clusters
function createClusterRenderer() {
  return {
    render: ({ count, position }) => {
      // Create a blue cluster icon
      const svg = `
        <svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
          <circle cx="20" cy="20" r="16" fill="#65cccc" stroke="#ffffff" stroke-width="2"/>
          <text x="20" y="20" text-anchor="middle" dominant-baseline="central" 
                fill="#ffffff" font-size="16" font-weight="bold" font-family="Arial, sans-serif">
            ${count}
          </text>
        </svg>
      `;
      
      return new google.maps.Marker({
        position,
        icon: {
          url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
          scaledSize: new google.maps.Size(40, 40),
          anchor: new google.maps.Point(20, 20)
        },
        zIndex: Number(google.maps.Marker.MAX_ZINDEX) + count
      });
    }
  };
}

// Update marker clusterer with current markers
function updateClusterer() {
  // Create or update marker clusterer with very aggressive clustering
  // At low zoom levels, create 1 cluster per borough (or ~5 clusters total)
  // At higher zoom levels, use more granular clustering
  
  const renderer = createClusterRenderer();
  
  // Helper function to create algorithm with zoom-based radius
  function createAlgorithm() {
    try {
      // Get current zoom level, default to 11 if map not ready
      const currentZoom = map ? map.getZoom() : 11;
      
      // If 25% view is active, force exactly 5 clusters
      if (activeFilters.muralView === 25) {
        // Use a very large radius to create exactly 5 clusters
        if (typeof markerClusterer !== 'undefined' && markerClusterer.gridAlgorithm && markerClusterer.gridAlgorithm.GridAlgorithm) {
          return new markerClusterer.gridAlgorithm.GridAlgorithm({
            radius: 800, // Very large radius to force ~5 clusters
            maxZoom: 20 // Never stop clustering at 25% view
          });
        } else if (window.markerClusterer && window.markerClusterer.gridAlgorithm && window.markerClusterer.gridAlgorithm.GridAlgorithm) {
          return new window.markerClusterer.gridAlgorithm.GridAlgorithm({
            radius: 800,
            maxZoom: 20
          });
        }
      }
      
      // Calculate radius based on zoom level
      // At zoom 11 (city view): very large radius (400px) = ~1 cluster per borough
      // At zoom 13-14: medium radius (150px) = more clusters
      // At zoom 15+: smaller radius (60px) = many clusters
      let radius;
      if (currentZoom <= 11) {
        radius = 400; // Very aggressive - ~1 cluster per borough
      } else if (currentZoom <= 13) {
        radius = 200; // Aggressive clustering
      } else if (currentZoom <= 14) {
        radius = 100; // Moderate clustering
      } else {
        radius = 60; // Fine-grained clustering
      }
      
      if (typeof markerClusterer !== 'undefined' && markerClusterer.gridAlgorithm && markerClusterer.gridAlgorithm.GridAlgorithm) {
        return new markerClusterer.gridAlgorithm.GridAlgorithm({
          radius: radius,
          maxZoom: 15 // Stop clustering at zoom 15
        });
      } else if (window.markerClusterer && window.markerClusterer.gridAlgorithm && window.markerClusterer.gridAlgorithm.GridAlgorithm) {
        return new window.markerClusterer.gridAlgorithm.GridAlgorithm({
          radius: radius,
          maxZoom: 15
        });
      }
    } catch (e) {
      console.log('Using default clustering algorithm');
    }
    return undefined;
  }
  
  // Recreate clusterer when zoom changes to update clustering radius
  // Use a debounce to avoid recreating too frequently during zoom
  // Store timeout so we can clear it if needed
  let zoomTimeout;
  let lastZoom = map ? map.getZoom() : null;
  
  function onZoomChanged() {
    // Only update clustering, don't interfere with zoom
    if (!map) return;
    
    const currentZoom = map.getZoom();
    
    // Don't update clustering if 25% view is active (it should stay at 5 clusters)
    if (activeFilters.muralView === 25) {
      lastZoom = currentZoom;
      return; // Keep the 5-cluster view regardless of zoom
    }
    
    // Only update if zoom actually changed (not just a programmatic change)
    if (currentZoom === lastZoom) return;
    lastZoom = currentZoom;
    
    clearTimeout(zoomTimeout);
    zoomTimeout = setTimeout(() => {
      if (clusterer && markers.length > 0 && map) {
        clusterer.clearMarkers();
        const algorithm = createAlgorithm();
        if (typeof markerClusterer !== 'undefined' && markerClusterer.MarkerClusterer) {
          clusterer = new markerClusterer.MarkerClusterer({ 
            map, 
            markers,
            algorithm: algorithm,
            renderer: renderer
          });
        } else if (window.markerClusterer && window.markerClusterer.MarkerClusterer) {
          clusterer = new window.markerClusterer.MarkerClusterer({ 
            map, 
            markers,
            algorithm: algorithm,
            renderer: renderer
          });
        }
      }
    }, 200); // Debounce zoom changes
  }
  
  // Listen for zoom changes to update clustering (but don't prevent zoom)
  if (map) {
    google.maps.event.clearListeners(map, 'zoom_changed');
    google.maps.event.addListener(map, 'zoom_changed', onZoomChanged);
  }
  
  // Initial clusterer creation
  if (typeof markerClusterer !== 'undefined' && markerClusterer.MarkerClusterer) {
    // Always recreate clusterer to ensure renderer is applied
    if (clusterer) {
      clusterer.clearMarkers();
    }
    const algorithm = createAlgorithm();
    clusterer = new markerClusterer.MarkerClusterer({ 
      map, 
      markers,
      algorithm: algorithm,
      renderer: renderer
    });
  } else if (window.markerClusterer && window.markerClusterer.MarkerClusterer) {
    // Always recreate clusterer to ensure renderer is applied
    if (clusterer) {
      clusterer.clearMarkers();
    }
    const algorithm = createAlgorithm();
    clusterer = new window.markerClusterer.MarkerClusterer({ 
      map, 
      markers,
      algorithm: algorithm,
      renderer: renderer
    });
  } else {
    // Fallback if clusterer library not loaded - add markers directly to map
    markers.forEach(m => m.setMap(map));
  }
}

function showMuralPopup(marker) {
  const m = marker.mural;
  
  // Create unique ID for this popup's carousel
  const popupId = 'popup-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  
  // For now, use single image. If multiple images exist, they can be added to an array
  const images = m.image_url ? [m.image_url] : [];
  let currentImageIndex = 0;
  
  const distanceAway =
    userLocation && m.lat && m.lng
      ? formatDistance(calculateDistanceMeters(userLocation, { lat: m.lat, lng: m.lng }))
      : null;

  const html = `
    <div id="${popupId}" style="width:500px; font-family: system-ui, sans-serif; color: #e2e8f0; background: rgba(17,24,39,0.96); padding: 20px; box-sizing: border-box; max-height: 80vh; overflow-y: auto; overflow-x: hidden; border-radius: 8px;">
      <!-- Header with Title and Close Button -->
      <div style="position: relative; margin-bottom: 16px;">
        <h2 style="margin: 0; font-size: 20px; font-weight: 600; color: #ffffff; text-align: center; padding-right: 30px;">
          ${m.name}${m.year ? ` (${m.year})` : ''}
        </h2>
        <button id="${popupId}-close" 
                style="position: absolute; top: 0; right: 0; background: rgba(255,255,255,0.1); border: none; font-size: 24px; cursor: pointer; color: #9ca3af; padding: 0; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; line-height: 1; border-radius: 4px; transition: all 0.2s;"
                onmouseover="this.style.background='rgba(255,255,255,0.2)'; this.style.color='#ffffff';"
                onmouseout="this.style.background='rgba(255,255,255,0.1)'; this.style.color='#9ca3af';"
                title="Close">
          &times;
        </button>
      </div>
      ${
        distanceAway
          ? `<div style="display:flex; justify-content:center; margin-bottom:12px;">
              <span class="distance-pill" style="background:rgba(59,130,246,0.18); border:1px solid rgba(59,130,246,0.35); color:#dbeafe;">
                ${distanceAway} away
              </span>
            </div>`
          : ""
      }
      
      <!-- Image Carousel -->
      ${images.length > 0 ? `
        <div style="position: relative; margin-bottom: 16px; border-radius: 8px; overflow: hidden; background: #f3f4f6;">
          <div style="position: relative; width: 100%; padding-top: 56.25%; background: #e5e7eb;">
            <img id="${popupId}-img" src="${images[0]}" alt="${m.name}" 
                 style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover;">
            ${images.length > 1 ? `
              <button id="${popupId}-prev" onclick="
                const popup = document.getElementById('${popupId}');
                const img = popup.querySelector('#${popupId}-img');
                const images = ${JSON.stringify(images)};
                let idx = parseInt(img.dataset.index || 0);
                idx = (idx - 1 + images.length) % images.length;
                img.src = images[idx];
                img.dataset.index = idx;
              " style="position: absolute; left: 8px; top: 50%; transform: translateY(-50%); background: rgba(255,255,255,0.9); border: none; width: 36px; height: 36px; border-radius: 50%; cursor: pointer; font-size: 18px; color: #1f2937; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 4px rgba(0,0,0,0.2); transition: all 0.2s;"
                 onmouseover="this.style.background='#ffffff'; this.style.transform='translateY(-50%) scale(1.1)';"
                 onmouseout="this.style.background='rgba(255,255,255,0.9)'; this.style.transform='translateY(-50%) scale(1)';">
              &lt;
            </button>
            <button id="${popupId}-next" onclick="
              const popup = document.getElementById('${popupId}');
              const img = popup.querySelector('#${popupId}-img');
              const images = ${JSON.stringify(images)};
              let idx = parseInt(img.dataset.index || 0);
              idx = (idx + 1) % images.length;
              img.src = images[idx];
              img.dataset.index = idx;
            " style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); background: rgba(255,255,255,0.9); border: none; width: 36px; height: 36px; border-radius: 50%; cursor: pointer; font-size: 18px; color: #1f2937; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 4px rgba(0,0,0,0.2); transition: all 0.2s;"
                 onmouseover="this.style.background='#ffffff'; this.style.transform='translateY(-50%) scale(1.1)';"
                 onmouseout="this.style.background='rgba(255,255,255,0.9)'; this.style.transform='translateY(-50%) scale(1)';">
              &gt;
            </button>
            ` : ''}
          </div>
        </div>
      ` : ''}
      
      <!-- Metadata Fields in 2 Columns -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px;">
        <!-- Left Column -->
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <div>
            <div style="color: #9ca3af; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Students:</div>
            <div style="color: #e5e7eb; font-size: 14px; font-weight: 500;">${m.students_involved || '—'}</div>
          </div>
          <div>
            <div style="color: #9ca3af; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Teaching Artist:</div>
            <div style="color: #e5e7eb; font-size: 14px; font-weight: 500;">${m.artist_names || '—'}</div>
          </div>
        </div>
        
        <!-- Right Column -->
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <div>
            <div style="color: #9ca3af; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">School:</div>
            <div style="color: #e5e7eb; font-size: 14px; font-weight: 500;">${m.school || '—'}</div>
          </div>
          <div>
            <div style="color: #9ca3af; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Borough:</div>
            <div style="color: #e5e7eb; font-size: 14px; font-weight: 500;">${m.borough || '—'}</div>
          </div>
        </div>
      </div>
      
      <!-- Address — plain text, reverse-geocoded from lat/lng -->
      <div style="margin-bottom: 16px;">
        <div
           style="display:flex; align-items:flex-start; gap:10px; padding:11px 14px; background:rgba(59,130,246,0.08); border-radius:10px; border:1px solid rgba(59,130,246,0.25);">
             <div style="min-width:0;">
            <div style="color:#93c5fd; font-size:11px; text-transform:uppercase; letter-spacing:0.6px; font-weight:600; margin-bottom:3px;">
              Address
            </div>
            <div id="${popupId}-address-text" style="color:#bfdbfe; font-size:13.5px; line-height:1.4; font-weight:500;">
              Looking up address…
            </div>
          </div>
        </div>
      </div>

      <!-- Mural Description -->
      <div style="margin-bottom: 16px;">
        <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600; color: #ffffff; text-align: center; text-transform: uppercase; letter-spacing: 0.5px;">Mural Description</h3>
        <div style="color: #d1d5db; font-size: 14px; line-height: 1.6;">
          ${m.description || m.theme || 'No description available for this mural.'}
        </div>
      </div>

      <div style="display:flex; gap:12px; flex-wrap:wrap; margin-top: 12px;">
        <button id="${popupId}-directions"
          style="flex:1; border:none; border-radius:999px; background:#3b82f6; color:#0f172a; font-weight:600; padding:10px 18px; cursor:pointer; font-size:14px; font-family:system-ui,sans-serif;">
          Directions
        </button>
        <button id="${popupId}-focus"
          style="flex:1; border:1px solid rgba(148,163,184,0.4); border-radius:999px; background:transparent; color:#f3f4f6; font-weight:600; padding:10px 18px; cursor:pointer;">
          Center Map
        </button>
        ${m.detail_url ? `
        <a href="${m.detail_url}" target="_blank" rel="noopener"
          style="flex:1; text-align:center; text-decoration:none; border:none; border-radius:999px; background: linear-gradient(90deg, #34d399, #3b82f6); color:#0f172a; font-weight:600; padding:10px 18px; cursor:pointer; font-size: 14px; font-family: system-ui, sans-serif; display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-width: 120px;">
          Portfolio ↗
        </a>` : ''}
      </div>
    </div>
  `;

  infoWindow.setContent(html);
  infoWindow.open(map, marker);
  
  // Style the info window and set up close button functionality
  setTimeout(() => {
    const iwOuter = document.querySelector('.gm-style-iw-d');
    const iwContainer = document.querySelector('.gm-style-iw-c');
    
    if (iwOuter) {
      iwOuter.style.background = 'rgba(17,24,39,0.96)';
      iwOuter.style.color = '#e2e8f0';
      iwOuter.style.width = '500px';
      iwOuter.style.maxWidth = '500px';
      iwOuter.style.minWidth = '500px';
      // Allow the inner content div to handle its own scrolling
      iwOuter.style.overflow = 'visible';
      iwOuter.style.maxHeight = 'none';
    }
    
    if (iwContainer) {
      iwContainer.style.background = 'rgba(17,24,39,0.96)';
      iwContainer.style.width = '500px';
      iwContainer.style.maxWidth = '500px';
      iwContainer.style.minWidth = '500px';
      // Don't clip the inner scrollable div
      iwContainer.style.overflow = 'visible';
      iwContainer.style.maxHeight = 'none';
    }
    
    // Hide Google Maps' default close button since we have our own
    const iwCloseBtn = document.querySelector('.gm-ui-hover-effect');
    if (iwCloseBtn) {
      iwCloseBtn.style.display = 'none';
    }
    
    // Allow the inner popup div to scroll; keep outer wrappers transparent to overflow
    const scrollElements = document.querySelectorAll('.gm-style-iw-d, .gm-style-iw-c');
    scrollElements.forEach(el => {
      el.style.overflow = 'visible';
      el.style.maxHeight = 'none';
    });
    
    // Set up our custom close button
    const customCloseBtn = document.getElementById(`${popupId}-close`);
    if (customCloseBtn) {
      customCloseBtn.addEventListener('click', () => {
        infoWindow.close();
      });
    }

    const focusBtn = document.getElementById(`${popupId}-focus`);
    focusBtn?.addEventListener("click", () => {
      map.panTo({ lat: m.lat, lng: m.lng });
      if (map.getZoom() < 15) {
        map.setZoom(15);
      }
    });

    // ── Directions button ─────────────────────────────────────────────────────
    const directionsBtn = document.getElementById(`${popupId}-directions`);
    directionsBtn?.addEventListener("click", () => {
      if (!userLocation) {
        alert("Please set your starting location first using the address bar or GPS button in the sidebar.");
        return;
      }
      window.calculateTransitDirections(m.lat, m.lng, m.name);
    });
    // ─────────────────────────────────────────────────────────────────────────

    // ── Reverse-geocode the mural's lat/lng to get a real street address ──
    const cacheKey = `${m.lat},${m.lng}`;
    const addressTextEl = document.getElementById(`${popupId}-address-text`);

    if (addressTextEl) {
      if (geocodeCache.has(cacheKey)) {
        const cached = geocodeCache.get(cacheKey);
        addressTextEl.textContent = cached.formatted;
      } else if (geocoder) {
        geocoder.geocode({ location: { lat: m.lat, lng: m.lng } }, (results, status) => {
          let formatted;
          if (status === "OK" && results && results[0]) {
            formatted = results[0].formatted_address;
          } else {
            formatted = m.neighborhood
              ? `${m.neighborhood}, ${m.borough || 'New York'}, NY`
              : `${m.borough || 'New York'}, NY`;
          }
          geocodeCache.set(cacheKey, { formatted });
          const el = document.getElementById(`${popupId}-address-text`);
          if (el) el.textContent = formatted;
        });
      } else {
        addressTextEl.textContent = m.neighborhood
          ? `${m.neighborhood}, ${m.borough || 'New York'}, NY`
          : `${m.borough || 'New York'}, NY`;
      }
    }
    // ─────────────────────────────────────────────────────────────────────
  }, 100);
}

function applyFilters() {
  let filtered = allMurals.filter(m => {
    // Search filter
    if (activeFilters.search) {
      const searchLower = activeFilters.search.toLowerCase();
      if (!m.name.toLowerCase().includes(searchLower) &&
          !(m.school && m.school.toLowerCase().includes(searchLower)) &&
          !(m.artist_names && m.artist_names.toLowerCase().includes(searchLower))) {
        return false;
      }
    }

    // Year filter
    if (activeFilters.year !== null) {
      if (String(m.year) !== String(activeFilters.year)) {
        return false;
      }
    }

    // School filter
    if (activeFilters.school !== null) {
      if (m.school !== activeFilters.school) {
        return false;
      }
    }

    // Borough filter
    if (activeFilters.borough !== null) {
      if (m.borough !== activeFilters.borough) {
        return false;
      }
    }

    // Tour filter
    if (activeFilters.tour !== null) {
      if (activeFilters.tour.startsWith(CURATED_TOUR_PREFIX)) {
        const tourId = activeFilters.tour.replace(CURATED_TOUR_PREFIX, "");
        const entry = curatedTourStops.get(tourId);
        if (!entry || !entry.uidSet.has(m.uid)) {
          return false;
        }
      } else {
        const dataTourId = activeFilters.tour.replace(DATA_TOUR_PREFIX, "");
        if (m.tour_id !== dataTourId) {
          return false;
        }
      }
    }

    return true;
  });

  // Apply mural view percentage filter
  if (activeFilters.muralView < 100 && filtered.length > 0) {
    const targetCount = Math.ceil((filtered.length * activeFilters.muralView) / 100);
    // Randomly sample the filtered murals to show the percentage
    // Shuffle and take the first N
    const shuffled = [...filtered].sort(() => Math.random() - 0.5);
    filtered = shuffled.slice(0, targetCount);
  }

  currentVisibleMurals = filtered;
  updateTourPolyline();  // must run first — rebuilds tourStopNumbers from filtered stops
  createMarkers(filtered); // then markers are drawn using the updated tourStopNumbers

  if (userLocation) {
    renderNearestList(findNearestMurals());
  }
}

function populateFilters() {
  const years = new Set();
  const schools = new Set();
  const boroughs = new Set();
  const dataTours = new Set();

  allMurals.forEach(m => {
    if (m.year) years.add(m.year);
    if (m.school) schools.add(m.school);
    if (m.borough) boroughs.add(m.borough);
    if (m.tour_id) dataTours.add(m.tour_id);
  });

  const sortedYears    = Array.from(years).sort((a, b) => Number(b) - Number(a));
  const sortedSchools  = Array.from(schools).sort();
  const sortedBoroughs = Array.from(boroughs).sort();

  // ── helper: rebuild a <select> without losing the listener ────────────────
  function buildSelect(id, options, activeValue, onChangeFn) {
    const sel = document.getElementById(id);
    if (!sel) return;
    // Preserve only the first "All …" option then re-add the rest
    const placeholder = sel.options[0]?.text || "All";
    sel.innerHTML = `<option value="">${placeholder}</option>`;
    options.forEach(({ value, label }) => {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = label;
      if (value === activeValue) opt.selected = true;
      sel.appendChild(opt);
    });
    // Attach listener once — remove previous clone trick
    const fresh = sel.cloneNode(true);
    sel.parentNode.replaceChild(fresh, sel);
    fresh.addEventListener("change", (e) => onChangeFn(e.target.value || null));
  }

  // Year
  buildSelect(
    "yearFilter",
    sortedYears.map(y => ({ value: y, label: y })),
    activeFilters.year,
    (val) => { activeFilters.year = val; applyFilters(); }
  );

  // Schools
  buildSelect(
    "schoolsFilter",
    sortedSchools.map(s => ({ value: s, label: s })),
    activeFilters.school,
    (val) => { activeFilters.school = val; applyFilters(); }
  );

  // Borough
  buildSelect(
    "boroughFilter",
    sortedBoroughs.map(b => ({ value: b, label: b })),
    activeFilters.borough,
    (val) => { activeFilters.borough = val; applyFilters(); }
  );

  // Tours
  const curatedOpts = curatedTours
    .map(t => ({ value: `${CURATED_TOUR_PREFIX}${t.id}`, label: t.name }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const dataOpts = Array.from(dataTours)
    .filter(Boolean).sort()
    .map(id => ({ value: `${DATA_TOUR_PREFIX}${id}`, label: `Tour ${id}` }));

  buildSelect(
    "toursFilter",
    [...curatedOpts, ...dataOpts],
    activeFilters.tour,
    (val) => { activeFilters.tour = val; applyFilters(); }
  );
}

function setupViewAllModals({ schools = [], boroughs = [], tours = [] } = {}) {
  modalData = { schools, boroughs, tours };
  const modal = document.getElementById("viewAllModal");
  const modalTitle = document.getElementById("modalTitle");
  const modalBody = document.getElementById("modalBody");
  const modalClose = document.getElementById("modalClose");

  function openModal(filterType) {
    modalBody.innerHTML = "";
    let title = "";
    let items = [];

    if (filterType === "school") {
      title = "All Schools / Sites";
      items = modalData.schools;
    } else if (filterType === "borough") {
      title = "All Boroughs";
      items = modalData.boroughs;
    } else {
      title = "All Tours";
      items = modalData.tours;
    }

    modalTitle.textContent = title;

    items.forEach(item => {
      const value = filterType === "tour" ? item.id : item;
      const label = filterType === "tour" ? item.label : item;

      const div = document.createElement("div");
      div.className = "modal-item";
      if (filterType === "school" && activeFilters.school === value) div.classList.add("active");
      if (filterType === "borough" && activeFilters.borough === value) div.classList.add("active");
      if (filterType === "tour" && activeFilters.tour === value) div.classList.add("active");

      div.textContent = label;
      div.addEventListener("click", () => {
        if (filterType === "school") {
          activeFilters.school = activeFilters.school === value ? null : value;
        } else if (filterType === "borough") {
          activeFilters.borough = activeFilters.borough === value ? null : value;
        } else if (filterType === "tour") {
          activeFilters.tour = activeFilters.tour === value ? null : value;
        }
        applyFilters();
        populateFilters();
        modal.classList.add("hidden");
      });
      modalBody.appendChild(div);
    });

    modal.classList.remove("hidden");
  }

  if (!modalListenersBound) {
    document.getElementById("schoolsViewAll")?.addEventListener("click", () => openModal("school"));
    document.getElementById("boroughViewAll")?.addEventListener("click", () => openModal("borough"));
    document.getElementById("toursViewAll")?.addEventListener("click", () => openModal("tour"));

    modalClose?.addEventListener("click", () => {
      modal.classList.add("hidden");
    });

    modal?.addEventListener("click", e => {
      if (e.target === modal) {
        modal.classList.add("hidden");
      }
    });

    modalListenersBound = true;
  }
}

function setupSearch() {
  const searchInput = document.getElementById("searchInput");
  if (!searchInput) return;

  let searchTimeout;
  searchInput.addEventListener("input", (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      activeFilters.search = e.target.value;
      applyFilters();
    }, 300); // Debounce search
  });
}

function setupMuralView() {
  const slider = document.getElementById("muralViewSlider");
  const label  = document.getElementById("muralViewLabel");

  function syncTrack(val) {
    if (slider) slider.style.setProperty('--val', val);
  }

  if (slider) {
    syncTrack(slider.value); // initialise fill on load
    slider.addEventListener("input", () => {
      const val = parseInt(slider.value);
      if (label) label.textContent = `${val}%`;
      syncTrack(val);
      activeFilters.muralView = val;
      applyFilters();
    });
  }
  // Initialise the inline address search
  setupManualLocationSearch();
}

function initLayoutControls() {
  const hideBtn = document.getElementById("sidebarHideBtn");
  const showTab = document.getElementById("sidebarShowTab");
  const sidebar = document.getElementById("sidebar");
  const body = document.body;
  const mq = window.matchMedia("(max-width: 768px)");

  function updateSidebarVisibility(isVisible) {
    if (isVisible) {
      sidebar?.classList.remove("hidden");
      showTab?.classList.add("hidden");
      showTab?.setAttribute("aria-expanded", "true");
    } else {
      sidebar?.classList.add("hidden");
      showTab?.classList.remove("hidden");
      showTab?.setAttribute("aria-expanded", "false");
    }
  }

  function syncSidebarState() {
    if (!mq.matches) {
      body.classList.add("sidebar-open");
      updateSidebarVisibility(true);
    } else {
      body.classList.remove("sidebar-open");
      updateSidebarVisibility(false);
    }
  }

  syncSidebarState();
  mq.addEventListener("change", syncSidebarState);

  // Hide sidebar button
  hideBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    updateSidebarVisibility(false);
  });

  // Show sidebar tab (left edge)
  showTab?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    updateSidebarVisibility(true);
  });
}

function setupNearestControls() {
  // The Clear button and GPS button are now wired inside setupManualLocationSearch().
  // This function is kept as a no-op so existing initMap call doesn't break.
}

function setLocateButtonState(isLoading) {
  const locateBtn = document.getElementById("locateMeBtn");
  if (!locateBtn) return;
  locateBtn.disabled = isLoading;
  locateBtn.textContent = isLoading ? "Locating…" : "Find Murals Near Me";
}

function requestUserLocation() {
  if (!navigator.geolocation) {
    renderNearestList([], "Geolocation is not supported in this browser.");
    return;
  }
  setLocateButtonState(true);
  navigator.geolocation.getCurrentPosition(handleLocationSuccess, handleLocationError, LOCATION_OPTIONS);
}

function handleLocationSuccess(position) {
  setLocateButtonState(false);
  const coords = {
    lat: position.coords.latitude,
    lng: position.coords.longitude
  };
  userLocation = coords;
  setUserLocationMarker(coords, position.coords.accuracy);
  const nearest = findNearestMurals();
  renderNearestList(nearest);

  const clearBtn = document.getElementById("clearLocationBtn");
  if (clearBtn) {
    clearBtn.disabled = false;
  }
}

function handleLocationError(error) {
  setLocateButtonState(false);
  console.error("Geolocation error", error);
  const message =
    error.code === error.PERMISSION_DENIED
      ? "Location permission denied. Enable it in your browser and try again."
      : "Unable to fetch your location. Please try again.";
  renderNearestList([], message);
}

function setUserLocationMarker(position, accuracyMeters = 50) {
  if (!map) return;

  if (!userLocationMarker) {
    userLocationMarker = new google.maps.Marker({
      map,
      zIndex: google.maps.Marker.MAX_ZINDEX + 1,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 8,
        fillColor: "#60a5fa",
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeWeight: 2
      }
    });
  }

  userLocationMarker.setPosition(position);
  userLocationMarker.setMap(map);

  if (userAccuracyCircle) {
    userAccuracyCircle.setMap(null);
  }

  userAccuracyCircle = new google.maps.Circle({
    map,
    center: position,
    radius: Math.max(accuracyMeters, 30),
    fillColor: "#60a5fa",
    fillOpacity: 0.1,
    strokeColor: "#60a5fa",
    strokeOpacity: 0.4,
    strokeWeight: 1
  });

  map.panTo(position);
  if (map.getZoom() < 14) {
    map.setZoom(14);
  }
}

function clearUserLocation() {
  userLocation = null;
  
  if (userLocationMarker) {
    userLocationMarker.setMap(null);
    userLocationMarker = null;
  }
  if (userAccuracyCircle) {
    userAccuracyCircle.setMap(null);
    userAccuracyCircle = null;
  }

  // ==========================================
  // NEW CODE: Clear the transit routes!
  // ==========================================
  if (typeof routeRenderers !== 'undefined' && routeRenderers.length > 0) {
    routeRenderers.forEach(renderer => renderer.setMap(null));
    routeRenderers = []; // Empty the array
  }
  
  if (typeof directionsRenderer !== 'undefined' && directionsRenderer) {
    directionsRenderer.setMap(null); 
    directionsRenderer = new google.maps.DirectionsRenderer({ map: map }); 
  }
  // ==========================================

  const clearBtn = document.getElementById("clearLocationBtn");
  if (clearBtn) {
    clearBtn.disabled = true;
  }
  
  renderNearestList();
}

function findNearestMurals(limit = 4) {
  if (!userLocation) return [];
  const source = currentVisibleMurals.length ? currentVisibleMurals : allMurals;
  return source
    .map(mural => {
      const distance = calculateDistanceMeters(userLocation, { lat: mural.lat, lng: mural.lng });
      return { ...mural, distance };
    })
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);
}

function renderNearestList(results = null, customMessage = "") {
  // We no longer render mural distance cards in the sidebar.
  // The address search bar is the sole UX entry point.
  // We only update the container to show status text (errors, location confirmed, etc.)
  const container = document.getElementById("nearestResults");
  if (!container) return;

  container.innerHTML = "";

  if (customMessage) {
    // Show error messages (e.g. permission denied) as plain text
    container.classList.remove("empty");
    const message = document.createElement("p");
    message.textContent = customMessage;
    container.appendChild(message);
    return;
  }

  if (results && results.length) {
    // Location is set — confirm quietly so user knows they can click a pin
    container.classList.remove("empty");
    const msg = document.createElement("p");
    msg.textContent = `Location set. Click any pin and tap "Directions".`;
    container.appendChild(msg);
    return;
  }

  // Default empty state — no message needed, search bar speaks for itself
  container.classList.add("empty");
}

function focusOnMuralByUid(uid) {
  const marker = markers.find(m => m.mural.uid === uid);
  if (marker) {
    map.panTo(marker.getPosition());
    if (map.getZoom() < 15) {
      map.setZoom(15);
    }
    google.maps.event.trigger(marker, "click");
  }
}

// --- CITY COUNCIL DISTRICTS LAYER ---
    // 1. Load the official NYC Council District GeoJSON
    // Around Line 1880 in map.js

// Called by Google Maps JS API via callback parameter in index.html
async function initMap() {
  try {
    // Layout controls should already be initialized, but ensure they are
    if (typeof initLayoutControls === 'function') {
      infoWindow = new google.maps.InfoWindow();
      try {
        initLayoutControls();
      } catch (e) {
        console.error('Error re-initializing layout controls:', e);
      }
    }
    setupNearestControls();
    showError(false);
    showLoading(true);
    
    // Handle the 'Clear' button in the sidebar
const clearBtn = document.getElementById('clear-filters'); // Use the ID from your HTML
if (clearBtn) {
  clearBtn.addEventListener('click', () => {
    // 1. Clear the routes
    clearMapRoutes();
    
    // 2. Clear the address input field
    const addressInput = document.getElementById('address-input');
    if (addressInput) addressInput.value = "";
    
    // 3. Reset userLocation so new directions aren't based on old data
    userLocation = null;
    
    console.log("Map routes and inputs cleared.");
  });
}


    map = new google.maps.Map(document.getElementById("map"), {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      styles: DARK_MAP_STYLE,
      disableDefaultUI: false,
      zoomControl: true,
      mapTypeControl: false,
      scaleControl: true,
      streetViewControl: false,
      rotateControl: false,
      fullscreenControl: true
    });
    // Initialize Directions Services
    directionsService = new google.maps.DirectionsService();
    directionsRenderer = new google.maps.DirectionsRenderer({
      suppressMarkers: false, 
      polylineOptions: {
        strokeColor: "#3b82f6",
        strokeWeight: 5,
        strokeOpacity: 0.8
      }
    });
    directionsRenderer.setMap(map);

    // ── Transit layer: shows subway/bus lines on the dark map ──────────────
    const transitLayer = new google.maps.TransitLayer();
    transitLayer.setMap(map);
    // ──────────────────────────────────────────────────────────────────────
    

    infoWindow = new google.maps.InfoWindow({
      maxWidth: 500
    });

    // Initialise the Geocoder used for reverse-geocoding mural lat/lng → street address
    geocoder = new google.maps.Geocoder();

    const murals = await loadMuralsFromSheet();
    console.log(`Loaded ${murals.length} murals from CSV`);
    allMurals = murals;
    buildCuratedTours();

    if (murals.length === 0) {
      throw new Error("No murals found in CSV. Check that the CSV has valid data with 'mural_title', 'lat', and 'lng' columns.");
    }

    createMarkers(murals);
    currentVisibleMurals = murals;
    populateFilters();
    setupSearch();
    setupMuralView();

// --- CITY COUNCIL DISTRICTS LAYER ---
// 1. Array to keep track of the text labels so we can toggle them on/off
const districtLabels = [];

// 2. Load the GeoJSON file
map.data.loadGeoJson('City_Council_Districts.geojson');

// 3. Style the district lines
map.data.setStyle({
  fillColor: 'transparent', 
  strokeColor: '#c24f02',
  strokeWeight: 1,           
  clickable: true            
});

// 4. As each district loads, find its center and add a text number
map.data.addListener('addfeature', function(e) {
  // Grab the district number using the correct property name
  const distNum = e.feature.getProperty('coundist'); 
  if (!distNum) return; // Skip if no number is found

  // Calculate the bounding box and center of the district
  const bounds = new google.maps.LatLngBounds();
  e.feature.getGeometry().forEachLatLng(function(latLng) {
    bounds.extend(latLng);
  });
  const center = bounds.getCenter();

  // Create a marker at the center with text, but make the pin itself invisible
  const labelMarker = new google.maps.Marker({
    position: center,
    map: map,
    zIndex: 999, // <--- ADD THIS LINE HERE
    label: {
      text: `Council District ${distNum}`,
      color: '#FFFFFF',
      fontSize: '10px',
      fontWeight: 'bold'
    },
    icon: {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 0               // Makes the standard red pin completely invisible
    }
  });

  // Save it to our array
  districtLabels.push(labelMarker);
});

// 5. Update the toggle switch to hide/show both the lines AND the numbers
const districtToggle = document.getElementById('toggleDistricts');
if (districtToggle) {
  districtToggle.addEventListener('change', (e) => {
    const isVisible = e.target.checked;
    
    // Toggle the lines
    if (isVisible) {
      map.data.setStyle({ strokeColor: '#c24f02', strokeWeight: 1, strokeOpacity: 1.0, fillColor: 'transparent' });
    } else {
      map.data.setStyle({ strokeOpacity: 0, fillOpacity: 0 });
    }

    // Toggle the text numbers
    districtLabels.forEach(marker => {
      marker.setMap(isVisible ? map : null);
    });
  });
}
    // Keep default view centered on NYC - don't fit bounds to avoid zooming out to show all markers
    // The map is already initialized with DEFAULT_CENTER and DEFAULT_ZOOM for NYC
  } catch (err) {
    console.error(err);
    const errorMessage = err.message || "There was a problem loading mural data. Check the CSV URL or network connection.";
    showError(true, errorMessage);
  } finally {
    showLoading(false);
  }
}

/**
 * Fires four parallel direction requests — walking, bicycling, bus, and train —
 * and draws each as a distinct coloured polyline on the map simultaneously.
 * Clears any previously drawn routes first. Closes the popup so routes are visible.
 *
 * Colours:
 *   🟢 Green  — walking
 *   🟡 Yellow — bicycling
 *   🔵 Blue   — bus (TRANSIT, BUS mode)
 *   🟠 Orange — train / subway (TRANSIT, SUBWAY + RAIL mode)
 */
// ─── DIRECTIONS PANEL ────────────────────────────────────────────────────────
// Injects a full-featured directions panel into the map (below the popup).
// Shows travel time per mode, multiple route alternatives, step-by-step
// instructions, and a departure-time selector — mirroring Google Maps.

let directionsPanel = null; // The injected panel DOM element
let activeModeTab   = 'TRANSIT'; // Currently selected travel mode

/**
 * Master entry point called by the Directions button in the popup.
 * Builds or re-uses the panel, then fetches all travel modes in parallel.
 */
window.calculateTransitDirections = function(destLat, destLng, destName) {
  if (!userLocation) {
    alert("Please set your starting location first using the address bar or GPS button in the sidebar.");
    return;
  }

  // Close the mural popup so the panel has room
  if (infoWindow) infoWindow.close();

  // Clear previously drawn route lines
  routeRenderers.forEach(r => r.setMap(null));
  routeRenderers = [];
  if (directionsRenderer) directionsRenderer.setMap(null);

  const origin      = new google.maps.LatLng(userLocation.lat, userLocation.lng);
  const destination = new google.maps.LatLng(parseFloat(destLat), parseFloat(destLng));
  const label       = destName || 'Mural';

  // Build or reset the panel
  _buildDirectionsPanel(label, destLat, destLng);

  // Travel modes to query in parallel
  const modes = [
    { key: 'TRANSIT',   label: 'Transit',  color: '#65FE08', travelMode: google.maps.TravelMode.TRANSIT   },
    { key: 'WALKING',   label: 'Walk',      color: '#3b82f6', travelMode: google.maps.TravelMode.WALKING   },
    { key: 'DRIVING',   label: 'Drive',     color: '#FE1CCF', travelMode: google.maps.TravelMode.DRIVING   },
    { key: 'BICYCLING', label: 'Bike',      color: '#F3FF00', travelMode: google.maps.TravelMode.BICYCLING },
  ];

  // Fetch all modes and populate panel tabs + route list
  const results = {};
  let completed = 0;

  modes.forEach(mode => {
    const req = {
      origin,
      destination,
      travelMode: mode.travelMode,
      provideRouteAlternatives: true,
      ...(mode.key === 'TRANSIT' ? {
        transitOptions: { departureTime: new Date() }
      } : {})
    };

    directionsService.route(req, (response, status) => {
      completed++;
      if (status === 'OK') {
        results[mode.key] = { response, mode };
        _updateModeTab(mode.key, response, mode);
      } else {
        _updateModeTab(mode.key, null, mode);
      }
      // Once all requests are in, draw the active mode
      if (completed === modes.length) {
        _drawMode(results, activeModeTab, origin, destination);
        _showRouteList(results, activeModeTab, origin, destination);
      }
    });
  });

  // Tab click handler — redraw route and update list when user switches modes
  window._directionsSelectMode = function(modeKey) {
    activeModeTab = modeKey;

    // Scope to the panel so the query always resolves regardless of DOM position
    const tabContainer = directionsPanel || document;
    tabContainer.querySelectorAll('.dir-tab').forEach(t => {
      const isActive = t.dataset.mode === modeKey;
      t.classList.toggle('dir-tab--active', isActive);
      if (isActive) {
        t.style.border      = '1px solid rgba(59,130,246,0.6)';
        t.style.background  = 'rgba(59,130,246,0.22)';
        t.style.color       = '#93c5fd';
      } else {
        t.style.border      = '1px solid rgba(148,163,184,0.15)';
        t.style.background  = 'rgba(15,23,42,0.5)';
        t.style.color       = '#64748b';
      }
    });

    _drawMode(results, modeKey, origin, destination);
    _showRouteList(results, modeKey, origin, destination);
  };
};

/** Inject / reset the directions panel below the map controls */
function _buildDirectionsPanel(label, destLat, destLng) {
  // Remove old panel if present
  if (directionsPanel) {
    directionsPanel.remove();
    directionsPanel = null;
  }

  // Calculate position flush against the right edge of the sidebar
  const sidebar   = document.getElementById('sidebar');
  const sidebarLeft  = sidebar ? sidebar.offsetLeft  : 72;
  const sidebarTop   = sidebar ? sidebar.offsetTop   : 16;
  const sidebarWidth = sidebar ? sidebar.offsetWidth : 380;
  const gap = 10; // px gap between sidebar and panel

  const panel = document.createElement('div');
  panel.id = 'directions-panel';
  panel.style.cssText = `
    position: absolute;
    top: ${sidebarTop}px;
    left: ${sidebarLeft + sidebarWidth + gap}px;
    width: 360px;
    max-height: calc(100vh - ${sidebarTop + 16}px);
    background: var(--panel-bg, rgba(17,24,39,0.92));
    border: 1px solid var(--panel-border, rgba(148,163,184,0.16));
    border-radius: 5px;
    box-shadow: var(--panel-shadow, 0 25px 70px rgba(2,6,23,0.55));
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    z-index: 10;
    display: flex;
    flex-direction: column;
    font-family: system-ui, sans-serif;
    color: #e2e8f0;
    overflow: hidden;
    opacity: 0;
    transform: translateX(-8px);
    transition: opacity 0.25s ease, transform 0.25s ease;
  `;

  panel.innerHTML = `
    <!-- Header: label left, × right, nothing else on this row -->
    <div style="display:flex; align-items:flex-start; justify-content:space-between;
                padding:14px 14px 12px; border-bottom:1px solid rgba(148,163,184,0.12); flex-shrink:0;">
      <div style="min-width:0; padding-right:10px;">
        <div style="font-size:10px; color:#64748b; text-transform:uppercase; letter-spacing:0.8px; margin-bottom:3px;">Directions to</div>
        <div style="font-size:14px; font-weight:600; color:#f1f5f9; line-height:1.35;
                    overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">
          ${label}
        </div>
      </div>
      <button id="dir-panel-close"
        style="flex-shrink:0; background:rgba(148,163,184,0.1); border:none; color:#94a3b8;
               font-size:16px; line-height:1; width:28px; height:28px; border-radius:50%;
               cursor:pointer; display:flex; align-items:center; justify-content:center; margin-top:1px;">×</button>
    </div>

    <!-- Mode tabs: 4 equal columns, icon + label + time, compact -->
    <div id="dir-tabs" style="display:grid; grid-template-columns:repeat(4,1fr);
                               padding:10px 10px 0; gap:6px; flex-shrink:0;">
      <button class="dir-tab dir-tab--active" data-mode="TRANSIT"
        onclick="window._directionsSelectMode('TRANSIT')"
        style="display:flex; flex-direction:column; align-items:center; gap:2px; padding:8px 4px;
               border-radius:8px; border:1px solid rgba(59,130,246,0.5);
               background:rgba(59,130,246,0.15); color:#93c5fd; cursor:pointer;">
        <span style="line-height:1;"><svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 -960 960 960" width="18px" fill="currentColor"><path d="M297.5-422.5Q280-405 280-380t17.5 42.5Q315-320 340-320t42.5-17.5Q400-355 400-380t-17.5-42.5Q365-440 340-440t-42.5 17.5Zm532.5-93Q880-471 880-400v160q0 33-23.5 56.5T800-160l80 80H520l80-80q-33 0-56.5-23.5T520-240v-160q0-71 50-115.5T700-560q80 0 130 44.5ZM679-291q-9 9-9 21t9 21q9 9 21 9t21-9q9-9 9-21t-9-21q-9-9-21-9t-21 9Zm-91-149q-4 9-6 19t-2 21v40h240v-40q0-11-2-21t-6-19H588ZM480-880q172 0 246 37t74 123v96q-18-6-38-9.5t-42-5.5v-41H240v120h260q-16 17-27.5 37T453-480H240v120q0 33 23.5 56.5T320-280h120v80H320v40q0 17-11.5 28.5T280-120h-40q-17 0-28.5-11.5T200-160v-82q-18-20-29-44.5T160-340v-380q0-83 77-121.5T480-880Zm2 120h224-448 224Zm-224 0h448q-15-17-64.5-28.5T482-800q-107 0-156.5 12.5T258-760Zm195 280Z"/></svg></span>
        <span style="font-size:10px; font-weight:600;">Transit</span>
        <span id="dir-time-TRANSIT" style="font-size:10px; color:#94a3b8;">…</span>
      </button>
      <button class="dir-tab" data-mode="WALKING"
        onclick="window._directionsSelectMode('WALKING')"
        style="display:flex; flex-direction:column; align-items:center; gap:2px; padding:8px 4px;
               border-radius:8px; border:1px solid rgba(148,163,184,0.15);
               background:rgba(15,23,42,0.5); color:#64748b; cursor:pointer;">
        <span style="line-height:1;"><svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 -960 960 960" width="18px" fill="currentColor"><path d="m280-40 112-564-72 28v136h-80v-188l202-86q14-6 29.5-7t29.5 4q14 5 26.5 14t20.5 23l40 64q26 42 70.5 69T760-520v80q-70 0-125-29t-94-74l-25 123 84 80v300h-80v-260l-84-64-72 324h-84Zm203.5-723.5Q460-787 460-820t23.5-56.5Q507-900 540-900t56.5 23.5Q620-853 620-820t-23.5 56.5Q573-740 540-740t-56.5-23.5Z"/></svg></span>
        <span style="font-size:10px; font-weight:600;">Walk</span>
        <span id="dir-time-WALKING" style="font-size:10px; color:#94a3b8;">…</span>
      </button>
      <button class="dir-tab" data-mode="DRIVING"
        onclick="window._directionsSelectMode('DRIVING')"
        style="display:flex; flex-direction:column; align-items:center; gap:2px; padding:8px 4px;
               border-radius:8px; border:1px solid rgba(148,163,184,0.15);
               background:rgba(15,23,42,0.5); color:#64748b; cursor:pointer;">
        <span style="line-height:1;"><svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 -960 960 960" width="18px" fill="currentColor"><path d="M240-200v40q0 17-11.5 28.5T200-120h-40q-17 0-28.5-11.5T120-160v-320l84-240q6-18 21.5-29t34.5-11h440q19 0 34.5 11t21.5 29l84 240v320q0 17-11.5 28.5T800-120h-40q-17 0-28.5-11.5T720-160v-40H240Zm-8-360h496l-42-120H274l-42 120Zm-32 80v200-200Zm100 160q25 0 42.5-17.5T360-380q0-25-17.5-42.5T300-440q-25 0-42.5 17.5T240-380q0 25 17.5 42.5T300-320Zm360 0q25 0 42.5-17.5T720-380q0-25-17.5-42.5T660-440q-25 0-42.5 17.5T600-380q0 25 17.5 42.5T660-320Zm-460 40h560v-200H200v200Z"/></svg></span>
        <span style="font-size:10px; font-weight:600;">Drive</span>
        <span id="dir-time-DRIVING" style="font-size:10px; color:#94a3b8;">…</span>
      </button>
      <button class="dir-tab" data-mode="BICYCLING"
        onclick="window._directionsSelectMode('BICYCLING')"
        style="display:flex; flex-direction:column; align-items:center; gap:2px; padding:8px 4px;
               border-radius:8px; border:1px solid rgba(148,163,184,0.15);
               background:rgba(15,23,42,0.5); color:#64748b; cursor:pointer;">
        <span style="line-height:1;"><svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 -960 960 960" width="18px" fill="currentColor"><path d="M200-80q-83 0-141.5-58.5T0-280q0-83 58.5-141.5T200-480q83 0 141.5 58.5T400-280q0 83-58.5 141.5T200-80Zm85-115q35-35 35-85t-35-85q-35-35-85-35t-85 35q-35 35-35 85t35 85q35 35 85 35t85-35Zm155-5v-200L312-512q-12-11-18-25.5t-6-30.5q0-16 6.5-30.5T312-624l112-112q12-12 27.5-18t32.5-6q17 0 32.5 6t27.5 18l76 76q28 28 64 44t76 16v80q-57 0-108.5-22T560-604l-32-32-96 96 88 92v248h-80Zm123.5-563.5Q540-787 540-820t23.5-56.5Q587-900 620-900t56.5 23.5Q700-853 700-820t-23.5 56.5Q653-740 620-740t-56.5-23.5ZM760-80q-83 0-141.5-58.5T560-280q0-83 58.5-141.5T760-480q83 0 141.5 58.5T960-280q0 83-58.5 141.5T760-80Zm85-115q35-35 35-85t-35-85q-35-35-85-35t-85 35q-35 35-35 85t35 85q35 35 85 35t85-35Z"/></svg></span>
        <span style="font-size:10px; font-weight:600;">Bike</span>
        <span id="dir-time-BICYCLING" style="font-size:10px; color:#94a3b8;">…</span>
      </button>
    </div>

    <!-- Route list -->
    <div id="dir-route-list"
      style="overflow-y:auto; padding:10px 12px 16px; flex:1; scrollbar-width:thin;
             scrollbar-color:rgba(148,163,184,0.3) transparent;">
      <div style="text-align:center; color:#64748b; padding:24px 0; font-size:13px;">
        Fetching routes…
      </div>
    </div>
  `;

  // Append to #app so it sits beside the sidebar, not inside it
  document.getElementById('app').appendChild(panel);
  directionsPanel = panel;

  // Trigger slide-in on next frame
  requestAnimationFrame(() => {
    panel.style.opacity   = '1';
    panel.style.transform = 'translateX(0)';
  });

  // Close button
  panel.querySelector('#dir-panel-close').addEventListener('click', () => {
    panel.remove();
    directionsPanel = null;
    routeRenderers.forEach(r => r.setMap(null));
    routeRenderers = [];
    if (directionsRenderer) directionsRenderer.setMap(null);
  });

}

/** Update a mode tab's time estimate once its request returns */
function _updateModeTab(modeKey, response, mode) {
  const timeEl = document.getElementById(`dir-time-${modeKey}`);
  if (!timeEl) return;
  if (!response) {
    timeEl.textContent = 'N/A';
    return;
  }
  // Best duration across all routes for this mode
  const best = response.routes.reduce((min, r) => {
    const secs = r.legs[0]?.duration?.value || Infinity;
    return secs < min ? secs : min;
  }, Infinity);
  timeEl.textContent = best === Infinity ? 'N/A' : _fmtDuration(best);
}

/** Returns polylineOptions for a given mode key.
 *  Walking gets a blue dotted line matching the transit walking segments. */
function _polylineOpts(modeKey, fallbackColor) {
  if (modeKey === 'WALKING') {
    return {
      strokeColor:   '#3b82f6',
      strokeOpacity: 0,           // hide the solid line
      strokeWeight:  4,
      icons: [{
        icon: {
          path:         google.maps.SymbolPath.CIRCLE,
          fillColor:    '#3b82f6',
          fillOpacity:  1,
          strokeColor:  '#3b82f6',
          strokeOpacity:1,
          scale:        3
        },
        offset: '0',
        repeat: '12px'            // dot spacing
      }]
    };
  }
  return { strokeColor: fallbackColor, strokeWeight: 5, strokeOpacity: 0.85 };
}

/** Draw the route line for the selected mode */
function _drawMode(results, modeKey, origin, destination) {
  routeRenderers.forEach(r => r.setMap(null));
  routeRenderers = [];
  if (directionsRenderer) directionsRenderer.setMap(null);

  const entry = results[modeKey];
  if (!entry) return;

  const colors = { TRANSIT:'#65FE08', WALKING:'#3b82f6', DRIVING:'#FE1CCF', BICYCLING:'#F3FF00' };
  const color  = colors[modeKey] || '#3b82f6';

  const renderer = new google.maps.DirectionsRenderer({
    map,
    directions: entry.response,
    routeIndex: 0,
    suppressMarkers: false,
    polylineOptions: _polylineOpts(modeKey, color)
  });
  routeRenderers.push(renderer);
}

/** Render route alternatives + step-by-step for the selected mode */
function _showRouteList(results, modeKey, origin, destination) {
  const listEl = document.getElementById('dir-route-list');
  if (!listEl) return;

  const entry = results[modeKey];
  if (!entry) {
    listEl.innerHTML = `
      <div style="text-align:center; color:#ef4444; padding:20px 0; font-size:13px;">
        No routes available for this mode.
      </div>`;
    return;
  }

  const routes   = entry.response.routes;
  const mode     = entry.mode;
  const colors   = { TRANSIT:'#65FE08', WALKING:'#3b82f6', DRIVING:'#FE1CCF', BICYCLING:'#F3FF00' };
  const color    = colors[modeKey] || '#3b82f6';

  listEl.innerHTML = '';

  routes.forEach((route, idx) => {
    const leg      = route.legs[0];
    const duration = leg.duration?.text || '?';
    const distance = leg.distance?.text || '?';
    const summary  = route.summary || '';
    const isBest   = idx === 0;

    // Build transit step chips (bus lines, subway lines, walk segments)
    let stepsHtml = '';
    if (modeKey === 'TRANSIT') {
      const chips = leg.steps.map(step => {
        if (step.travel_mode === 'WALKING') {
          return `<span ...>
  <svg xmlns="http://www.w3.org/2000/svg" height="14px" viewBox="0 -960 960 960" width="14px" fill="#F3F3F3">
    <path d="m280-40 112-564-72 28v136h-80v-188l202-86q14-6 29.5-7t29.5 4q14 5 26.5 14t20.5 23l40 64q26 42 70.5 69T760-520v80q-70 0-125-29t-94-74l-25 123 84 80v300h-80v-260l-84-64-72 324h-84Zm203.5-723.5Q460-787 460-820t23.5-56.5Q507-900 540-900t56.5 23.5Q620-853 620-820t-23.5 56.5Q573-740 540-740t-56.5-23.5Z"/>
  </svg>
  ${step.duration?.text}
</span>`;
        }
        if (step.travel_mode === 'TRANSIT') {
          const t = step.transit;
          const lineName  = t?.line?.short_name || t?.line?.name || '';
          const lineColor = t?.line?.color ? `#${t.line.color}` : color;
          const lineText  = t?.line?.text_color ? `#${t.line.text_color}` : '#ffffff';
          const vehicle   = t?.line?.vehicle?.type || '';
          const emoji     = vehicle === 'SUBWAY' ? '<svg xmlns="http://www.w3.org/2000/svg" height="14px" viewBox="0 -960 960 960" width="14px" fill="#F3F3F3"><path d="M240-120v-40l60-40q-59 0-99.5-40.5T160-340v-380q0-83 77-121.5T480-880q172 0 246 37t74 123v380q0 59-40.5 99.5T660-200l60 40v40H240Zm0-440h200v-120H240v120Zm420 80H240h480-60Zm-140-80h200v-120H520v120ZM382.5-337.5Q400-355 400-380t-17.5-42.5Q365-440 340-440t-42.5 17.5Q280-405 280-380t17.5 42.5Q315-320 340-320t42.5-17.5Zm280 0Q680-355 680-380t-17.5-42.5Q645-440 620-440t-42.5 17.5Q560-405 560-380t17.5 42.5Q595-320 620-320t42.5-17.5ZM300-280h360q26 0 43-17t17-43v-140H240v140q0 26 17 43t43 17Zm180-520q-86 0-142.5 10T258-760h448q-18-20-74.5-30T480-800Zm0 40h226-448 222Z"/></svg>'
                          : vehicle === 'BUS'    ? '<svg xmlns="http://www.w3.org/2000/svg" height="14px" viewBox="0 -960 960 960" width="14px" fill="#F3F3F3"><path d="M264-144q-10.2 0-17.1-6.9-6.9-6.9-6.9-17.1v-85q-23-19-35.5-47T192-360v-360q0-72 58-108t230-36q171 0 229.5 36T768-720v360q0 32-12.5 60T720-253v85q0 10.2-6.9 17.1-6.9 6.9-17.1 6.9h-48q-10.2 0-17.1-6.9-6.9-6.9-6.9-17.1v-48H336v48q0 10.2-6.9 17.1-6.9 6.9-17.1 6.9h-48Zm218.18-600H692 269h213.18ZM624-480H264h432-72Zm-360-72h432v-120H264v120Zm130 202q14-14 14-34t-14-34q-14-14-34-14t-34 14q-14 14-14 34t14 34q14 14 34 14t34-14Zm240 0q14-14 14-34t-14-34q-14-14-34-14t-34 14q-14 14-14 34t14 34q14 14 34 14t34-14ZM269-744h423q-20-29-66-38.5T480-792q-93 0-140.5 10T269-744Zm67.06 456h288.22Q654-288 675-309.15T696-360v-120H264v120q0 30 21.17 51 21.16 21 50.89 21Z"/></svg>'
                          : vehicle === 'RAIL'   ? '<svg xmlns="http://www.w3.org/2000/svg" height="14px" viewBox="0 -960 960 960" width="14px" fill="#F3F3F3"><path d="M264-144v-24l50-50q-53-9-87.5-49T192-360v-360q0-72 66-108t222-36q156 0 222 36t66 108v360q0 53-34.5 93T646-218l50 50v24H264Zm0-408h432v-120H264v120Zm378 72H264h432-54ZM514-350q14-14 14-34t-14-34q-14-14-34-14t-34 14q-14 14-14 34t14 34q14 14 34 14t34-14Zm-178 62h288q30 0 51-21t21-51v-120H264v120q0 30 21 51t51 21Zm144-504q-98 0-147 12.5T269-744h423q-14-23-64-35.5T480-792Zm0 48h212-423 211Z"/></svg>' : '<svg xmlns="http://www.w3.org/2000/svg" height="14px" viewBox="0 -960 960 960" width="14px" fill="#F3F3F3"><path d="m168-96 72-72h480l72 72H168Zm95-120 49-50q-52-9-86-49t-34-93v-264q0-113 84-176.5T480-912q120 0 204 63.5T768-672v264q0 53-34 93t-86 49l48 50H263Zm73-120h288q30 0 51-21t21-51v-120H264v120q0 30 21 51t51 21Zm178-62q14-14 14-34t-14-34q-14-14-34-14t-34 14q-14 14-14 34t14 34q14 14 34 14t34-14ZM264-600h432v-72q0-13-1.5-25t-5.5-23H271q-4 11-5.5 23t-1.5 25v72Zm58-192h316q-30-23-70.5-35.5T480-840q-47 0-87.5 12.5T322-792Zm158 264Zm0-264Z"/></svg>';
          return `<span style="display:inline-flex; align-items:center; gap:3px;
                               padding:2px 7px; border-radius:999px;
                               background:${lineColor}; color:${lineText};
                               font-size:10px; font-weight:700;">
                    ${emoji} ${lineName}
                  </span>`;
        }
        return '';
      }).filter(Boolean);

      if (chips.length) {
        stepsHtml = `<div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:8px;">
                       ${chips.join('<span style="color:#475569;font-size:11px;">›</span>')}
                     </div>`;
      }

      // Departure / arrival times
      const dep = leg.departure_time?.text || '';
      const arr = leg.arrival_time?.text || '';
      if (dep && arr) {
        stepsHtml += `<div style="margin-top:6px; font-size:11px; color:#94a3b8;">
                        Departs ${dep} · Arrives ${arr}
                      </div>`;
      }
    } else {
      // Driving / Walking / Biking — show top 3 steps
      const topSteps = leg.steps.slice(0, 3);
      if (topSteps.length) {
        stepsHtml = `<ol style="margin:8px 0 0 0; padding-left:16px; font-size:11px; color:#94a3b8; line-height:1.5;">
          ${topSteps.map(s => `<li>${s.instructions?.replace(/<[^>]+>/g, '') || ''}</li>`).join('')}
          ${leg.steps.length > 3 ? `<li style="list-style:none; margin-left:-16px; color:#60a5fa;">
            + ${leg.steps.length - 3} more steps…</li>` : ''}
        </ol>`;
      }
    }

    const card = document.createElement('div');
    card.className = 'dir-route-card';
    card.style.cssText = `
      padding:12px 14px;
      margin-bottom:8px;
      background:${isBest ? 'rgba(59,130,246,0.1)' : 'rgba(15,23,42,0.5)'};
      border:1px solid ${isBest ? 'rgba(59,130,246,0.35)' : 'rgba(148,163,184,0.15)'};
      border-radius:5px;
      cursor:pointer;
      transition:background 0.15s;
    `;
    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
        <div style="flex:1; min-width:0;">
          <div style="display:flex; align-items:center; gap:6px;">
            ${isBest ? `<span style="font-size:10px; background:${color}; color:#0f172a;
                          font-weight:700; padding:1px 7px; border-radius:999px;">Best</span>` : ''}
            <span style="font-size:18px; font-weight:700; color:#f1f5f9;">${duration}</span>
            <span style="font-size:12px; color:#94a3b8;">${distance}</span>
          </div>
          ${summary ? `<div style="font-size:12px; color:#64748b; margin-top:2px;">via ${summary}</div>` : ''}
          ${stepsHtml}
        </div>
        <button class="dir-go-btn"
          data-route-idx="${idx}"
          style="flex-shrink:0; border:none; border-radius:999px; background:${color};
                 color:#0f172a; font-weight:700; font-size:12px; padding:7px 14px;
                 cursor:pointer; white-space:nowrap;"
          onclick="window._selectRoute(${idx})">
          Go
        </button>
      </div>
    `;

    // Highlight this route on the map when card is hovered
    card.addEventListener('mouseenter', () => {
      routeRenderers.forEach(r => r.setMap(null));
      routeRenderers = [];
      const r = new google.maps.DirectionsRenderer({
        map,
        directions: entry.response,
        routeIndex: idx,
        suppressMarkers: false,
        polylineOptions: _polylineOpts(modeKey, color)
      });
      routeRenderers.push(r);
    });

    listEl.appendChild(card);
  });

  // Store for Go button
  window._directionsResultsStore = { results, modeKey, color };
}

/** Switch to a specific route alternative when user clicks Go.
 *  Draws the route on the map AND expands the card to show a full
 *  stop-by-stop itinerary for every transit and walking leg. */
window._selectRoute = function(routeIdx) {
  const store = window._directionsResultsStore;
  if (!store) return;
  const entry = store.results[store.modeKey];
  if (!entry) return;

  // ── 1. Draw the route on the map ───────────────────────────────────────
  routeRenderers.forEach(r => r.setMap(null));
  routeRenderers = [];
  if (directionsRenderer) directionsRenderer.setMap(null);

  const renderer = new google.maps.DirectionsRenderer({
    map,
    directions: entry.response,
    routeIndex: routeIdx,
    suppressMarkers: false,
    polylineOptions: _polylineOpts(store.modeKey, store.color)
  });
  routeRenderers.push(renderer);

  // Fit map to the selected route
  const bounds = new google.maps.LatLngBounds();
  entry.response.routes[routeIdx].legs[0].steps.forEach(s => {
    bounds.extend(s.start_location);
    bounds.extend(s.end_location);
  });
  map.fitBounds(bounds, { padding: 80 });

  // ── 2. Expand the correct route card with stop-by-stop itinerary ───────
  const listEl = document.getElementById('dir-route-list');
  if (!listEl) return;

  // Clear any previously expanded itinerary panels
  listEl.querySelectorAll('.dir-itinerary').forEach(el => el.remove());
  listEl.querySelectorAll('.dir-go-btn').forEach(btn => {
    btn.textContent = 'Go';
    btn.style.background = store.color;
  });

  // Find the Go button for this route index and mark it active
  const goBtn = listEl.querySelector(`[data-route-idx="${routeIdx}"]`);
  if (goBtn) {
    goBtn.textContent = '✓';
    goBtn.style.background = '#22c55e';
  }

  // Find the card for this route and inject the itinerary after it
  const cards = listEl.querySelectorAll('.dir-route-card');
  const targetCard = cards[routeIdx];
  if (!targetCard) return;

  const itinerary = _buildItinerary(
    entry.response.routes[routeIdx],
    store.modeKey,
    store.color
  );

  // Insert the itinerary panel immediately after the route card
  targetCard.insertAdjacentElement('afterend', itinerary);

  // Scroll so the itinerary is visible
  itinerary.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
};

/**
 * Build a DOM element containing the full step-by-step itinerary for a route.
 * Transit legs show: board station, every intermediate stop, and alight station.
 * Walk legs show direction instructions and distance.
 */
function _buildItinerary(route, modeKey, color) {
  const leg    = route.legs[0];
  const wrap   = document.createElement('div');
  wrap.className = 'dir-itinerary';
  wrap.style.cssText = `
    margin: -4px 0 8px 0;
    padding: 14px 14px 14px 14px;
    background: rgba(15,23,42,0.7);
    border: 1px solid rgba(148,163,184,0.18);
    border-top: none;
    border-radius: 0 0 12px 12px;
    font-size: 12px;
    color: #cbd5e1;
    line-height: 1.5;
  `;

  const colors = { TRANSIT:'#65FE08', WALKING:'#3b82f6', DRIVING:'#FE1CCF', BICYCLING:'#F3FF00' };

  // ── Header row ──────────────────────────────────────────────────────────
  const dep = leg.departure_time?.text || '';
  const arr = leg.arrival_time?.text   || '';
  const header = document.createElement('div');
  header.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;';
  header.innerHTML = `
    <span style="font-weight:700; font-size:13px; color:#f1f5f9;">Step-by-step itinerary</span>
    <div style="display:flex; align-items:center; gap:8px;">
      ${dep && arr ? `<span style="font-size:11px; color:#64748b;">${dep} → ${arr}</span>` : ''}
      <button class="dir-itinerary-clear"
        style="background:none; border:1px solid rgba(148,163,184,0.3); color:#94a3b8;
               font-size:11px; font-weight:600; border-radius:999px; padding:3px 9px;
               cursor:pointer; white-space:nowrap; line-height:1.4;">
        Clear
      </button>
    </div>
  `;

  // Wire the clear button: removes itinerary, resets Go button, clears route line
  header.querySelector('.dir-itinerary-clear').addEventListener('click', () => {
    // Remove this itinerary panel
    wrap.remove();

    // Reset all Go buttons back to their default state
    const listEl = document.getElementById('dir-route-list');
    const store  = window._directionsResultsStore;
    if (listEl && store) {
      listEl.querySelectorAll('.dir-go-btn').forEach(btn => {
        btn.textContent = 'Go';
        btn.style.background = store.color;
      });
    }

    // Clear the drawn route line from the map
    routeRenderers.forEach(r => r.setMap(null));
    routeRenderers = [];
    if (directionsRenderer) directionsRenderer.setMap(null);
  });

  wrap.appendChild(header);

  // ── Step list ────────────────────────────────────────────────────────────
  leg.steps.forEach((step, stepIdx) => {
    const isLast = stepIdx === leg.steps.length - 1;

    if (step.travel_mode === 'WALKING') {
      // Walking segment
      const instructions = step.instructions?.replace(/<[^>]+>/g, '') || 'Walk';
      const dur  = step.duration?.text  || '';
      const dist = step.distance?.text  || '';

      const row = document.createElement('div');
      row.style.cssText = 'display:flex; gap:10px; margin-bottom:10px;';
      row.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; flex-shrink:0; width:20px;">
          <div style="width:20px; height:20px; border-radius:50%;
                      background:rgba(34,197,94,0.18); border:1.5px solid #22c55e;
                      display:flex; align-items:center; justify-content:center;
                      font-size:10px;">🚶</div>
          ${!isLast ? `<div style="width:2px; flex:1; background:rgba(148,163,184,0.2); margin:3px 0;"></div>` : ''}
        </div>
        <div style="flex:1; padding-top:1px;">
          <div style="color:#e2e8f0;">${instructions}</div>
          <div style="color:#64748b; font-size:11px; margin-top:2px;">${[dur, dist].filter(Boolean).join(' · ')}</div>
        </div>
      `;
      wrap.appendChild(row);

    } else if (step.travel_mode === 'TRANSIT') {
      // Transit segment — board, intermediate stops, alight
      const t         = step.transit;
      const lineName  = t?.line?.short_name || t?.line?.name || '';
      const lineColor = t?.line?.color      ? `#${t.line.color}`      : color;
      const lineText  = t?.line?.text_color ? `#${t.line.text_color}` : '#ffffff';
      const vehicle   = t?.line?.vehicle?.type || '';
      const emoji     = vehicle === 'SUBWAY' ? '<svg xmlns="http://www.w3.org/2000/svg" height="14px" viewBox="0 -960 960 960" width="14px" fill="#F3F3F3"><path d="M192-312v-360q0-36 16.5-63t51-45q34.5-18 89.5-27t131-9q77 0 131.5 9t89 27q34.5 18 51 45t16.5 63v360q0 54-34.5 94T645-170l51 50v24h-78l-72-72H414l-72 72h-78v-24l50-50q-53-8-87.5-48T192-312Zm288-432q-103 0-147 11.5T269-696h423q-17-25-58.5-36.5T480-744ZM264-504h180v-120H264v120Zm378 72H264h432-54Zm-126-72h180v-120H516v120ZM394-302q14-14 14-34t-14-34q-14-14-34-14t-34 14q-14 14-14 34t14 34q14 14 34 14t34-14Zm240 0q14-14 14-34t-14-34q-14-14-34-14t-34 14q-14 14-14 34t14 34q14 14 34 14t34-14Zm-298 62h288q30 0 51-21t21-51v-120H264v120q0 30 21 51t51 21Zm144-456h212-423 211Z"/></svg>' : 
                        vehicle === 'BUS' ? '<svg xmlns="http://www.w3.org/2000/svg" height="14px" viewBox="0 -960 960 960" width="14px" fill="#F3F3F3"><path d="M264-144q-10.2 0-17.1-6.9-6.9-6.9-6.9-17.1v-85q-23-19-35.5-47T192-360v-360q0-72 58-108t230-36q171 0 229.5 36T768-720v360q0 32-12.5 60T720-253v85q0 10.2-6.9 17.1-6.9 6.9-17.1 6.9h-48q-10.2 0-17.1-6.9-6.9-6.9-6.9-17.1v-48H336v48q0 10.2-6.9 17.1-6.9 6.9-17.1 6.9h-48Zm218.18-600H692 269h213.18ZM624-480H264h432-72Zm-360-72h432v-120H264v120Zm130 202q14-14 14-34t-14-34q-14-14-34-14t-34 14q-14 14-14 34t14 34q14 14 34 14t34-14Zm240 0q14-14 14-34t-14-34q-14-14-34-14t-34 14q-14 14-14 34t14 34q14 14 34 14t34-14ZM269-744h423q-20-29-66-38.5T480-792q-93 0-140.5 10T269-744Zm67.06 456h288.22Q654-288 675-309.15T696-360v-120H264v120q0 30 21.17 51 21.16 21 50.89 21Z"/></svg>' : 
                        vehicle === 'RAIL' ? '<svg xmlns="http://www.w3.org/2000/svg" height="14px" viewBox="0 -960 960 960" width="14px" fill="#F3F3F3"><path d="M264-144v-24l50-50q-53-9-87.5-49T192-360v-360q0-72 66-108t222-36q156 0 222 36t66 108v360q0 53-34.5 93T646-218l50 50v24H264Zm0-408h432v-120H264v120Zm378 72H264h432-54ZM514-350q14-14 14-34t-14-34q-14-14-34-14t-34 14q-14 14-14 34t14 34q14 14 34 14t34-14Zm-178 62h288q30 0 51-21t21-51v-120H264v120q0 30 21 51t51 21Zm144-504q-98 0-147 12.5T269-744h423q-14-23-64-35.5T480-792Zm0 48h212-423 211Z"/></svg>' : '<svg xmlns="http://www.w3.org/2000/svg" height="14px" viewBox="0 -960 960 960" width="14px" fill="#F3F3F3"><path d="m168-96 72-72h480l72 72H168Zm95-120 49-50q-52-9-86-49t-34-93v-264q0-113 84-176.5T480-912q120 0 204 63.5T768-672v264q0 53-34 93t-86 49l48 50H263Zm73-120h288q30 0 51-21t21-51v-120H264v120q0 30 21 51t51 21Zm178-62q14-14 14-34t-14-34q-14-14-34-14t-34 14q-14 14-14 34t14 34q14 14 34 14t34-14ZM264-600h432v-72q0-13-1.5-25t-5.5-23H271q-4 11-5.5 23t-1.5 25v72Zm58-192h316q-30-23-70.5-35.5T480-840q-47 0-87.5 12.5T322-792Zm158 264Zm0-264Z"/></svg>';
      const headsign  = t?.headsign || '';
      const numStops  = t?.num_stops || 0;
      const stops     = t?.stops || [];        // array of {name, location} if provided by API
      const boardStop = t?.departure_stop?.name || step.start_location?.toString() || '';
      const alightStop= t?.arrival_stop?.name   || step.end_location?.toString()   || '';
      const stepDep   = t?.departure_time?.text || '';
      const stepArr   = t?.arrival_time?.text   || '';

      // ── Board station ──
      const boardRow = document.createElement('div');
      boardRow.style.cssText = 'display:flex; gap:10px; margin-bottom:6px;';
      boardRow.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; flex-shrink:0; width:20px;">
          <div style="width:20px; height:20px; border-radius:50%;
                      background:${lineColor}; border:2px solid ${lineColor};
                      display:flex; align-items:center; justify-content:center;
                      font-size:10px; color:${lineText}; font-weight:700;">
            ${emoji}
          </div>
          <div style="width:2px; flex:1; background:${lineColor}; opacity:0.5; margin:3px 0;"></div>
        </div>
        <div style="flex:1; padding-top:1px;">
          <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
            <span style="color:#f1f5f9; font-weight:600;">Board at ${boardStop}</span>
            <span style="padding:1px 8px; border-radius:999px; background:${lineColor};
                         color:${lineText}; font-size:11px; font-weight:700;">${emoji} ${lineName}</span>
          </div>
          ${headsign ? `<div style="color:#94a3b8; font-size:11px; margin-top:2px;">Direction: ${headsign}</div>` : ''}
          ${stepDep   ? `<div style="color:#64748b; font-size:11px;">Departs ${stepDep}</div>` : ''}
        </div>
      `;
      wrap.appendChild(boardRow);

      // ── Intermediate stops ──────────────────────────────────────────────
      // Both paths render a clickable link. Named stops expand immediately;
      // the count-only fallback also becomes a link (no list to show but
      // still formatted consistently as a link).
      if (stops.length > 2) {
        // API returned named stops — list every intermediate one on expand
        const midStops = stops.slice(1, -1);
        const toggleId = `stops-${stepIdx}-${Math.random().toString(36).substr(2,5)}`;
        const stopCount = midStops.length;
        const dur = step.duration?.text || '';

        const toggleRow = document.createElement('div');
        toggleRow.style.cssText = 'display:flex; gap:10px; margin-bottom:6px;';
        toggleRow.innerHTML = `
          <div style="display:flex; flex-direction:column; align-items:center; flex-shrink:0; width:20px;">
            <div style="width:2px; flex:1; background:${lineColor}; opacity:0.5;"></div>
          </div>
          <div style="flex:1;">
            <a id="${toggleId}-btn" href="#"
               style="color:#60a5fa; font-size:11px; font-weight:500;
                      text-decoration:underline; cursor:pointer; display:inline-block; padding:2px 0;">
              ${stopCount} intermediate stop${stopCount !== 1 ? 's' : ''}${dur ? ` (${dur})` : ''}
            </a>
            <ol id="${toggleId}-list"
              style="display:none; margin:6px 0 2px 0; padding-left:14px;
                     color:#94a3b8; font-size:11px; line-height:1.8; list-style:disc;">
              ${midStops.map(s => `<li>${s.name}</li>`).join('')}
            </ol>
          </div>
        `;
        wrap.appendChild(toggleRow);

        // Wire toggle after appending so IDs resolve
        setTimeout(() => {
          const btn  = document.getElementById(`${toggleId}-btn`);
          const list = document.getElementById(`${toggleId}-list`);
          if (btn && list) {
            btn.addEventListener('click', (e) => {
              e.preventDefault();
              const open = list.style.display !== 'none';
              list.style.display = open ? 'none' : 'block';
              btn.textContent = open
                ? `${stopCount} intermediate stop${stopCount !== 1 ? 's' : ''}${dur ? ` (${dur})` : ''}`
                : `▾ Hide stops`;
            });
          }
        }, 0);

      } else if (numStops > 0) {
        // API returned only a count — render as a link (no named list available)
        const count = numStops - 1;
        const dur   = step.duration?.text || '';
        const toggleId = `stops-${stepIdx}-${Math.random().toString(36).substr(2,5)}`;

        const countRow = document.createElement('div');
        countRow.style.cssText = 'display:flex; gap:10px; margin-bottom:6px;';
        countRow.innerHTML = `
          <div style="display:flex; flex-direction:column; align-items:center; flex-shrink:0; width:20px;">
            <div style="width:2px; flex:1; background:${lineColor}; opacity:0.4;
                        border-left:2px dashed ${lineColor};"></div>
          </div>
          <div style="flex:1; padding-top:4px;">
            <a id="${toggleId}-btn" href="#"
               style="color:#60a5fa; font-size:11px; font-weight:500;
                      text-decoration:underline; cursor:pointer; display:inline-block;">
              ${count} intermediate stop${count !== 1 ? 's' : ''}${dur ? ` (${dur})` : ''}
            </a>
            <div id="${toggleId}-note"
              style="display:none; margin-top:4px; font-size:10px; color:#64748b; font-style:italic;">
              Stop names not available for this route.
            </div>
          </div>
        `;
        wrap.appendChild(countRow);

        // Wire toggle — shows a note since the API didn't return named stops
        setTimeout(() => {
          const btn  = document.getElementById(`${toggleId}-btn`);
          const note = document.getElementById(`${toggleId}-note`);
          if (btn && note) {
            btn.addEventListener('click', (e) => {
              e.preventDefault();
              const open = note.style.display !== 'none';
              note.style.display = open ? 'none' : 'block';
              btn.textContent = open
                ? `${count} intermediate stop${count !== 1 ? 's' : ''}${dur ? ` (${dur})` : ''}`
                : `▾ ${count} stop${count !== 1 ? 's' : ''}${dur ? ` (${dur})` : ''}`;
            });
          }
        }, 0);
      }

      // ── Arrive station ──
      const alightRow = document.createElement('div');
      alightRow.style.cssText = 'display:flex; gap:10px; margin-bottom:10px;';
      alightRow.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; flex-shrink:0; width:20px;">
          <div style="width:14px; height:14px; border-radius:50%;
                      border:2px solid ${lineColor}; background:#1e293b;
                      margin:0 3px;"></div>
          ${!isLast ? `<div style="width:2px; flex:1; background:rgba(148,163,184,0.2); margin:3px 0;"></div>` : ''}
        </div>
        <div style="flex:1; padding-top:1px;">
          <div style="color:#e2e8f0; font-weight:600;">Arrive at ${alightStop}</div>
          ${stepArr ? `<div style="color:#64748b; font-size:11px;">Arrives ${stepArr}</div>` : ''}
        </div>
      `;
      wrap.appendChild(alightRow);
    }
  });

  // ── Final destination marker ─────────────────────────────────────────────
  const dest = document.createElement('div');
  dest.style.cssText = 'display:flex; gap:10px; align-items:flex-start;';
  dest.innerHTML = `
    <div style="width:20px; height:20px; border-radius:50%;
                background:#ef4444; border:2px solid #f87171;
                display:flex; align-items:center; justify-content:center;
                font-size:10px; flex-shrink:0;">📍</div>
    <div style="flex:1; padding-top:2px; color:#f87171; font-weight:600; font-size:12px;">
      Destination — ${leg.end_address || ''}
    </div>
  `;
  wrap.appendChild(dest);

  return wrap;
}

/** Format seconds → "X min" or "X hr Y min" */
function _fmtDuration(seconds) {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} hr ${m % 60} min`;
}
// ─── END DIRECTIONS PANEL ─────────────────────────────────────────────────────
function setupManualLocationSearch() {
  const addressInput = document.getElementById('manual-address-input');
  const gpsBtn       = document.getElementById('use-device-gps-btn');
  const clearBtn     = document.getElementById('clearLocationBtn');

  if (!addressInput) return;

  // ── Shared helper: apply a resolved location ──────────────────────────────
  function applyLocation(lat, lng, labelText) {
    userLocation = { lat, lng };
    addressInput.value = labelText;
    addressInput.style.borderColor = '#22c55e'; // green = confirmed
    setUserLocationMarker(userLocation, 50);
    map.setCenter(userLocation);
    map.setZoom(14);
    renderNearestList(findNearestMurals());
    if (clearBtn) clearBtn.disabled = false;

    // Update sidebar status message
    const nearestResults = document.getElementById('nearestResults');
    if (nearestResults) {
      nearestResults.classList.remove('empty');
      nearestResults.innerHTML = `<p style="color:#86efac; font-size:12px; margin:0;">
        ✓ Location set. Click any pin and tap "Directions".
      </p>`;
    }
  }

  // ── Geocode a free-text address string using the Geocoder API ─────────────
  function geocodeAddress(query) {
    if (!query.trim()) return;
    addressInput.disabled = true;
    addressInput.style.borderColor = 'rgba(148,163,184,0.35)';
    addressInput.value = 'Looking up address…';

    const gc = geocoder || new google.maps.Geocoder();
    gc.geocode(
      { address: query + ', New York, NY', region: 'us' },
      (results, status) => {
        addressInput.disabled = false;
        if (status === 'OK' && results[0]) {
          const loc  = results[0].geometry.location;
          const label = results[0].formatted_address;
          applyLocation(loc.lat(), loc.lng(), label);
        } else {
          // Geocoding failed — restore original text and show error
          addressInput.value = query;
          addressInput.style.borderColor = '#ef4444'; // red = not found
          const nearestResults = document.getElementById('nearestResults');
          if (nearestResults) {
            nearestResults.classList.remove('empty');
            nearestResults.innerHTML = `<p style="color:#fca5a5; font-size:12px; margin:0;">
              Address not found. Try a more specific address or zip code.
            </p>`;
          }
          setTimeout(() => {
            addressInput.style.borderColor = 'rgba(148,163,184,0.35)';
          }, 3000);
        }
      }
    );
  }

  // ── Google Places Autocomplete (primary path) ─────────────────────────────
  const autocomplete = new google.maps.places.Autocomplete(addressInput, {
    bounds: map ? map.getBounds() : undefined,
    fields: ['geometry', 'formatted_address'],
    componentRestrictions: { country: 'us' }
  });

  // Bias autocomplete results towards NYC
  if (map) {
    autocomplete.bindTo('bounds', map);
  }

  autocomplete.addListener('place_changed', () => {
    const place = autocomplete.getPlace();
    if (place.geometry?.location) {
      // Autocomplete returned full geometry — use it directly
      applyLocation(
        place.geometry.location.lat(),
        place.geometry.location.lng(),
        place.formatted_address || addressInput.value
      );
    } else {
      // Places API blocked or user picked a text-only suggestion —
      // fall back to geocoding whatever text is in the input
      geocodeAddress(addressInput.value);
    }
  });

  // ── Enter key fallback (user typed without selecting a suggestion) ─────────
  addressInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // Small delay so autocomplete has a chance to fire place_changed first
      setTimeout(() => {
        // Only geocode if userLocation wasn't already set by place_changed
        if (addressInput.value && addressInput.value !== 'Looking up address…') {
          geocodeAddress(addressInput.value);
        }
      }, 150);
    }
  });

  // Reset border color when user starts typing again
  addressInput.addEventListener('input', () => {
    addressInput.style.borderColor = 'rgba(148,163,184,0.35)';
  });

  // ── GPS button ──────────────────────────────────────────────────────────
  if (gpsBtn) {
    gpsBtn.addEventListener('click', () => {
      if (!navigator.geolocation) {
        renderNearestList([], "Geolocation is not supported in this browser.");
        return;
      }
      gpsBtn.textContent = "Locating…";
      gpsBtn.disabled = true;
      navigator.geolocation.getCurrentPosition(
        (position) => {
          applyLocation(
            position.coords.latitude,
            position.coords.longitude,
            "Current Location"
          );
          gpsBtn.textContent = "Use Device GPS";
          gpsBtn.disabled = false;
        },
        () => {
          renderNearestList([], "Location access denied. Type your address instead.");
          gpsBtn.textContent = "Use Device GPS";
          gpsBtn.disabled = false;
        }
      );
    });
  }

  // ── Clear button ────────────────────────────────────────────────────────
  if (clearBtn) {
    clearBtn.disabled = true;
    clearBtn.addEventListener('click', () => {
      addressInput.value = "";
      addressInput.style.borderColor = 'rgba(148,163,184,0.35)';
      clearUserLocation();
      clearBtn.disabled = true;
      const nearestResults = document.getElementById('nearestResults');
      if (nearestResults) {
        nearestResults.innerHTML = '';
        nearestResults.classList.add('empty');
      }
    });
  }
}

// Expose to global so Google Maps callback can find it
window.initMap = initMap;

// Ensure layout controls are initialized early for button visibility
// This runs immediately when the script loads, before Google Maps API loads
// This should be the final block in your file
(function() {
  if (typeof initLayoutControls === 'function') {
    try {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initLayoutControls);
      } else {
        initLayoutControls();
      }
    } catch (e) {
      console.error('Error initializing layout controls early:', e);
    }
  }
})();
