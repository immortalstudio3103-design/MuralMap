/*
 * Thrive Collective - Mural Map - map.js
 * Core logic for map initialization, data parsing, clustering, filtering, location services, and the new side-view detail panel.
 */

let map;
let markers = [];
let infoWindow;
let allMurals = [];
let clusterer;
let activeFilters = {
  search: "",
  year: null,
  school: null,
  borough: null,
  muralView: 100
};
let userLocation = null;
let nearestMurals = [];

// Borough centroids for specialized 25% view (same as original)
const BOROUGH_CENTROIDS = {
  "Manhattan": { lat: 40.7831, lng: -73.9712 },
  "Brooklyn": { lat: 40.6782, lng: -73.9442 },
  "Queens": { lat: 40.7282, lng: -73.7949 },
  "Bronx": { lat: 40.8448, lng: -73.8648 },
  "Staten Island": { lat: 40.5795, lng: -74.1502 }
};

// Color constants
const MARKER_COLOR = "#3b82f6"; // Thrive blue

// Convenience access to config (same as original, assuming config.js exists)
const CONFIG = window.MURAL_MAP_CONFIG || {};
const CSV_URL = CONFIG.CSV_URL || "";
const DEFAULT_CENTER = CONFIG.DEFAULT_CENTER || { lat: 40.7128, lng: -74.006 };
const DEFAULT_ZOOM = CONFIG.DEFAULT_ZOOM || 11;

// Define helper function to get column index from CSV header (same as original)
function getColumnIndex(headerRow, possibleNames) {
  for (const name of possibleNames) {
    const idx = headerRow.indexOf(name);
    if (idx !== -1) return idx;
  }
  return -1;
}

// Minimal CSV parser (same as original)
function parseCSV(text) {
  // ... (use existing minimal CSV parsing logic from original map.js)
}

// Function to load murals and parse CSV data
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
    const idxSummary = getColumnIndex(header, ["summary", "theme", "tags", "tags (for maps)"]); // treat tags as summary
    const idxStudents = getColumnIndex(header, ["students_involved", "students"]);
    
    // Critical: Placeholders for new columns needed by detail panel
    const idxAddress = getColumnIndex(header, ["address", "mural_address"]); 
    const idxPortfolioUrl = getColumnIndex(header, ["murals_portfolio", "portfolio_url", "portfolio"]); 

    if (idxName === -1) {
      throw new Error("Could not find name column.");
    }
    if (idxLat === -1 || idxLng === -1) {
      throw new Error("Could not find latitude/longitude columns.");
    }

    return dataRows
      .map(row => {
        const val = index => (index >= 0 && index < row.length ? row[index].trim() : "");

        const latStr = val(idxLat);
        const lngStr = val(idxLng);
        const lat = parseFloat(latStr);
        const lng = parseFloat(lngStr);

        return {
          name: val(idxName),
          lat: !Number.isNaN(lat) ? lat : null,
          lng: !Number.isNaN(lng) ? lng : null,
          borough: val(idxBorough),
          year: val(idxYear),
          school: val(idxSchool),
          detail_url: val(idxDetailUrl),
          image_url: val(idxImageUrl),
          artist_names: val(idxArtistNames),
          summary: val(idxSummary),
          students_involved: val(idxStudents),
          
          // Parse the new data fields
          address: val(idxAddress),
          portfolio_url: val(idxPortfolioUrl)
        };
      })
      .filter(m => {
        if (!m.name || m.lat === null || m.lng === null) {
          return false;
        }
        return true;
      });
  } catch (err) {
    throw err;
  }
}

// Function to refactor and display the mural side panel
function showMuralPopup(marker) {
  const m = marker.mural;
  const panel = document.getElementById("muralDetailPanel");
  
  if (!panel) {
    console.error("Mural detail panel not found");
    return;
  }

  // Calculate distance if user location is available (same as original)
  let distanceText = "";
  if (userLocation) {
    const distanceKm = getDistanceFromLatLonInKm(
      userLocation.lat,
      userLocation.lng,
      m.lat,
      m.lng
    );
    const distanceMiles = (distanceKm * 0.621371).toFixed(1);
    distanceText = `<p style="margin: 4px 0 0 0; color: #9ca3af; font-size: 13px;">${distanceMiles} miles away</p>`;
  }

  // Define structured HTML content for the panel
  const html = `
    <div class="mural-detail-panel-header">
      <div class="mural-name-address">
        <h2 class="mural-detail-panel-title">
          ${m.name}${m.year ? ` (${m.year})` : ''}
        </h2>
        <p class="mural-detail-panel-address">${m.address || 'Address not available'}</p>
        ${distanceText}
      </div>
      <button class="mural-detail-panel-close" data-close aria-label="Close">
        ×
      </button>
    </div>
    
    ${m.image_url ? `
      <div class="mural-detail-panel-image">
        <img src="${m.image_url}" alt="${m.name}" />
      </div>
    ` : '<div class="mural-detail-panel-image-placeholder">Image not available</div>'}
    
    <div class="mural-detail-panel-summary">
      <h3>Summary</h3>
      <p>${m.summary || 'Summary not available'}</p>
    </div>

    ${m.portfolio_url ? `
        <div class="mural-detail-panel-portfolio-link">
            <a href="${m.portfolio_url}" target="_blank" rel="noopener">Murals Portfolio</a>
        </div>
    ` : ''}
    
    <div class="mural-detail-panel-meta">
      <div class="mural-detail-meta-item">
        <div class="mural-detail-meta-label">Students</div>
        <div class="mural-detail-meta-value">${m.students_involved || '—'}</div>
      </div>
      <div class="mural-detail-meta-item">
        <div class="mural-detail-meta-label">Teaching Artist</div>
        <div class="mural-detail-meta-value">${m.artist_names || '—'}</div>
      </div>
      <div class="mural-detail-meta-item">
        <div class="mural-detail-meta-label">School</div>
        <div class="mural-detail-meta-value">${m.school || '—'}</div>
      </div>
      <div class="mural-detail-meta-item">
        <div class="mural-detail-meta-label">Borough</div>
        <div class="mural-detail-meta-value">${m.borough || '—'}</div>
      </div>
    </div>
    
    <div class="mural-detail-panel-actions">
      <a href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(m.lat + "," + m.lng)}${userLocation ? `&origin=${encodeURIComponent(userLocation.lat + "," + userLocation.lng)}` : ''}"
               target="_blank" rel="noopener"
         class="mural-detail-btn mural-detail-btn-primary"
         data-directions>
        ${userLocation ? 'Walking Directions' : 'Get Directions'}
      </a>
      <button class="mural-detail-btn" data-focus>
        Center Map
      </button>
    </div>
  `;

  panel.innerHTML = html;
  panel.classList.remove("hidden");

  // Prevent clicks inside panel from closing it
  panel.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  // Wire up event listeners
  const closeBtn = panel.querySelector('[data-close]');
  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      panel.classList.add("hidden");
    });
  }

  const directionsBtn = panel.querySelector('[data-directions]');
  if (directionsBtn) {
    // Link already has href
  }

  const focusBtn = panel.querySelector('[data-focus]');
  if (focusBtn) {
    focusBtn.addEventListener('click', () => {
      map.panTo({ lat: m.lat, lng: m.lng });
      const currentZoom = map.getZoom();
      if (currentZoom < 15) {
        map.setZoom(15);
      }
    });
  }
}

// ... (other helper functions from the original map.js, e.g., for markers, clustering, filtering, location services, distance calculation, sidebar toggle, etc.)
// They remain largely unchanged and are omitted for brevity, but are necessary for a full build.

// Main map initialization function (same as original, just wires marker clicks to new showMuralPopup)
async function initMap() {
  try {
    // ... (same as original initMap, including loading, error state, and dark map style definition)
    
    // Load data and create markers
    const murals = await loadMuralsFromSheet();
    console.log(`Loaded ${murals.length} murals from CSV`);
    allMurals = murals;

    // ... (rest of the original logic for creating markers, clusterer, setup filters, etc.)
    
    markers.forEach(marker => {
        // ... (other marker properties)
        marker.addListener("click", () => {
            showMuralPopup(marker);
        });
    });

  } catch (err) {
    // ... (same as original error handling)
  } finally {
    // ... (same as original finally block)
  }
}

// Expose to global so Google Maps callback can find it
window.initMap = initMap;
