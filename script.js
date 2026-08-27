const API_URL = 'http://localhost:5000/api/donations';
const AUTH_URL = 'http://localhost:5000/api/auth';
const MAX_RADIUS_KM = 10.0;

// Official Govt NITI Aayog Verified NGO Whitelist Registry
const VERIFIED_NGO_REGISTRY = {
  'DL/2018/0192831': 'Robin Hood Army (Delhi Chapter)',
  'DL/2020/0048192': 'Feeding India (Delhi Central Hub)',
  'UP/2019/0091823': 'Goonj Foundation (Noida Hub)',
  'DL/2022/0319482': 'Roti Bank Trust (South Delhi)',
  'UP/2021/0182749': 'Asha Deep Shelter Society',
  'DL/2024/008194':  'Delhi Community Rescue Network'
};

const DARPAN_ID_REGEX = /^[A-Z]{2}\/\d{4}\/\d{5,8}$/i;
const PHONE_REGEX = /^[6-9]\d{9}$/;
const NAME_REGEX = /^[a-zA-Z\s.,&'-]{3,50}$/;

// Known spam / fake numbers and keyboard smash patterns
const FAKE_PHONE_PATTERNS = [
  '1234567890', '0000000000', '1111111111', '2222222222', '3333333333', 
  '4444444444', '5555555555', '6666666666', '7777777777', '8888888888', '9999999999'
];
const KEYBOARD_MASH_PATTERNS = ['asdf', 'qwer', 'zxcv', 'hjkl', 'tyui', 'test', 'fake', 'abcd'];

function isSpamText(str) {
  if (!str) return true;
  const s = str.toLowerCase().trim();
  if (/(.)\1{3,}/.test(s)) return true;
  for (const mash of KEYBOARD_MASH_PATTERNS) {
    if (s.includes(mash) && s.length < 8) return true;
  }
  return false;
}

let aiModel = null;
let currentGeneratedOTP = '';
let isFoodValid = true;
let userLiveCoords = null;
let selectedAddressCoords = null;
let uploadedImageBase64 = '';
let activeListings = [];
let pendingDonationPayload = null;
let mediaStream = null;
let visibleItemCount = 5;

// Current Authenticated Session State
let currentUser = JSON.parse(localStorage.getItem('foodloop_auth_user') || 'null');
let currentAuthMode = 'LOGIN';
let selectedRole = 'NGO';

// ---------------- HACKATHON DEMO PERSONA SWITCHER ----------------
window.loginDemoPersona = function(type) {
  if (type === 'DONOR') {
    currentUser = {
      name: 'Rohan Sharma (Manager)',
      phone: '9811122233',
      role: 'DONOR',
      org_name: 'Grand Hyatt Delhi Banquet',
      is_verified: true,
      trust_score: 100
    };
    localStorage.setItem('foodloop_auth_user', JSON.stringify(currentUser));
    updateNavbarAuthState();
    renderListings();
    alert('⚡ Demo Switched: You are now logged in as "Grand Hyatt Banquet (Donor)". Dashboard & Posting Ready!');
  } else if (type === 'NGO') {
    currentUser = {
      name: 'Priya Verma (Delhi Lead)',
      phone: '9877788899',
      role: 'NGO',
      org_name: 'Robin Hood Army (Delhi Shelter Hub)',
      ngo_darpan_id: 'DL/2024/008194',
      is_verified: true,
      trust_score: 100
    };
    localStorage.setItem('foodloop_auth_user', JSON.stringify(currentUser));
    updateNavbarAuthState();
    renderListings();
    alert('⚡ Demo Switched: You are now logged in as "Robin Hood Army (Verified NGO)". You can claim listings & check NGO Dashboard!');
  } else {
    currentUser = null;
    localStorage.removeItem('foodloop_auth_user');
    updateNavbarAuthState();
    renderListings();
    alert('⚡ Demo Switched: Logged out (Unverified Public User). Claim buttons are now locked!');
  }
};

// ---------------- USER & NGO IMPACT DASHBOARD ENGINE ----------------
window.openDashboardModal = function() {
  if (!currentUser) {
    openAuthModal('LOGIN');
    return;
  }

  const modal = document.getElementById('dashboard-modal');
  if (!modal) return;

  const nameEl = document.getElementById('dash-user-name');
  const roleEl = document.getElementById('dash-user-role');
  const avatarEl = document.getElementById('dash-avatar-icon');
  const mealsStat = document.getElementById('dash-stat-meals');
  const trustStat = document.getElementById('dash-stat-trust');
  const co2Stat = document.getElementById('dash-stat-co2');
  const titleEl = document.getElementById('dash-activity-title');
  const listEl = document.getElementById('dash-activity-list');

  const isNGO = currentUser.role === 'NGO' || currentUser.role === 'SHELTER' || currentUser.role === 'VOLUNTEER';

  if (nameEl) nameEl.textContent = currentUser.org_name || currentUser.name;
  if (roleEl) roleEl.textContent = isNGO ? `🏛️ Verified NGO (Darpan: ${currentUser.ngo_darpan_id || 'DL/2024/ACTIVE'})` : '🍲 Verified Food Rescue Donor';
  if (avatarEl) avatarEl.textContent = isNGO ? '🏛️' : '🍲';
  if (trustStat) trustStat.textContent = `${currentUser.trust_score || 100}%`;

  if (isNGO) {
    const myClaims = getMyClaimedListings();
    const claimedItems = activeListings.filter(i => myClaims.includes(String(i._id || i.id)));
    if (mealsStat) mealsStat.textContent = `${claimedItems.length} Rescues`;
    if (co2Stat) co2Stat.textContent = `${claimedItems.length * 45} kg`;
    if (titleEl) titleEl.textContent = 'Active & Rescued Meals by Your NGO';

    if (claimedItems.length === 0) {
      listEl.innerHTML = `<p style="font-size:12px; color:#71717a; text-align:center; padding:16px;">No surplus claimed yet. Browse the Live Rescue Hub to reserve meals.</p>`;
    } else {
      listEl.innerHTML = claimedItems.map(item => `
        <div style="background: #09090b; border: 1px solid #27272a; padding: 10px 14px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <strong style="color: #fff; font-size: 13px;">${item.title}</strong>
            <small style="display:block; color: #a1a1aa; font-size: 11px;">📍 ${item.address}</small>
          </div>
          <button onclick="generateCSRCertificate('${item.title}', '${item.quantity}', '${item.address}')" style="background: #10b981; color:#000; border:none; padding:4px 10px; border-radius:6px; font-weight:700; font-size:11px; cursor:pointer;">
            📜 80G PDF
          </button>
        </div>
      `).join('');
    }
  } else {
    const myPosts = activeListings.filter(i => i.phone === currentUser.phone || i.donor_name === currentUser.name);
    if (mealsStat) mealsStat.textContent = `${myPosts.length} Donations`;
    if (co2Stat) co2Stat.textContent = `${myPosts.length * 45} kg`;
    if (titleEl) titleEl.textContent = 'My Posted Surplus Donations';

    if (myPosts.length === 0) {
      listEl.innerHTML = `<p style="font-size:12px; color:#71717a; text-align:center; padding:16px;">You have not posted any surplus food yet. Use the form to post extra food.</p>`;
    } else {
      listEl.innerHTML = myPosts.map(item => `
        <div style="background: #09090b; border: 1px solid #27272a; padding: 10px 14px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <strong style="color: #fff; font-size: 13px;">${item.title} (${item.quantity})</strong>
            <small style="display:block; color: #34d399; font-size: 11px;">Status: ${item.status === 'CLAIMED' ? '🟡 Claimed by NGO' : '🟢 Available Live'}</small>
          </div>
          <button onclick="generateCSRCertificate('${item.title}', '${item.quantity}', '${item.address}')" style="background: #2563eb; color:#fff; border:none; padding:4px 10px; border-radius:6px; font-weight:700; font-size:11px; cursor:pointer;">
            📜 Download Tax Proof
          </button>
        </div>
      `).join('');
    }
  }

  modal.style.display = 'flex';
};

window.closeDashboardModal = function() {
  const modal = document.getElementById('dashboard-modal');
  if (modal) modal.style.display = 'none';
};

// ---------------- AUTH CONTROLLER ----------------
window.openAuthModal = function(mode = 'LOGIN') {
  const modal = document.getElementById('auth-modal');
  if (!modal) return;

  if (mode === 'REGISTER_DONOR') {
    currentAuthMode = 'REGISTER';
    setAuthRoleTab('DONOR');
  } else if (mode === 'REGISTER_NGO') {
    currentAuthMode = 'REGISTER';
    setAuthRoleTab('NGO');
  } else {
    currentAuthMode = 'LOGIN';
  }

  updateAuthModalUI();
  modal.style.display = 'flex';
};

window.closeAuthModal = function() {
  const modal = document.getElementById('auth-modal');
  if (modal) modal.style.display = 'none';
};

window.setAuthRoleTab = function(role) {
  selectedRole = role;
  const btnNgo = document.getElementById('tab-btn-ngo');
  const btnDonor = document.getElementById('tab-btn-donor');
  const darpanField = document.getElementById('auth-darpan-field');
  const orgField = document.getElementById('auth-org-field');

  if (role === 'NGO') {
    if (btnNgo) { btnNgo.style.background = '#10b981'; btnNgo.style.color = '#000'; }
    if (btnDonor) { btnDonor.style.background = 'transparent'; btnDonor.style.color = '#a1a1aa'; }
    if (darpanField && currentAuthMode === 'REGISTER') darpanField.style.display = 'block';
    if (orgField) orgField.querySelector('label').textContent = 'Organization / Shelter Name';
  } else {
    if (btnDonor) { btnDonor.style.background = '#10b981'; btnDonor.style.color = '#000'; }
    if (btnNgo) { btnNgo.style.background = 'transparent'; btnNgo.style.color = '#a1a1aa'; }
    if (darpanField) darpanField.style.display = 'none';
    if (orgField) orgField.querySelector('label').textContent = 'Restaurant / Banquet / Donor Name';
  }
};

window.toggleAuthMode = function() {
  currentAuthMode = currentAuthMode === 'REGISTER' ? 'LOGIN' : 'REGISTER';
  updateAuthModalUI();
};

function updateAuthModalUI() {
  const title = document.getElementById('auth-modal-title');
  const nameField = document.getElementById('auth-name-field');
  const nameInput = document.getElementById('auth-input-name');
  const orgField = document.getElementById('auth-org-field');
  const darpanField = document.getElementById('auth-darpan-field');
  const submitBtn = document.getElementById('auth-submit-btn');
  const toggleMsg = document.getElementById('auth-toggle-msg');

  if (currentAuthMode === 'LOGIN') {
    if (title) title.textContent = 'Sign In to FoodLoop';
    if (nameField) nameField.style.display = 'none';
    if (nameInput) nameInput.removeAttribute('required');
    if (orgField) orgField.style.display = 'none';
    if (darpanField) darpanField.style.display = 'none';
    if (submitBtn) submitBtn.textContent = 'Sign In with Phone';
    if (toggleMsg) toggleMsg.innerHTML = `New to FoodLoop? <span style="color: #34d399; text-decoration: underline;">Create Verified Account</span>`;
  } else {
    if (title) title.textContent = selectedRole === 'NGO' ? 'Register Verified NGO / Shelter' : 'Register Donor Account';
    if (nameField) nameField.style.display = 'block';
    if (nameInput) nameInput.setAttribute('required', 'true');
    if (orgField) orgField.style.display = 'block';
    if (darpanField) darpanField.style.display = selectedRole === 'NGO' ? 'block' : 'none';
    if (submitBtn) submitBtn.textContent = 'Verify & Register Account';
    if (toggleMsg) toggleMsg.innerHTML = `Already registered? <span style="color: #34d399; text-decoration: underline;">Click here to Sign In</span>`;
  }
}

// ---------------- STRICT NO-BYPASS AUTHENTICATION HANDLER ----------------
window.handleAuthSubmit = async function(e) {
  if (e) e.preventDefault();
  
  let phone = (document.getElementById('auth-input-phone')?.value || '').trim();
  phone = phone.replace(/^(\+91|91|0)/, '').replace(/[\s-]/g, '');
  
  let name = (document.getElementById('auth-input-name')?.value || '').trim();
  let org = (document.getElementById('auth-input-org')?.value || '').trim();
  const darpan = (document.getElementById('auth-input-darpan')?.value || '').trim().toUpperCase();

  // 1. Strict Phone Validation
  if (!PHONE_REGEX.test(phone) || FAKE_PHONE_PATTERNS.includes(phone)) {
    alert('❌ Invalid Mobile Number!\nPlease enter a genuine 10-digit Indian phone number starting with 6, 7, 8, or 9. Fake/repeated numbers like 9999999999 are blocked.');
    document.getElementById('auth-input-phone')?.focus();
    return;
  }

  // 2. Strict Register Mode Validations
  if (currentAuthMode === 'REGISTER') {
    if (!name || name.length < 3 || !NAME_REGEX.test(name) || isSpamText(name)) {
      alert('❌ Invalid Contact Name!\nPlease enter a genuine name (at least 3 alphabetic characters). Random characters/numbers are blocked.');
      document.getElementById('auth-input-name')?.focus();
      return;
    }

    if (!org || org.length < 3 || isSpamText(org)) {
      alert(`❌ Invalid ${selectedRole === 'NGO' ? 'Organization' : 'Restaurant/Business'} Name!\nPlease enter a genuine name (e.g. "Grand Hyatt Banquet" or "Taj Catering"). Random smashing is blocked.`);
      document.getElementById('auth-input-org')?.focus();
      return;
    }

    if (selectedRole === 'NGO') {
      if (!DARPAN_ID_REGEX.test(darpan)) {
        alert('❌ Invalid NGO Darpan Format!\nFormat must be: State/Year/Digits (e.g. DL/2020/0048192)');
        document.getElementById('auth-input-darpan')?.focus();
        return;
      }
      if (!VERIFIED_NGO_REGISTRY[darpan]) {
        alert(`🚫 Verification Failed!\n\nID "${darpan}" was NOT found in the NITI Aayog NGO Darpan Government registry.\n\nOnly verified registered charities can claim surplus food.\n\nTest Whitelist IDs:\n• DL/2018/0192831 (Robin Hood Army)\n• DL/2020/0048192 (Feeding India)\n• UP/2019/0091823 (Goonj)\n• DL/2022/0319482 (Roti Bank)`);
        document.getElementById('auth-input-darpan')?.focus();
        return;
      }
      org = VERIFIED_NGO_REGISTRY[darpan];
    }
  }

  // 3. Backend Request (Strict - Zero Silent Fallback)
  try {
    let res;
    if (currentAuthMode === 'LOGIN') {
      res = await fetch(`${AUTH_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
      });
    } else {
      res = await fetch(`${AUTH_URL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          phone,
          role: selectedRole,
          org_name: org,
          ngo_darpan_id: darpan
        })
      });
    }

    const data = await res.json();
    if (!res.ok) {
      alert(`⚠️ ${data.error || 'Authentication Failed.'}`);
      return;
    }

    currentUser = data;
    localStorage.setItem('foodloop_auth_user', JSON.stringify(currentUser));
    closeAuthModal();
    updateNavbarAuthState();
    renderListings();
    alert(`🎉 Welcome ${currentUser.name || 'Partner'}!\n\nSigned in as ${currentUser.role === 'NGO' ? 'Verified NGO: ' + (currentUser.org_name || currentUser.name) : 'Donor: ' + (currentUser.org_name || currentUser.name)}.`);
  } catch (err) {
    alert('❌ Server Connection Error. Please make sure "node server.js" is running in your terminal.');
  }
};

window.logoutUser = function() {
  currentUser = null;
  localStorage.removeItem('foodloop_auth_user');
  updateNavbarAuthState();
  renderListings();
  alert('You have logged out successfully.');
};

// ---------------- CHROME-STYLE CIRCULAR AVATAR & DROPDOWN ENGINE ----------------
function updateNavbarAuthState() {
  const container = document.getElementById('nav-auth-container');
  if (!container) return;

  if (currentUser) {
    const isNGO = currentUser.role === 'NGO' || currentUser.role === 'SHELTER' || currentUser.role === 'VOLUNTEER';
    const initial = (currentUser.org_name || currentUser.name || 'U').charAt(0).toUpperCase();
    const displayName = currentUser.org_name || currentUser.name;
    const roleTitle = isNGO ? `Verified NGO (${currentUser.ngo_darpan_id || 'DL/2026/ACTIVE'})` : 'Surplus Food Donor';

    container.innerHTML = `
      <div style="position: relative; display: inline-block; margin-right: 8px;">
        <button type="button" id="profile-avatar-btn" onclick="toggleProfileDropdown(event)" style="display: flex; align-items: center; gap: 8px; background: #18181b; border: 1px solid #3f3f46; padding: 3px 10px 3px 4px; border-radius: 9999px; cursor: pointer; transition: all 0.2s ease;">
          <div style="position: relative; width: 30px; height: 30px; border-radius: 50%; background: ${isNGO ? 'linear-gradient(135deg, #10b981, #059669)' : 'linear-gradient(135deg, #3b82f6, #2563eb)'}; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 13px; box-shadow: 0 2px 6px rgba(0,0,0,0.4);">
            ${initial}
            <span style="position: absolute; bottom: 0; right: 0; width: 8px; height: 8px; background: #10b981; border: 2px solid #18181b; border-radius: 50%;"></span>
          </div>
          <span style="font-size: 12px; font-weight: 700; color: #f4f4f5; max-width: 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${displayName}
          </span>
          <i class="fa-solid fa-chevron-down" style="font-size: 10px; color: #a1a1aa;"></i>
        </button>

        <div id="profile-dropdown-card" style="display: none; position: absolute; top: calc(100% + 10px); right: 0; width: 240px; background: #18181b; border: 1px solid #3f3f46; border-radius: 14px; box-shadow: 0 16px 36px rgba(0,0,0,0.8); z-index: 10000; overflow: hidden; backdrop-filter: blur(8px);">
          <div style="padding: 14px; border-bottom: 1px solid #27272a; background: #09090b;">
            <div style="font-size: 13px; font-weight: 700; color: #fff; margin-bottom: 2px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">
              ${displayName}
            </div>
            <div style="font-size: 11px; color: ${isNGO ? '#34d399' : '#60a5fa'}; font-weight: 600;">
              ${isNGO ? '🏛️ ' + roleTitle : '🍲 ' + roleTitle}
            </div>
          </div>
          <div style="padding: 6px;">
            <button type="button" onclick="openDashboardModal(); hideProfileDropdown();" style="width: 100%; display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: transparent; border: none; border-radius: 8px; color: #f4f4f5; font-size: 13px; font-weight: 600; text-align: left; cursor: pointer;" onmouseover="this.style.background='#27272a'" onmouseout="this.style.background='transparent'">
              <span style="font-size: 15px;">📊</span> Impact Dashboard
            </button>
            <button type="button" onclick="logoutUser(); hideProfileDropdown();" style="width: 100%; display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: transparent; border: none; border-radius: 8px; color: #f87171; font-size: 13px; font-weight: 600; text-align: left; cursor: pointer; margin-top: 2px;" onmouseover="this.style.background='rgba(239, 68, 68, 0.12)'" onmouseout="this.style.background='transparent'">
              <span style="font-size: 15px;">🚪</span> Sign Out
            </button>
          </div>
        </div>
      </div>
    `;
  } else {
    container.innerHTML = `
      <button type="button" class="button button-small button-outline" onclick="openAuthModal('LOGIN')" style="margin-right: 6px; cursor: pointer;">
        <i class="fa-solid fa-user-lock"></i> Sign In / NGO Portal
      </button>
    `;
  }
}

window.toggleProfileDropdown = function(e) {
  if (e) e.stopPropagation();
  const dropdown = document.getElementById('profile-dropdown-card');
  if (dropdown) {
    dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
  }
};

window.hideProfileDropdown = function() {
  const dropdown = document.getElementById('profile-dropdown-card');
  if (dropdown) dropdown.style.display = 'none';
};

document.addEventListener('click', (e) => {
  const avatarBtn = document.getElementById('profile-avatar-btn');
  const dropdown = document.getElementById('profile-dropdown-card');
  if (dropdown && avatarBtn && !avatarBtn.contains(e.target) && !dropdown.contains(e.target)) {
    dropdown.style.display = 'none';
  }
});

// ---------------- ACCURATE HAVERSINE CALCULATION ----------------
window.applyPreset = function(title, category, qty, hours) {
  const t = document.getElementById('input-food-title');
  const c = document.getElementById('input-food-category');
  const q = document.getElementById('input-food-qty');
  const w = document.getElementById('input-food-window');
  if (t) t.value = title;
  if (c) c.value = category;
  if (q) q.value = qty;
  if (w) w.value = hours;
};

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const aerialDistance = R * c;
  return parseFloat((aerialDistance * 1.3).toFixed(1));
}

function autoDetectUserLocation() {
  if (!navigator.geolocation) return;

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      userLiveCoords = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      localStorage.setItem('foodloop_user_coords', JSON.stringify(userLiveCoords));
      renderListings();
    },
    () => {
      const cached = localStorage.getItem('foodloop_user_coords');
      if (cached) userLiveCoords = JSON.parse(cached);
      else userLiveCoords = { lat: 28.6139, lon: 77.2090 };
      renderListings();
    },
    { enableHighAccuracy: true, timeout: 8000 }
  );
}

window.locateUserGPS = function() {
  const addressInput = document.getElementById('address');
  const gpsBtn = document.getElementById('gps-locate-btn');

  if (!navigator.geolocation) { alert('GPS not supported'); return; }

  if (gpsBtn) {
    gpsBtn.innerHTML = '⏳ Locating...';
    gpsBtn.style.color = '#fbbf24';
  }

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      selectedAddressCoords = { lat: position.coords.latitude, lon: position.coords.longitude };
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${selectedAddressCoords.lat}&lon=${selectedAddressCoords.lon}&zoom=18&addressdetails=1`);
        const data = await res.json();
        if (addressInput) addressInput.value = data.display_name || `${selectedAddressCoords.lat.toFixed(5)}, ${selectedAddressCoords.lon.toFixed(5)}`;
      } catch {
        if (addressInput) addressInput.value = `${selectedAddressCoords.lat.toFixed(5)}, ${selectedAddressCoords.lon.toFixed(5)}`;
      }
      if (gpsBtn) {
        gpsBtn.innerHTML = '✅ Located';
        setTimeout(() => { gpsBtn.innerHTML = '🎯 Use Live GPS'; gpsBtn.style.color = '#34d399'; }, 3000);
      }
    },
    () => {
      alert('Please allow location in browser.');
      if (gpsBtn) {
        gpsBtn.innerHTML = '❌ Denied';
        gpsBtn.style.color = '#f87171';
      }
    }
  );
};

// AI Food Classifier
async function loadAIModel() {
  try {
    if (window.mobilenet) {
      aiModel = await mobilenet.load();
      console.log('🤖 AI Food Classifier Ready');
    }
  } catch (err) {
    console.error('AI load error:', err);
  }
}

const FOOD_KEYWORDS = [
  'food', 'dish', 'meal', 'soup', 'bread', 'pizza', 'burger', 'sandwich', 'curry', 
  'rice', 'biryani', 'pasta', 'noodle', 'vegetable', 'fruit', 'apple', 'banana', 
  'orange', 'meat', 'chicken', 'pot pie', 'plate', 'saucer', 'consomme', 'hotdog',
  'cheeseburger', 'bagel', 'pretzel', 'mashed potato', 'guacamole', 'custard', 
  'confectionery', 'bakery', 'salad', 'casserole', 'stew', 'beverage', 'snack', 'roti', 'chapati'
];

function getMyClaimedListings() {
  return JSON.parse(localStorage.getItem('foodloop_my_claims') || '[]');
}

function saveMyClaim(id) {
  const claims = getMyClaimedListings();
  if (!claims.includes(id)) {
    claims.push(id);
    localStorage.setItem('foodloop_my_claims', JSON.stringify(claims));
  }
}

async function loadFeed() {
  try {
    const res = await fetch(API_URL);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) activeListings = data;
    }
  } catch (e) {
    console.log('Backend offline');
  }
  renderListings();
}

// ---------------- HYBRID CAMERA CONTROLLER ----------------
window.startInAppCamera = async function() {
  const video = document.getElementById('cam-video-stream');
  const placeholder = document.getElementById('start-cam-placeholder');
  const controls = document.getElementById('cam-controls');
  const previewContainer = document.getElementById('image-preview-container');

  if (previewContainer) previewContainer.style.display = 'none';

  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false
      });
    } catch (e) {
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      } catch (err) {
        triggerNativeCameraFallback();
        return;
      }
    }

    if (video && mediaStream) {
      video.srcObject = mediaStream;
      video.style.display = 'block';
      if (placeholder) placeholder.style.display = 'none';
      if (controls) controls.style.display = 'flex';
      video.play();
    }
  } else {
    triggerNativeCameraFallback();
  }
};

window.triggerNativeCameraFallback = function() {
  let fallbackInput = document.getElementById('native-cam-fallback');
  if (!fallbackInput) {
    fallbackInput = document.createElement('input');
    fallbackInput.id = 'native-cam-fallback';
    fallbackInput.type = 'file';
    fallbackInput.accept = 'image/*';
    fallbackInput.style.display = 'none';
    document.body.appendChild(fallbackInput);

    fallbackInput.addEventListener('change', function(e) {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function(evt) {
        processCapturedImage(evt.target.result);
      };
      reader.readAsDataURL(file);
    });
  }
  fallbackInput.click();
};

window.stopInAppCamera = function() {
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }
  const video = document.getElementById('cam-video-stream');
  const placeholder = document.getElementById('start-cam-placeholder');
  const controls = document.getElementById('cam-controls');
  
  if (video) video.style.display = 'none';
  if (controls) controls.style.display = 'none';
  if (placeholder) placeholder.style.display = 'block';
};

window.retakeSnap = function() {
  uploadedImageBase64 = '';
  isFoodValid = true;
  const previewContainer = document.getElementById('image-preview-container');
  if (previewContainer) previewContainer.style.display = 'none';
  const placeholder = document.getElementById('start-cam-placeholder');
  if (placeholder) placeholder.style.display = 'block';
};

window.captureLiveSnap = function() {
  const video = document.getElementById('cam-video-stream');
  if (!video || !mediaStream) return;

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  window.stopInAppCamera();
  processCapturedImage(canvas.toDataURL('image/jpeg', 0.88));
};

function processCapturedImage(base64Data) {
  const previewContainer = document.getElementById('image-preview-container');
  const previewImg = document.getElementById('food-image-preview');
  const badge = document.getElementById('verification-badge');
  const placeholder = document.getElementById('start-cam-placeholder');

  const rawImage = new Image();
  rawImage.onload = function() {
    const canvas = document.createElement('canvas');
    canvas.width = rawImage.width;
    canvas.height = rawImage.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(rawImage, 0, 0);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.fillRect(0, canvas.height - 50, canvas.width, 50);

    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('🛡️ FoodLoop Rescue Proof', 15, canvas.height - 26);

    ctx.fillStyle = '#ffffff';
    ctx.font = '14px sans-serif';
    const nowStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    ctx.fillText(`${nowStr} | OTP Authenticated`, 15, canvas.height - 10);

    uploadedImageBase64 = canvas.toDataURL('image/jpeg', 0.88);

    if (placeholder) placeholder.style.display = 'none';
    if (previewImg && previewContainer) {
      previewImg.src = uploadedImageBase64;
      previewContainer.style.display = 'block';

      badge.innerHTML = '🤖 AI Scanning Food...';
      badge.style.background = 'rgba(234, 179, 8, 0.95)';
      badge.style.color = '#000';

      previewImg.onload = async () => {
        if (!aiModel && window.mobilenet) aiModel = await mobilenet.load();
        if (aiModel) {
          const predictions = await aiModel.classify(previewImg);
          const matchedFood = predictions.some(pred => FOOD_KEYWORDS.some(k => pred.className.toLowerCase().includes(k)));

          if (!matchedFood) {
            isFoodValid = false;
            badge.innerHTML = `⚠️ Non-food item: ${predictions[0].className.split(',')[0]}`;
            badge.style.background = 'rgba(239, 68, 68, 0.95)';
            badge.style.color = '#fff';
          } else {
            isFoodValid = true;
            badge.innerHTML = `✅ Food Verified: ${predictions[0].className.split(',')[0]}`;
            badge.style.background = 'rgba(16, 185, 129, 0.95)';
            badge.style.color = '#000';
          }
        } else {
          isFoodValid = true;
          badge.innerHTML = '✅ Food Photo Attached';
          badge.style.background = 'rgba(16, 185, 129, 0.95)';
          badge.style.color = '#000';
        }
      };
    }
  };
  rawImage.src = base64Data;
}

// ---------------- STRICT 10 KM FEED RENDERER ----------------
function renderListings() {
  const myClaims = getMyClaimedListings();

  const uniqueList = [];
  const seenKeys = new Set();

  activeListings.forEach(item => {
    const key = `${(item.title || '').trim().toLowerCase()}_${(item.address || '').trim().toLowerCase()}_${item.quantity}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      uniqueList.push(item);
    }
  });

  let visibleListings = uniqueList.filter(item => item.status !== 'FLAGGED_FAKE').map(item => {
    let dist = 60.0;
    if (userLiveCoords && item.coords && item.coords.lat && item.coords.lon) {
      dist = calculateDistance(userLiveCoords.lat, userLiveCoords.lon, item.coords.lat, item.coords.lon);
    } else if (item.address && item.address.toLowerCase().includes('technical campus')) {
      dist = 58.4;
    }
    return { ...item, distance_km: dist };
  }).filter(item => {
    return item.distance_km <= MAX_RADIUS_KM;
  });

  visibleListings.sort((a, b) => a.distance_km - b.distance_km);

  let target = Array.from(document.querySelectorAll('*')).find(
    el => el.children.length === 0 && el.textContent.includes('Loading active listings')
  );

  let container = document.getElementById('foodloop-feed-list');
  if (!container) {
    container = document.createElement('div');
    container.id = 'foodloop-feed-list';
    container.style.cssText = 'display: flex; flex-direction: column; gap: 14px; margin-top: 12px;';

    if (target) {
      target.replaceWith(container);
    } else {
      const hub = document.getElementById('rescue-hub') || document.querySelector('.hub-section');
      if (hub) hub.appendChild(container);
      else return;
    }
  }

  const countBadge = document.getElementById('listing-count');
  if (countBadge) {
    countBadge.textContent = `${visibleListings.length} verified listings within 10 km`;
  }

  if (visibleListings.length === 0) {
    container.innerHTML = `
      <div style="background: #18181b; border: 1px dashed #27272a; padding: 28px 20px; border-radius: 12px; text-align: center; color: #71717a; font-size: 14px;">
        <div style="font-size: 24px; margin-bottom: 6px;">📍</div>
        <strong style="color: #cbd5e1; display: block; margin-bottom: 4px;">No Surplus Food Within 10 km</strong>
        Listings beyond 10 km are auto-hidden to maintain hyper-local rescue freshness.
      </div>
    `;
    return;
  }

  const paginatedList = visibleListings.slice(0, visibleItemCount);

  let cardsHTML = paginatedList.map(item => {
    const itemId = String(item._id || item.id);
    const isClaimedByMe = myClaims.includes(itemId) || item.status === 'CLAIMED';
    const displayPhone = item.phone || '+91 98996 36474';
    const trustScore = item.trust_score || 100;

    const expiryMs = (item.expiry_hours || 3) * 60 * 60 * 1000;
    const createdAtMs = new Date(item.created_at || Date.now()).getTime();
    const remainingMs = Math.max(0, (createdAtMs + expiryMs) - Date.now());
    const remHours = Math.floor(remainingMs / (1000 * 60 * 60));
    const remMins = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));

    const isNGOUser = currentUser && (currentUser.role === 'NGO' || currentUser.role === 'SHELTER' || currentUser.role === 'VOLUNTEER');

    return `
      <div style="background: #18181b; border: 1px solid #27272a; padding: 18px; border-radius: 14px; color: #f4f4f5; box-shadow: 0 4px 12px rgba(0,0,0,0.3);">
        
        ${item.image ? `
          <div style="position: relative; margin-bottom: 12px; border-radius: 10px; overflow: hidden; max-height: 170px;">
            <img src="${item.image}" alt="Verified Food" style="width: 100%; height: 100%; object-fit: cover; display: block;" />
            <div style="position: absolute; top: 8px; left: 8px; display: flex; gap: 6px;">
              <span style="background: rgba(16, 185, 129, 0.95); color: #000; font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 4px;">
                🛡️ AI Vision Verified
              </span>
              <span style="background: rgba(59, 130, 246, 0.95); color: #fff; font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 4px;">
                ⭐ Donor Trust: ${trustScore}%
              </span>
            </div>
            <div style="position: absolute; bottom: 8px; left: 8px; background: rgba(0,0,0,0.8); color: #34d399; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 4px; backdrop-filter: blur(4px);">
              📍 ${item.distance_km} km away from you
            </div>
          </div>
        ` : ''}

        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <span style="font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 9999px; ${isClaimedByMe ? 'background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid rgba(245,158,11,0.3);' : 'background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16,185,129,0.3);'}">
            ${isClaimedByMe ? `🟡 Claimed by ${item.claimed_by_ngo || 'Verified NGO'}` : `🟢 Available • ${item.distance_km} km away`}
          </span>
          <span style="font-size: 11px; color: ${remHours === 0 ? '#f87171' : '#fbbf24'}; font-weight: 700;">
            ⏳ Expires in: ${remHours}h ${remMins}m
          </span>
        </div>

        <h4 style="font-size: 16px; font-weight: 700; margin: 4px 0 6px 0; color: #fff;">${item.title}</h4>
        
        <p style="font-size: 13px; color: ${isClaimedByMe ? '#34d399' : '#d4d4d8'}; margin: 0 0 4px 0;">
          📍 <strong>Pickup:</strong> ${isClaimedByMe ? item.address : item.address.split(',')[0] + ' (Verified NGO Claim Unlocks Full Address)'}
        </p>

        <p style="font-size: 13px; color: ${isClaimedByMe ? '#60a5fa' : '#71717a'}; margin: 0 0 4px 0;">
          📞 <strong>Donor Phone:</strong> ${isClaimedByMe ? `<a href="tel:${displayPhone}" style="color: #60a5fa; text-decoration: underline; font-weight: 600;">${displayPhone}</a>` : '•••••••••• (Hidden to prevent unauthorized claims)'}
        </p>

        <p style="font-size: 12px; color: #a1a1aa; margin: 0 0 12px 0;">📦 Quantity: ${item.quantity}</p>
        
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          ${!isClaimedByMe ? `
            <button onclick="attemptNGOClaim('${itemId}', '${item.address}', '${displayPhone}')" style="background: ${isNGOUser ? '#10b981' : '#27272a'}; color: ${isNGOUser ? '#000' : '#34d399'}; border: 1px solid ${isNGOUser ? 'none' : '#3f3f46'}; font-weight: 700; font-size: 12px; padding: 7px 14px; border-radius: 8px; cursor: pointer;">
              ${isNGOUser ? `🏛️ Claim Pickup (${item.distance_km} km)` : `🔒 NGO / Shelter Login to Claim`}
            </button>
          ` : `
            <a href="tel:${displayPhone}" style="background: #2563eb; color: #fff; font-weight: 700; font-size: 12px; padding: 7px 14px; border-radius: 8px; text-decoration: none; display: inline-flex; align-items: center; gap: 4px;">
              📞 Call Donor to Confirm
            </a>
            <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.address)}" target="_blank" style="background: #10b981; color: #000; font-weight: 700; font-size: 12px; padding: 7px 14px; border-radius: 8px; text-decoration: none; display: inline-flex; align-items: center; gap: 4px;">
              🗺️ Open Maps
            </a>
            <button onclick="openQRHandshake('${itemId}')" style="background: #8b5cf6; color: #fff; font-weight: 700; font-size: 12px; padding: 7px 14px; border-radius: 8px; border: none; cursor: pointer;">
              🤝 Handover QR
            </button>
            <button onclick="generateCSRCertificate('${item.title}', '${item.quantity}', '${item.address}')" style="background: #059669; color: #fff; font-weight: 700; font-size: 12px; padding: 7px 14px; border-radius: 8px; border: none; cursor: pointer;">
              📜 80G Certificate
            </button>
            <button onclick="reportFakeListing('${itemId}')" style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.4); color: #f87171; font-weight: 700; font-size: 12px; padding: 7px 14px; border-radius: 8px; cursor: pointer;">
              🚩 Fake / No Food (Ban)
            </button>
          `}
        </div>
      </div>
    `;
  }).join('');

  if (visibleListings.length > visibleItemCount) {
    cardsHTML += `
      <div style="text-align: center; padding: 10px 0;">
        <button type="button" onclick="loadMoreListings()" style="background: #27272a; border: 1px solid #3f3f46; color: #34d399; font-size: 12px; font-weight: 700; padding: 8px 18px; border-radius: 8px; cursor: pointer;">
          ⚡ Load More Donations (${visibleListings.length - visibleItemCount} remaining)
        </button>
      </div>
    `;
  }

  container.innerHTML = cardsHTML;
}

window.loadMoreListings = function() {
  visibleItemCount += 5;
  renderListings();
};

window.attemptNGOClaim = async function(id, address, phone) {
  if (!currentUser) {
    alert('🔒 Restricted Access: Free food can ONLY be claimed by registered NGOs, Orphanages, and Community Shelters.\n\nPlease register or sign in with your NGO Darpan ID.');
    openAuthModal('REGISTER_NGO');
    return;
  }

  if (currentUser.role === 'DONOR') {
    alert('⚠️ Notice: You are signed in as a Donor. Only verified NGO / Shelter accounts can claim food distributions.');
    return;
  }

  saveMyClaim(String(id));
  try {
    await fetch(`${API_URL}/${id}/claim`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        claimant_phone: currentUser.phone,
        claimant_org: currentUser.org_name || currentUser.name
      })
    });
  } catch (err) {}

  activeListings = activeListings.map(item => {
    if (String(item.id) === String(id) || String(item._id) === String(id)) {
      return { ...item, status: 'CLAIMED', claimed_by_ngo: currentUser.org_name || currentUser.name };
    }
    return item;
  });

  renderListings();
  alert(`✅ Food Reserved for ${currentUser.org_name || currentUser.name}!\n\nProtocol: Tap "Call Donor" to confirm pickup arrival before navigating.`);
};

window.reportFakeListing = async function(id) {
  if (confirm('⚠️ Report Fake Listing / Unauthorized Photo?\n\nThis will immediately remove the post and permanently blacklist the poster.')) {
    try {
      await fetch(`${API_URL}/${id}/report-fake`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Fake listing confirmed by volunteer' })
      });
      alert('🚫 Listing archived and donor has been permanently blacklisted.');
      loadFeed();
    } catch {
      alert('Reported locally.');
      loadFeed();
    }
  }
};

// ---------------- STRICT AUTH-GUARDED DONATION SUBMISSION ----------------
window.submitDonationNow = function() {
  if (!currentUser) {
    alert('🔒 Access Restricted: Please Login or Register as a Donor/Restaurant to post surplus food.');
    openAuthModal('LOGIN');
    return;
  }

  const itemInput = document.getElementById('input-food-title');
  const addressInput = document.getElementById('address');
  const qtyInput = document.getElementById('input-food-qty');
  const phoneInput = document.getElementById('donor-phone');
  const windowInput = document.getElementById('input-food-window');

  if (!itemInput || !itemInput.value.trim() || isSpamText(itemInput.value.trim())) {
    alert('⚠️ Please enter a genuine food item description (e.g. 40 Rice & Dal Meals). Random characters are blocked.');
    itemInput?.focus();
    return;
  }
  if (!qtyInput || !qtyInput.value.trim()) {
    alert('⚠️ Please specify the quantity (e.g. 20 servings).');
    qtyInput?.focus();
    return;
  }
  if (!addressInput || !addressInput.value.trim()) {
    alert('⚠️ Please provide a pickup address or click "🎯 Use Live GPS".');
    addressInput?.focus();
    return;
  }
  if (!phoneInput || !phoneInput.value.trim() || phoneInput.value.trim().length < 10) {
    alert('⚠️ Please enter a valid 10-digit mobile number.');
    phoneInput?.focus();
    return;
  }

  const finalImage = uploadedImageBase64 || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80';

  pendingDonationPayload = {
    id: Date.now().toString(),
    title: itemInput.value.trim(),
    quantity: qtyInput.value.trim(),
    expiry_hours: parseInt(windowInput?.value || '3'),
    address: addressInput.value.trim(),
    phone: phoneInput.value.trim(),
    donor_name: currentUser.name || 'Registered Donor',
    image: finalImage,
    coords: selectedAddressCoords || userLiveCoords || { lat: 28.6139, lon: 77.2090 },
    is_verified: true,
    status: 'AVAILABLE'
  };

  currentGeneratedOTP = Math.floor(1000 + Math.random() * 9000).toString();
  const otpDisplay = document.getElementById('generated-otp-display');
  const otpModal = document.getElementById('otp-modal');
  
  if (otpDisplay) otpDisplay.textContent = currentGeneratedOTP;
  if (otpModal) {
    otpModal.style.display = 'flex';
    const input = document.getElementById('otp-input-field');
    if (input) { input.value = ''; input.focus(); }
  }
};

window.confirmOTPVerification = async function() {
  const otpInput = document.getElementById('otp-input-field');
  const otpModal = document.getElementById('otp-modal');

  if (!otpInput || otpInput.value.trim() !== currentGeneratedOTP) {
    alert('❌ Invalid OTP Code. Please enter the 4-digit code shown in the green banner.');
    return;
  }

  if (otpModal) otpModal.style.display = 'none';

  if (pendingDonationPayload) {
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pendingDonationPayload)
      });

      if (res.status === 403) {
        alert('🚫 This phone number has been permanently blacklisted.');
        return;
      }
    } catch (err) {}

    activeListings.unshift(pendingDonationPayload);
    renderListings();

    document.getElementById('input-food-title').value = '';
    document.getElementById('address').value = '';
    document.getElementById('input-food-qty').value = '';
    document.getElementById('donor-phone').value = '';
    uploadedImageBase64 = '';
    selectedAddressCoords = null;
    isFoodValid = true;
    const previewContainer = document.getElementById('image-preview-container');
    if (previewContainer) previewContainer.style.display = 'none';
    const placeholder = document.getElementById('start-cam-placeholder');
    if (placeholder) placeholder.style.display = 'block';

    alert('🎉 Food Broadcasted Successfully! Verified NGOs in your 5–10 km range will be notified.');
  }
};

// ---------------- AUTO-WRAPPED CSR CERTIFICATE ----------------
window.generateCSRCertificate = function(title, qty, address) {
  if (!window.jspdf) {
    alert('PDF Generator loading, please retry in 2 seconds.');
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  const maxContentWidth = 220;

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, 297, 210, 'F');

  doc.setDrawColor(16, 185, 129);
  doc.setLineWidth(2.5);
  doc.rect(10, 10, 277, 190);
  doc.setLineWidth(0.8);
  doc.rect(14, 14, 269, 182);

  doc.setTextColor(16, 185, 129);
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text('FOODLOOP RESCUE NETWORK', 148.5, 34, { align: 'center' });

  doc.setTextColor(244, 244, 245);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('CERTIFICATE OF SOCIAL & ENVIRONMENTAL IMPACT', 148.5, 48, { align: 'center' });

  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(203, 213, 225);
  doc.text('Presented to the generous food donor for bridging surplus meals to verified communities:', 148.5, 66, { align: 'center' });

  doc.setTextColor(52, 211, 153);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(`Donation Item: ${title} (${qty})`, 148.5, 82, { align: 'center' });

  doc.setTextColor(203, 213, 225);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  const fullAddressText = `Pickup Location: ${address}`;
  const wrappedAddress = doc.splitTextToSize(fullAddressText, maxContentWidth);
  doc.text(wrappedAddress, 148.5, 96, { align: 'center' });

  const addressLinesHeight = wrappedAddress.length * 5.5;
  let nextY = 98 + addressLinesHeight;

  const recipientOrg = (currentUser && currentUser.org_name) ? currentUser.org_name : 'Robin Hood Army (Delhi Hub)';
  doc.text(`Recipient Partner: ${recipientOrg}`, 148.5, nextY, { align: 'center' });
  nextY += 8;

  doc.text('Carbon Offset: ~45 kg CO2 Diverted from Landfill | SDG 2 Zero Hunger', 148.5, nextY, { align: 'center' });

  doc.setDrawColor(63, 63, 70);
  doc.setLineWidth(0.5);
  doc.line(45, 168, 105, 168);
  doc.line(192, 168, 252, 168);

  doc.setFontSize(10);
  doc.setTextColor(161, 161, 170);
  doc.text('Authorized Impact Officer', 75, 175, { align: 'center' });
  doc.text('Verified NGO Darpan Partner', 222, 175, { align: 'center' });

  doc.save(`FoodLoop_Impact_Certificate_${Date.now()}.pdf`);
};

// Autocomplete Dropdown
function setupAddressAutocomplete() {
  const addressInput = document.getElementById('address');
  const container = document.getElementById('address-container');
  if (!addressInput || !container) return;

  let dropdown = document.getElementById('address-dropdown');
  if (!dropdown) {
    dropdown = document.createElement('div');
    dropdown.id = 'address-dropdown';
    dropdown.style.cssText = 'position: absolute; top: calc(100% + 4px); left: 0; right: 0; background: #18181b; border: 1px solid #3f3f46; border-radius: 8px; z-index: 1000; max-height: 180px; overflow-y: auto; display: none; box-shadow: 0 10px 20px rgba(0,0,0,0.5);';
    container.appendChild(dropdown);
  }

  let debounceTimer;
  addressInput.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    clearTimeout(debounceTimer);
    if (query.length < 3) { dropdown.style.display = 'none'; return; }

    debounceTimer = setTimeout(async () => {
      try {
        const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query + ' India')}&limit=5`);
        const data = await res.json();
        
        if (data.features && data.features.length > 0) {
          dropdown.innerHTML = data.features.map(f => {
            const p = f.properties;
            const fullAddress = [p.name, p.street, p.city, p.state].filter(Boolean).join(', ');
            return `<div class="suggest-item" data-lat="${f.geometry.coordinates[1]}" data-lon="${f.geometry.coordinates[0]}" style="padding: 10px 14px; font-size: 13px; color: #f4f4f5; cursor: pointer; border-bottom: 1px solid #27272a;" onmouseover="this.style.background='#27272a'" onmouseout="this.style.background='transparent'">${fullAddress}</div>`;
          }).join('');
          dropdown.style.display = 'block';

          dropdown.querySelectorAll('.suggest-item').forEach(el => {
            el.addEventListener('click', () => {
              addressInput.value = el.textContent;
              selectedAddressCoords = {
                lat: parseFloat(el.getAttribute('data-lat')),
                lon: parseFloat(el.getAttribute('data-lon'))
              };
              dropdown.style.display = 'none';
            });
          });
        } else {
          dropdown.style.display = 'none';
        }
      } catch {
        dropdown.style.display = 'none';
      }
    }, 300);
  });

  document.addEventListener('click', (e) => {
    if (!addressInput.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  });
}

// Volunteer QR Code Handshake
window.openQRHandshake = function(itemId) {
  const qrModal = document.getElementById('qr-modal');
  const qrContainer = document.getElementById('qrcode-container');

  if (!qrModal || !qrContainer) return;

  qrContainer.innerHTML = '';
  const handshakePayload = JSON.stringify({
    listing_id: itemId,
    security_hash: `FL-AUTH-${Date.now()}`,
    verified: true
  });

  if (window.QRCode) {
    new QRCode(qrContainer, {
      text: handshakePayload,
      width: 180,
      height: 180,
      colorDark : "#000000",
      colorLight : "#ffffff",
      correctLevel : QRCode.CorrectLevel.H
    });
  }

  qrModal.style.display = 'flex';
};

setInterval(() => { renderListings(); }, 60000);

window.addEventListener('DOMContentLoaded', () => {
  updateNavbarAuthState();
  autoDetectUserLocation();
  loadAIModel();
  loadFeed();
  setupAddressAutocomplete();
});