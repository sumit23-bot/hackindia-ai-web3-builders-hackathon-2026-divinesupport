// ==========================================
// FOODLOOP RADAR MAP ENGINE (map.js)
// Real-Time 10km Radius Geospatial Engine
// ==========================================

let map = null;
let userLocationMarker = null;
let radarCircle = null;
let markerLayerGroup = null;

// Verified Registered Regional Clusters
const REGISTERED_HUBS = [
    {
        name: "Robin Hood Army (Central Hub)",
        type: "NGO",
        category: "Verified NGO Partner",
        darpan_id: "DL/2018/0192831",
        lat: 28.6315,
        lon: 77.2167,
        address: "Connaught Place Night Distribution Zone"
    },
    {
        name: "Feeding India (South Delhi Hub)",
        type: "NGO",
        category: "Verified NGO Partner",
        darpan_id: "DL/2020/0048192",
        lat: 28.5700,
        lon: 77.2250,
        address: "South Extension Volunteer Base"
    },
    {
        name: "Goonj Foundation (Noida Sector 18)",
        type: "NGO",
        category: "Verified NGO Partner",
        darpan_id: "UP/2019/0091823",
        lat: 28.5721,
        lon: 77.3260,
        address: "Noida Urban Community Cluster"
    },
    {
        name: "Delhi Gaushala & Stray Rescue Society",
        type: "ANIMAL",
        category: "AWBI Verified Gaushala",
        darpan_id: "DL/AWBI/2019/081",
        lat: 28.7150,
        lon: 77.1200,
        address: "Rohini Sub-Window Fodder Recovery Hub"
    },
    {
        name: "Indraprastha Bio-CNG Energy Plant",
        type: "BIOGAS",
        category: "Bio-Energy Processing Loop",
        darpan_id: "DL/BIO/2022/011",
        lat: 28.6180,
        lon: 77.2600,
        address: "Waste-to-Clean-Energy Reroute Facility"
    }
];

// Initialize Map
function initMap() {
    // Start with neutral viewport
    map = L.map('map', {
        zoomControl: false
    }).setView([28.6139, 77.2090], 12);

    L.control.zoom({ position: 'bottomleft' }).addTo(map);

    // Dark Matter Map Tiles (OpenStreetMap + CartoDB)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(map);

    markerLayerGroup = L.layerGroup().addTo(map);

    // Render registered Hubs
    renderHubMarkers();

    // Fetch and display active live food donations from backend
    fetchLiveFoodDonations();

    // Acquire fresh, non-cached live GPS location
    locateAndCenterUser(false);
}

// Zero-Cache Geolocation Routine
function locateAndCenterUser(isManualTrigger = false) {
    const statusText = document.getElementById('gps-status-text');
    if (statusText) {
        statusText.textContent = "Acquiring live hardware GPS...";
    }

    if (!navigator.geolocation) {
        if (statusText) statusText.textContent = "GPS not supported on browser";
        if (isManualTrigger) alert("Geolocation is not supported by your browser.");
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;
            const liveCoordinates = [lat, lon];

            // Update live coordinates in persistent storage
            localStorage.setItem('foodloop_user_coords', JSON.stringify({ lat, lon }));

            if (statusText) {
                statusText.textContent = `Active: ${lat.toFixed(4)}, ${lon.toFixed(4)}`;
            }

            // Remove previous user marker and circle if already rendered
            if (userLocationMarker) map.removeLayer(userLocationMarker);
            if (radarCircle) map.removeLayer(radarCircle);

            // Custom Green User Position Marker
            const userIcon = L.divIcon({
                className: 'user-live-pin',
                html: '<div style="background-color: #10b981; width: 18px; height: 18px; border-radius: 50%; border: 3px solid #ffffff; box-shadow: 0 0 14px #10b981;"></div>',
                iconSize: [18, 18],
                iconAnchor: [9, 9]
            });

            userLocationMarker = L.marker(liveCoordinates, { icon: userIcon }).addTo(map);
            userLocationMarker.bindPopup(`
                <div class="popup-content">
                    <div class="popup-title">📍 Your Live Position</div>
                    <div style="font-size: 11px; color: #cbd5e1;">Lat: ${lat.toFixed(5)}<br>Lon: ${lon.toFixed(5)}</div>
                    <div style="font-size: 11px; color: #34d399; margin-top: 4px; font-weight: 700;">10 km Radar Grid Active</div>
                </div>
            `).openPopup();

            // 10km Geospatial Radius Boundary Circle
            radarCircle = L.circle(liveCoordinates, {
                radius: 10000, // 10,000 meters = 10 km
                color: '#10b981',
                fillColor: '#10b981',
                fillOpacity: 0.08,
                weight: 1.5,
                dashArray: '6, 8'
            }).addTo(map);

            // Center map smoothly on live coordinate
            map.flyTo(liveCoordinates, 13, { duration: 1.2 });
        },
        (error) => {
            console.warn("Live Geolocation read failed:", error.message);
            if (statusText) {
                statusText.textContent = "GPS timeout / permission denied";
            }
            if (isManualTrigger) {
                alert("Could not access live GPS. Please enable browser location access.");
            }
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0 // STRICT ZERO-AGE: Never use cached past location
        }
    );
}

// Render Registered NGO, Gaushala, and Biogas Hubs
function renderHubMarkers() {
    REGISTERED_HUBS.forEach(hub => {
        let iconSymbol = hub.type === 'NGO' ? '🏛️' : hub.type === 'ANIMAL' ? '🐾' : '⚡';
        let badgeClass = hub.type === 'NGO' ? 'popup-badge-ngo' : hub.type === 'ANIMAL' ? 'popup-badge-animal' : 'popup-badge-food';
        let borderCol = hub.type === 'NGO' ? '#3b82f6' : hub.type === 'ANIMAL' ? '#f59e0b' : '#10b981';

        const customHubIcon = L.divIcon({
            className: 'hub-pin-icon',
            html: `<div style="background: #1e293b; border: 2px solid ${borderCol}; padding: 4px 6px; border-radius: 8px; font-size: 14px; box-shadow: 0 4px 10px rgba(0,0,0,0.5);">${iconSymbol}</div>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14]
        });

        const marker = L.marker([hub.lat, hub.lon], { icon: customHubIcon }).addTo(markerLayerGroup);
        marker.bindPopup(`
            <div class="popup-content">
                <span class="popup-badge ${badgeClass}">${hub.category}</span>
                <div class="popup-title">${hub.name}</div>
                <div style="font-size: 11px; color: #94a3b8; margin-bottom: 4px;">Darpan ID: ${hub.darpan_id}</div>
                <div style="font-size: 12px; color: #cbd5e1;">📍 ${hub.address}</div>
            </div>
        `);
    });
}

// Fetch Active Food Posts from Backend API
async function fetchLiveFoodDonations() {
    try {
        const response = await fetch('http://localhost:5000/api/donations');
        if (response.ok) {
            const listings = await response.json();
            if (Array.isArray(listings)) {
                listings.forEach(item => {
                    if (item.coords && item.coords.lat && item.coords.lon) {
                        const foodIcon = L.divIcon({
                            className: 'food-donation-pin',
                            html: `<div style="background: #10b981; color: #000; font-weight: 800; font-size: 11px; padding: 4px 6px; border-radius: 6px; box-shadow: 0 0 10px #10b981;">🍲 ${item.quantity || 'Meal'}</div>`,
                            iconSize: [50, 24],
                            iconAnchor: [25, 12]
                        });

                        const foodMarker = L.marker([item.coords.lat, item.coords.lon], { icon: foodIcon }).addTo(markerLayerGroup);
                        foodMarker.bindPopup(`
                            <div class="popup-content">
                                <span class="popup-badge popup-badge-food">🟢 Live Surplus Donation</span>
                                <div class="popup-title">${item.title}</div>
                                <div style="font-size: 12px; color: #cbd5e1; margin-bottom: 6px;">
                                    📍 ${item.address}<br>
                                    📦 Qty: ${item.quantity} | ⏳ Window: ${item.expiry_hours || 3}h
                                </div>
                                <a href="index.html" style="display: block; text-align: center; background: #10b981; color: #000; font-weight: 700; font-size: 11px; padding: 5px 8px; border-radius: 6px; text-decoration: none;">Claim in Main Feed</a>
                            </div>
                        `);
                    }
                });
            }
        }
    } catch (err) {
        console.log("Operating in offline grid mode.");
    }
}

// Window Load Bootstrap
window.addEventListener('DOMContentLoaded', initMap);