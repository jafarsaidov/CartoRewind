// Global variables for maps and layers
let map1, map2, cursor1, cursor2, histLayer, baseLayers;

// --- Configuration ---

// 1. Coordinates for setting the initial map view
const centerCoords = {
    munich: [48.1351, 11.5820],
    vienna: [48.2082, 16.3738],
    enschede: [52.2215, 6.8937],
    dresden: [51.0504, 13.7373],
};

// 2. Map of city pages to their specific historical map tile folders
// !! IMPORTANT: Update these folder names to match your exact file structure !!
// Set the value to null if the map tiles for that year/city are missing.
const TILE_FOLDER_MAP = {
    'munich': {
        '1400': null,
        '1500': null,
        '1600': null,
        '1888': 'muc-1888'
    },
    'vienna': {
        '1800': 'vie-1800-folder',
        '1833': 'v_1833',
    },
    'dresden': {
        '1750': 'dre-1750-folder',
        '1833': 'd_1833',
        '1878': 'dre-1878-folder',
    },
    'enschede': {
        '1830': 'ens-1830-folder',
        '1900': 'ens-1900-folder',
    },
};

// Define global bounds for map movement
const bounds = L.latLngBounds(L.latLng(35, -10), L.latLng(71, 40));


// --- Core Functions ---

/**
 * Initializes the two Leaflet map containers (map1 for historical, map2 for modern).
 * @param {string} city - The current city key (e.g., 'munich').
 * @param {string} initialYear - The initial historical map year to load.
 */
function initMaps(city, initialYear) {
    // Clean up previous map instances if they exist
    if (map1) {
        map1.remove();
        map2.remove();
    }

    // Define the common OSM layer
    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        minZoom: 9,
        attribution: '&copy; OSM contributors'
    });

    // Initialize Map 1 (Historical)
    map1 = L.map('map1', {
        zoomControl: false,
        attributionControl: false,
        maxBounds: bounds,
    }).setView(centerCoords[city], 13);

    // Set OSM as the base layer for map1 (Historical Viewer) to fill blank spaces.
    osmLayer.addTo(map1);

    // Initialize Map 2 (Modern/Base Layers)
    map2 = L.map('map2', {
        zoomControl: false,
        attributionControl: false,
        maxBounds: bounds,
    }).setView(centerCoords[city], 13);

    // Base layers for map2 (Modern) - Note: Must create a new L.tileLayer instance for map2
    const osmLayerForMap2 = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        minZoom: 9,
        attribution: '&copy; OSM contributors'
    });

    const googleSatLayer = L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
        maxZoom: 19,
        minZoom: 9,
        attribution: '&copy; Google Satellite'
    });

    googleSatLayer.addTo(map2); // Add OSM layer by default to map2

    baseLayers = {
        "OpenStreetMap": osmLayerForMap2,
        "Satellite Imagery": googleSatLayer
    };

    // Add layer control to map2
    L.control.layers(baseLayers).addTo(map2);

    // Set the initial historical layer (this is added on top of osmLayer on map1)
    updateHistoricalLayer(city, initialYear);

    // --- Map sync logic (STABILIZED) ---
    let syncing = false;

    // Function to synchronize the view (center and zoom)
    function syncView(fromMap, toMap) {
        if (syncing) return;
        syncing = true;

        const center = fromMap.getCenter();
        const zoom = fromMap.getZoom();

        // Use animate: false for direct, non-lagging synchronization
        toMap.setView(center, zoom, { animate: false });

        syncing = false;
    }

    // Attach listeners for continuous synchronization during drag and zoom.
    map1.on('move zoom', () => syncView(map1, map2));
    map2.on('move zoom', () => syncView(map2, map1));

    // --- Cursor logic ---
    document.querySelectorAll('.cursor').forEach(el => el.remove());

    function createCursor(mapEl) {
        const cursor = document.createElement('div');
        cursor.className = 'cursor';
        mapEl.appendChild(cursor);
        return cursor;
    }

    cursor1 = createCursor(document.getElementById('map1'));
    cursor2 = createCursor(document.getElementById('map2'));

    function updateCursors(e) {
        const mapRect = e.target._container.getBoundingClientRect();
        const x = e.originalEvent.clientX - mapRect.left;
        const y = e.originalEvent.clientY - mapRect.top;
        cursor1.style.left = x + 'px';
        cursor1.style.top = y + 'px';
        cursor2.style.left = x + 'px';
        cursor2.style.top = y + 'px';
    }

    map1.on('mousemove', updateCursors);
    map2.on('mousemove', updateCursors);
}

/**
 * Switches the tile source for the historical map (map1) based on the selected year.
 * Handles removal of the layer if tiles are missing (value is null in TILE_FOLDER_MAP).
 * @param {string} city - The current city key.
 * @param {string} year - The selected year from the dropdown.
 */
function updateHistoricalLayer(city, year) {
    // Get the folder name (e.g., 'muc-1888') from the global configuration.
    const folder = TILE_FOLDER_MAP[city] ? TILE_FOLDER_MAP[city][year] : null;

    // Check if the layer needs to be removed (folder is null or undefined)
    if (!folder) {
        console.warn(`Tiles for ${city} year ${year} are not yet available. Showing background only.`);

        // Explicitly remove the historical layer if it exists
        if (histLayer) {
            map1.removeLayer(histLayer);
            histLayer = null;
        }
        return; // Stop the function here
    }

    // Construct the tile URL path (Corrected structure: maps/tiles/FOLDER_NAME/Z/X/Y.png)
    const tileUrl = `tiles/${folder}/{z}/{x}/{y}.png`;

    if (histLayer) {
        // If layer exists, just update the URL (Leaflet will reload the tiles)
        histLayer.setUrl(tileUrl);
    } else {
        // If layer doesn't exist (initial load, or was removed earlier), create it and add to map1
        histLayer = L.tileLayer(tileUrl, {
            maxZoom: 19,
            minZoom: 9,
            tms: false,
            noWrap: true
        }).addTo(map1);
    }
}

/**
 * Determines the current city based on the HTML file name.
 */
function getCurrentCity() {
    const pathname = window.location.pathname;
    const filename = pathname.split('/').pop().replace('.html', '');

    // Map of possible filenames to city keys
    const cityMap = {
        'munich': 'munich',
        'vienna': 'vienna',
        'dresden': 'dresden',
        'enschede': 'enschede',
        'index': 'munich',
        '': 'munich'
    };

    return cityMap[filename] || 'munich';
}


// --- Initialization & Event Handlers ---

const currentCity = getCurrentCity();
const mapYearSelect = document.getElementById('mapYearSelect');

let initialYear;

if (mapYearSelect) {
    // Get the currently selected option's value (e.g., '1888')
    initialYear = mapYearSelect.value;

    // Add event listener for when the selection changes
    mapYearSelect.addEventListener('change', (e) => {
        const selectedYear = e.target.value;
        updateHistoricalLayer(currentCity, selectedYear);
    });
} else {
    // Default year if no dropdown is found (or on index page)
    initialYear = '1888';
}

// Start the map initialization
initMaps(currentCity, initialYear);

// --- FIXED Fullscreen Toggle Logic ---

document.addEventListener('DOMContentLoaded', () => {
    const fullscreenButton = document.getElementById('fullscreen-toggle');
    const mainContent = document.querySelector('main');

    if (fullscreenButton && mainContent) {
        
        // Function to handle map resize after fullscreen changes
        function handleFullscreenChange() {
            // Use setTimeout to ensure the browser has completed the fullscreen transition
            setTimeout(() => {
                if (map1) map1.invalidateSize();
                if (map2) map2.invalidateSize();
            }, 100); // 100ms delay allows the transition to complete
        }

        // Listen for native browser fullscreen change events
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        document.addEventListener('webkitfullscreenchange', handleFullscreenChange); // Safari
        document.addEventListener('mozfullscreenchange', handleFullscreenChange); // Firefox
        document.addEventListener('msfullscreenchange', handleFullscreenChange); // IE/Edge

        // Button click handler
        fullscreenButton.addEventListener('click', () => {
            // Check if we are currently in browser fullscreen mode
            const isFullscreen = document.fullscreenElement || 
                                document.webkitFullscreenElement || 
                                document.mozFullScreenElement || 
                                document.msFullscreenElement;

            if (isFullscreen) {
                // Exit fullscreen
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                } else if (document.webkitExitFullscreen) {
                    document.webkitExitFullscreen();
                } else if (document.mozCancelFullScreen) {
                    document.mozCancelFullScreen();
                } else if (document.msExitFullscreen) {
                    document.msExitFullscreen();
                }
            } else {
                // Enter fullscreen
                if (mainContent.requestFullscreen) {
                    mainContent.requestFullscreen();
                } else if (mainContent.webkitRequestFullscreen) {
                    mainContent.webkitRequestFullscreen();
                } else if (mainContent.mozRequestFullScreen) {
                    mainContent.mozRequestFullScreen();
                } else if (mainContent.msRequestFullscreen) {
                    mainContent.msRequestFullscreen();
                } else {
                    alert("Your browser doesn't support fullscreen mode. Try pressing F11 instead.");
                }
            }
        });
    }
});
