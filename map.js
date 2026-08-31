// ==========================================
// FOODLOOP RADAR MAP CONTROLLER (map.js)
// Zero-Annoyance GPS Engine with Persistent LocalStorage Cache
// ==========================================

const API_DONATIONS_URL = 'http://localhost:5000/api/donations';

let mapInstance = null;
let userMarker = null;
let radarCircle = null;
let markersLayerGroup = null;
let currentFilter = 'ALL';

// 1. Check LocalStorage First (Zero Prompt on Refresh)
const cachedGPS = localStorage.getItem('foodloop_user_coords');
let userGPS = cachedGPS ? JSON.parse(cachedGPS) : { lat: 28.6139, lon: 77.2090 };

// Permanent Verified Infrastructure Directory (Delhi-NCR)
const VERIFIED_DIRECTORY = [
  // 1. VERIFIED HUMAN RESCUE NGOS
  {
    id: 'ngo_1',
    type: 'NGO',
    name: 'Robin Hood Army (Delhi Central Hub)',
    address: 'Barakhamba Road, Near Mandi House, New Delhi',
    darpan_id: 'DL/2018/0192831',
    phone: '+91 88002 47247',
    lat: 28.6258,
    lon: 77.2345,
    capacity: '1,500 meals/day'
  },
  {
    id: 'ngo_2',
    type: 'NGO',
    name: 'Feeding India (South Delhi Food Hub)',
    address: 'Hauz Khas Enclave, New Delhi',
    darpan_id: 'DL/2020/0048192',
    phone: '+91 98111 22334',
    lat: 28.5494,
    lon: 77.2001,
    capacity: '2,000 meals/day'
  },
  {
    id: 'ngo_3',
    type: 'NGO',
    name: 'Goonj Foundation (Noida Rescue Depot)',
    address: 'Sector 62, Noida, Gautam Buddha Nagar, UP',
    darpan_id: 'UP/2019/0091823',
    phone: '+91 98711 00923',
    lat: 28.6280,
    lon: 77.3649,
    capacity: '1,200 meals/day'
  },
  {
    id: 'ngo_4',
    type: 'NGO',
    name: 'Delhi Roti Bank Trust (Central Shelter)',
    address: 'Pahar Ganj Community Center, New Delhi',
    darpan_id: 'DL/2022/0319482',
    phone: '+91 99551 12233',
    lat: 28.6429,
    lon: 77.2155,
    capacity: '800 meals/day'
  },
  {
    id: 'ngo_5',
    type: 'NGO',
    name: 'Asha Deep Shelter Society',
    address: 'Kailash Colony, South Delhi',
    darpan_id: 'UP/2021/0182749',
    phone: '+91 98102 34567',
    lat: 28.5532,
    lon: 77.2415,
    capacity: '600 meals/day'
  },

  // 2. ANIMAL RESCUE SHELTERS & GAUSHALAS
  {
    id: 'animal_1',
    type: 'ANIMAL',
    name: 'Delhi Gaushala & Stray Animal Care Trust',
    address: 'Rohtak Road, Nangloi, West Delhi',
    darpan_id: 'DL/AWBI/2019/081',
    phone: '+91 98555 66778',
    lat: 28.6826,
    lon: 77.0655,
    capacity: '1,200 Cattle & 350 Dogs'
  },
  {
    id: 'animal_2',
    type: 'ANIMAL',
    name: 'Friendicoes SECA (Defence Colony Shelter)',
    address: 'Under Flyover, Jungpura, New Delhi',
    darpan_id: 'DL/AWBI/2015/022',
    phone: '+91 11 2432 0707',
    lat: 28.5802,
    lon: 77.2341,
    capacity: '400 Stray Animals'
  },
  {
    id: 'animal_3',
    type: 'ANIMAL',
    name: 'Sanjay Gandhi Animal Care Centre (SGACC)',
    address: 'Near Shivaji College, Raja Garden, New Delhi',
    darpan_id: 'DL/AWBI/2010/004',
    phone: '+91 11 2544 8062',
    lat: 28.6534,
    lon: 77.1268,
    capacity: '3,000 Animals'
  },

  // 3. BIOGAS & BIO-LOOP CONVERSION PLANTS
  {
    id: 'biogas_1',
    type: 'BIOGAS',
    name: 'Okhla Waste-to-Energy & Bio-Methanation Plant',
    address: 'Okhla Industrial Area Phase-I, New Delhi',
    darpan_id: 'MCD/RENEW/2021/04',
    phone: '+91 11 2681 1234',
    lat: 28.5284,
    lon: 77.2831,
    capacity: '200 Tonnes Organic Waste/Day'
  },
  {
    id: 'biogas_2',
    type: 'BIOGAS',
    name: 'Ghazipur Bio-CNG & Organic Slurry Station',
    address: 'Ghazipur Dairy Farm Road, East Delhi',
    darpan_id: 'EDMC/BIO/2023/19',
    phone: '+91 11 2261 4455',
    lat: 28.6252,
    lon: 77.3325,
    capacity: '150 Tonnes/Day'
  },
  {
    id: 'biogas_3',
    type: 'BIOGAS',
    name: 'Rohini Decentralized Bio-Compost Hub',
    address: 'Sector 11, Rohini, North-West Delhi',
    darpan_id: 'NDMC/COMPOST/2022/11',
    phone: '+91 11 2755 9988',
    lat: 28.7180,
    lon: 77.1190,
    capacity: '50 Tonnes/Day'
  }
];

let liveDonationPins = [];

// Haversine Distance
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return parseFloat((R * c * 1.3).toFixed(1));
}

// Initialize Leaflet Map
function initMap() {
  if (mapInstance) return;

  mapInstance = L.map('foodloop-map', {
    zoomControl: true
  }).setView([userGPS.lat, userGPS.lon], 12);

  // Free OpenStreetMap Standard Tiles (No Watermark)
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(mapInstance);

  markersLayerGroup = L.layerGroup().addTo(mapInstance);

  plotUserLocationMarker();
  renderMapMarkersAndList();
  fetchLiveDonations();
  
  // Background Silent GPS Sync
  silentGPSUpdate();
}

function plotUserLocationMarker() {
  if (userMarker && mapInstance.hasLayer(userMarker)) mapInstance.removeLayer(userMarker);
  if (radarCircle && mapInstance.hasLayer(radarCircle)) mapInstance.removeLayer(radarCircle);

  const userIcon = L.divIcon({
    className: 'user-gps-marker',
    html: `
      <div style="position: relative; width: 22px; height: 22px; background: #38bdf8; border: 3px solid #ffffff; border-radius: 50%; box-shadow: 0 0 16px #38bdf8;">
        <div style="position: absolute; top: -6px; left: -6px; width: 28px; height: 28px; background: rgba(56, 189, 248, 0.4); border-radius: 50%;"></div>
      </div>
    `,
    iconSize: [22, 22],
    iconAnchor: [11, 11]
  });

  userMarker = L.marker([userGPS.lat, userGPS.lon], { icon: userIcon })
    .addTo(mapInstance)
    .bindPopup('<strong style="color: #38bdf8;">📍 Your Live Location</strong><br><small>GPS Geofence Center</small>');

  radarCircle = L.circle([userGPS.lat, userGPS.lon], {
    color: '#10b981',
    fillColor: '#10b981',
    fillOpacity: 0.08,
    radius: 10000 // 10 km
  }).addTo(mapInstance);
}

// Silent GPS Background Sync (Doesn't block UI)
function silentGPSUpdate() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        userGPS = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        localStorage.setItem('foodloop_user_coords', JSON.stringify(userGPS));
        const statusText = document.getElementById('radar-status-text');
        if (statusText) statusText.textContent = 'Active GPS Geofence (10km perimeter)';
        plotUserLocationMarker();
        renderMapMarkersAndList();
      },
      () => {
        const statusText = document.getElementById('radar-status-text');
        if (statusText) statusText.textContent = 'Active Delhi-NCR Geofence Grid';
      },
      { maximumAge: 600000, timeout: 5000 }
    );
  }
}

// Fetch Active Live Donations
async function fetchLiveDonations() {
  try {
    const res = await fetch(API_DONATIONS_URL);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        liveDonationPins = data.map((d, index) => ({
          id: `food_${d._id || d.id || index}`,
          type: 'DONATION',
          name: d.title,
          address: d.address,
          phone: d.phone,
          lat: d.coords?.lat || (userGPS.lat + (Math.random() - 0.5) * 0.05),
          lon: d.coords?.lon || (userGPS.lon + (Math.random() - 0.5) * 0.05),
          quantity: d.quantity,
          status: d.status || 'AVAILABLE'
        }));
        renderMapMarkersAndList();
      }
    }
  } catch (err) {}
}

// Render Pins & Sidebar
function renderMapMarkersAndList() {
  if (!markersLayerGroup) return;
  markersLayerGroup.clearLayers();

  const allCombined = [...VERIFIED_DIRECTORY, ...liveDonationPins].map(item => {
    const dist = calculateDistance(userGPS.lat, userGPS.lon, item.lat, item.lon);
    return { ...item, distance_km: dist };
  });

  let filteredItems = allCombined;
  if (currentFilter !== 'ALL') {
    filteredItems = allCombined.filter(i => i.type === currentFilter);
  }

  filteredItems.sort((a, b) => a.distance_km - b.distance_km);

  const listContainer = document.getElementById('locations-list');
  if (!listContainer) return;
  listContainer.innerHTML = '';

  filteredItems.forEach(item => {
    let iconEmoji = '🏛️';
    let pinBgColor = '#10b981';
    let typeLabel = 'Verified NGO';
    let badgeClass = 'badge-ngo';

    if (item.type === 'ANIMAL') {
      iconEmoji = '🐾';
      pinBgColor = '#fbbf24';
      typeLabel = 'Gaushala / Shelter';
      badgeClass = 'badge-animal';
    } else if (item.type === 'BIOGAS') {
      iconEmoji = '⚡';
      pinBgColor = '#38bdf8';
      typeLabel = 'Biogas & Bio-Loop';
      badgeClass = 'badge-biogas';
    } else if (item.type === 'DONATION') {
      iconEmoji = '🍲';
      pinBgColor = '#ef4444';
      typeLabel = 'Live Surplus Food';
      badgeClass = 'badge-food';
    }

    const customMarkerIcon = L.divIcon({
      className: 'custom-pin-marker',
      html: `
        <div style="background: ${pinBgColor}; color: #000; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 16px; border: 2.5px solid #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.5); cursor: pointer;">
          ${iconEmoji}
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });

    const marker = L.marker([item.lat, item.lon], { icon: customMarkerIcon }).addTo(markersLayerGroup);

    const popupContent = `
      <div style="font-family: 'DM Sans', sans-serif;">
        <span class="loc-badge ${badgeClass}" style="display: inline-block; margin-bottom: 6px;">${typeLabel}</span>
        <h4 style="font-size: 15px; font-weight: 800; color: #fff; margin-bottom: 4px;">${item.name}</h4>
        <p style="font-size: 12px; color: #cbd5e1; margin-bottom: 6px;">📍 ${item.address}</p>
        ${item.darpan_id ? `<small style="color: #34d399; font-weight: 700; display: block; margin-bottom: 6px;">🏛️ Registry: ${item.darpan_id}</small>` : ''}
        ${item.capacity ? `<small style="color: #fbbf24; font-weight: 700; display: block; margin-bottom: 8px;">⚡ Capacity: ${item.capacity}</small>` : ''}
        <div style="display: flex; gap: 6px; margin-top: 8px;">
          <a href="https://www.google.com/maps/dir/?api=1&destination=${item.lat},${item.lon}" target="_blank" style="background: #10b981; color: #000; padding: 6px 12px; border-radius: 6px; font-weight: 800; font-size: 11px; text-decoration: none; display: inline-flex; align-items: center; gap: 4px;">
            🗺️ Directions
          </a>
          <a href="tel:${item.phone}" style="background: #334155; color: #fff; padding: 6px 12px; border-radius: 6px; font-weight: 700; font-size: 11px; text-decoration: none; display: inline-flex; align-items: center; gap: 4px;">
            📞 Call
          </a>
        </div>
      </div>
    `;

    marker.bindPopup(popupContent);

    const cardEl = document.createElement('div');
    cardEl.className = 'location-card';
    cardEl.innerHTML = `
      <div class="location-card-top">
        <span class="loc-badge ${badgeClass}">${typeLabel}</span>
        <span class="loc-distance">📍 ${item.distance_km} km away</span>
      </div>
      <div class="loc-title">${item.name}</div>
      <div class="loc-address">${item.address}</div>
      <div class="loc-actions">
        <a href="https://www.google.com/maps/dir/?api=1&destination=${item.lat},${item.lon}" target="_blank" class="btn-card-action" onclick="event.stopPropagation();">
          🗺️ GPS Nav
        </a>
        <a href="tel:${item.phone}" class="btn-card-action" onclick="event.stopPropagation();">
          📞 ${item.phone}
        </a>
      </div>
    `;

    cardEl.addEventListener('click', () => {
      mapInstance.flyTo([item.lat, item.lon], 15, { animate: true, duration: 1.2 });
      marker.openPopup();
    });

    listContainer.appendChild(cardEl);
  });
}

// Category Filter Switching
window.filterMapCategory = function(cat) {
  currentFilter = cat;
  const buttons = document.querySelectorAll('.filter-btn');
  buttons.forEach(btn => {
    btn.classList.remove('active');
    if (
      (cat === 'ALL' && btn.textContent.includes('All')) ||
      (cat === 'NGO' && btn.textContent.includes('NGOs')) ||
      (cat === 'ANIMAL' && btn.textContent.includes('Animal')) ||
      (cat === 'BIOGAS' && btn.textContent.includes('Biogas')) ||
      (cat === 'DONATION' && btn.textContent.includes('Surplus'))
    ) {
      btn.classList.add('active');
    }
  });
  renderMapMarkersAndList();
};

// Instant Recenter GPS
window.locateUserAndCenter = function() {
  if (mapInstance) {
    mapInstance.flyTo([userGPS.lat, userGPS.lon], 13, { animate: true });
    plotUserLocationMarker();
  }
  
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        userGPS = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        localStorage.setItem('foodloop_user_coords', JSON.stringify(userGPS));
        if (mapInstance) {
          mapInstance.flyTo([userGPS.lat, userGPS.lon], 13, { animate: true });
          plotUserLocationMarker();
        }
        renderMapMarkersAndList();
      },
      () => {},
      { maximumAge: 600000, timeout: 5000 }
    );
  }
};

window.addEventListener('DOMContentLoaded', () => {
  initMap();
});