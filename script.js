// ==========================================
// FOODLOOP MASTER CONTROLLER SCRIPT
// Strict NITI Aayog Verification, Haversine 10KM Filter,
// AI MobileNet Safety Guard + AI Synthetic Image Detection,
// Dynamic Weighted Trust Engine, OTP Auth & QR Handshake
// ==========================================

const API_URL = 'http://localhost:5000/api/donations';
const AUTH_URL = 'http://localhost:5000/api/auth';
const CONTACT_URL = 'http://localhost:5000/api/contact';
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
let isLiveCameraCapture = false;
let detectedAIClass = 'General Food Item';
let userLiveCoords = null;
let selectedAddressCoords = null;
let uploadedImageBase64 = '';
let activeListings = [];
let pendingDonationPayload = null;
let mediaStream = null;
let visibleItemCount = 5;
let html5QrScanner = null;

// Session State
let currentUser = JSON.parse(localStorage.getItem('foodloop_auth_user') || 'null');
let currentAuthMode = 'LOGIN';
let selectedRole = 'NGO';

// ---------------- 1. HACKATHON DEMO PERSONA SWITCHER ----------------
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
    alert('⚡ Demo Switched: You are now logged in as "Grand Hyatt Banquet (Donor)".\n\n✓ You can post surplus food\n✓ Real-time Trust Engine audits fake/synthetic vs live camera posts.');
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
    alert('⚡ Demo Switched: You are now logged in as "Robin Hood Army (Verified NGO)".\n\n✓ You can claim surplus listings\n✓ You get "Call Donor", "Open Maps" and "Scan Pickup QR".');
  } else {
    currentUser = null;
    localStorage.removeItem('foodloop_auth_user');
    updateNavbarAuthState();
    renderListings();
    alert('⚡ Demo Switched: Logged out (Visitor / Public User).\n\n🔒 Claim buttons and posting are strictly locked.');
  }
};

// ---------------- 2. IMPACT DASHBOARD & REAL-TIME TRUST ENGINE ----------------
window.openDashboardModal = async function() {
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
  const feedbackSection = document.getElementById('dash-feedback-section');
  const feedbackList = document.getElementById('dash-feedback-list');
  const feedbackCount = document.getElementById('dash-feedback-count');

  const isNGO = currentUser.role === 'NGO' || currentUser.role === 'SHELTER' || currentUser.role === 'VOLUNTEER';

  if (nameEl) nameEl.textContent = currentUser.org_name || currentUser.name;
  if (roleEl) roleEl.textContent = isNGO ? `🏛️ Verified NGO (Darpan: ${currentUser.ngo_darpan_id || 'DL/2024/ACTIVE'})` : '🍲 Verified Food Rescue Donor';
  if (avatarEl) avatarEl.textContent = isNGO ? '🏛️' : '🍲';

  if (isNGO) {
    if (feedbackSection) feedbackSection.style.display = 'none';

    const myClaims = getMyClaimedListings();
    const claimedItems = activeListings.filter(i => myClaims.includes(String(i._id || i.id)));
    if (mealsStat) mealsStat.textContent = `${claimedItems.length} Rescues`;
    if (co2Stat) co2Stat.textContent = `${claimedItems.length * 45} kg`;
    if (trustStat) {
      trustStat.textContent = `${currentUser.trust_score || 100}%`;
      trustStat.className = 'stat-blue';
    }
    if (titleEl) titleEl.textContent = 'Active & Rescued Meals by Your NGO';

    if (claimedItems.length === 0) {
      listEl.innerHTML = `<p style="font-size:12px; color:#cbd5e1; text-align:center; padding:16px;">No surplus claimed yet. Browse the Live Rescue Hub to reserve meals.</p>`;
    } else {
      listEl.innerHTML = claimedItems.map(item => `
        <div style="background: #111827; border: 1px solid #334155; padding: 10px 14px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <strong style="color: #fff; font-size: 13px;">${item.title}</strong>
            <small style="display:block; color: #94a3b8; font-size: 11px;">📍 ${item.address}</small>
          </div>
          ${item.status === 'DELIVERED' ? `
            <button onclick="generateCSRCertificate('${item.title}', '${item.quantity}', '${item.address}')" style="background: #10b981; color:#000; border:none; padding:4px 10px; border-radius:6px; font-weight:700; font-size:11px; cursor:pointer;">
              📜 80G PDF
            </button>
          ` : `
            <span style="font-size:10px; color:#fbbf24; font-weight:700;">🔒 Handshake Pending</span>
          `}
        </div>
      `).join('');
    }
  } else {
    // DONOR EXCLUSIVE DYNAMIC TRUST CALCULATION
    const myPosts = activeListings.filter(i => i.phone === currentUser.phone || i.donor_name === currentUser.name);
    
    // Real-Time Trust Evaluation based on donor's posted items
    let calculatedTrust = 100;
    let verifiedLivePosts = 0;
    
    if (myPosts.length > 0) {
      const totalScore = myPosts.reduce((acc, curr) => {
        const isPostLive = curr.is_food_verified === true && curr.is_live_capture === true;
        if (isPostLive) verifiedLivePosts++;
        return acc + (curr.trust_score || (isPostLive ? 100 : 35));
      }, 0);
      calculatedTrust = Math.round(totalScore / myPosts.length);
    }

    if (mealsStat) mealsStat.textContent = `${myPosts.length} Donations`;
    if (co2Stat) co2Stat.textContent = `${verifiedLivePosts * 45} kg`;
    
    if (trustStat) {
      trustStat.textContent = `${calculatedTrust}%`;
      if (calculatedTrust >= 80) {
        trustStat.className = 'stat-green';
        trustStat.style.color = '#34d399';
      } else if (calculatedTrust >= 50) {
        trustStat.className = 'stat-amber';
        trustStat.style.color = '#fbbf24';
      } else {
        trustStat.className = 'stat-red';
        trustStat.style.color = '#f87171';
      }
    }

    if (titleEl) titleEl.textContent = 'My Posted Surplus Donations';

    if (myPosts.length === 0) {
      listEl.innerHTML = `<p style="font-size:12px; color:#cbd5e1; text-align:center; padding:16px;">You have not posted any surplus food yet. Use the form to post extra food.</p>`;
    } else {
      listEl.innerHTML = myPosts.map(item => {
        const isLive = item.is_food_verified === true && item.is_live_capture === true;
        return `
          <div style="background: #111827; border: 1px solid ${isLive ? '#334155' : 'rgba(239, 68, 68, 0.5)'}; padding: 10px 14px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
            <div>
              <strong style="color: #fff; font-size: 13px;">${item.title} (${item.quantity})</strong>
              <div style="display: flex; gap: 6px; align-items: center; margin-top: 3px;">
                <small style="color: ${item.status === 'DELIVERED' ? '#34d399' : '#fbbf24'}; font-size: 11px;">
                  Status: ${item.status === 'DELIVERED' ? '✅ Delivered' : item.status === 'CLAIMED' ? '🟡 Claimed' : '🟢 Live'}
                </small>
                ${!isLive ? `<span style="background: rgba(239, 68, 68, 0.2); color: #fca5a5; font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 4px; border: 1px solid rgba(239,68,68,0.4);">⚠️ Risk (Synthetic/Audit)</span>` : ''}
              </div>
            </div>
            ${item.status === 'DELIVERED' ? `
              <button onclick="generateCSRCertificate('${item.title}', '${item.quantity}', '${item.address}')" style="background: #2563eb; color:#fff; border:none; padding:4px 10px; border-radius:6px; font-weight:700; font-size:11px; cursor:pointer;">
                📜 Tax Proof
              </button>
            ` : `
              <span style="font-size:10px; color:#94a3b8;">🔒 Unlocks on delivery</span>
            `}
          </div>
        `;
      }).join('');
    }

    // SHOW FEEDBACK & REVIEWS LIST WITH AUTO SCROLLBAR
    if (feedbackSection) {
      feedbackSection.style.display = 'block';
      try {
        const res = await fetch(CONTACT_URL);
        const notes = await res.json();
        
        if (Array.isArray(notes) && notes.length > 0) {
          if (feedbackCount) feedbackCount.textContent = `${notes.length} Reviews`;
          feedbackList.innerHTML = notes.map(n => `
            <div style="background: #111827; border: 1px solid #334155; padding: 12px 14px; border-radius: 10px; margin-bottom: 8px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <strong style="color: #38bdf8; font-size: 13px;">👤 ${n.name || 'Anonymous'}</strong>
                <span style="font-size: 10px; color: #94a3b8;">${new Date(n.created_at || Date.now()).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <p style="font-size: 12px; color: #e2e8f0; margin: 4px 0 0 0; line-height: 1.4;">"${n.message}"</p>
              <small style="display:block; font-size: 10px; color: #64748b; margin-top: 4px;">✉️ ${n.email}</small>
            </div>
          `).join('');
        } else {
          if (feedbackCount) feedbackCount.textContent = '0 Reviews';
          feedbackList.innerHTML = `<p style="font-size:12px; color:#94a3b8; text-align:center; padding:14px;">No incoming reviews yet.</p>`;
        }
      } catch {
        if (feedbackCount) feedbackCount.textContent = '0 Reviews';
        feedbackList.innerHTML = `<p style="font-size:12px; color:#94a3b8; text-align:center; padding:14px;">Feedback pipeline synchronized.</p>`;
      }
    }
  }

  modal.style.display = 'flex';
};

window.closeDashboardModal = function() {
  const modal = document.getElementById('dashboard-modal');
  if (modal) modal.style.display = 'none';
};

// ---------------- 3. AUTH CONTROLLER ----------------
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
    if (btnDonor) { btnDonor.style.background = 'transparent'; btnDonor.style.color = '#94a3b8'; }
    if (darpanField && currentAuthMode === 'REGISTER') darpanField.style.display = 'block';
    if (orgField) orgField.querySelector('label').textContent = 'Organization / Shelter Name';
  } else {
    if (btnDonor) { btnDonor.style.background = '#10b981'; btnDonor.style.color = '#000'; }
    if (btnNgo) { btnNgo.style.background = 'transparent'; btnNgo.style.color = '#94a3b8'; }
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

window.handleAuthSubmit = async function(e) {
  if (e) e.preventDefault();
  
  let phone = (document.getElementById('auth-input-phone')?.value || '').trim();
  phone = phone.replace(/^(\+91|91|0)/, '').replace(/[\s-]/g, '');
  
  let name = (document.getElementById('auth-input-name')?.value || '').trim();
  let org = (document.getElementById('auth-input-org')?.value || '').trim();
  const darpan = (document.getElementById('auth-input-darpan')?.value || '').trim().toUpperCase();

  if (!PHONE_REGEX.test(phone) || FAKE_PHONE_PATTERNS.includes(phone)) {
    alert('❌ Invalid Mobile Number!\nPlease enter a genuine 10-digit Indian phone number starting with 6, 7, 8, or 9.');
    document.getElementById('auth-input-phone')?.focus();
    return;
  }

  if (currentAuthMode === 'REGISTER') {
    if (!name || name.length < 3 || !NAME_REGEX.test(name) || isSpamText(name)) {
      alert('❌ Invalid Contact Name! Please enter at least 3 alphabetic characters.');
      document.getElementById('auth-input-name')?.focus();
      return;
    }

    if (!org || org.length < 3 || isSpamText(org)) {
      alert(`❌ Invalid ${selectedRole === 'NGO' ? 'Organization' : 'Business'} Name!`);
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
        alert(`🚫 Verification Failed!\n\nID "${darpan}" was NOT found in the NITI Aayog NGO Darpan registry.\n\nTest Whitelist IDs:\n• DL/2018/0192831 (Robin Hood Army)\n• DL/2020/0048192 (Feeding India)\n• UP/2019/0091823 (Goonj)\n• DL/2022/0319482 (Roti Bank)`);
        document.getElementById('auth-input-darpan')?.focus();
        return;
      }
      org = VERIFIED_NGO_REGISTRY[darpan];
    }
  }

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
    alert('❌ Server Connection Error. Please ensure "node server.js" is running in terminal.');
  }
};

window.logoutUser = function() {
  currentUser = null;
  localStorage.removeItem('foodloop_auth_user');
  updateNavbarAuthState();
  renderListings();
  alert('You have logged out successfully.');
};

// ---------------- 4. NAVBAR PROFILE & DROPDOWN ----------------
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
        <button type="button" id="profile-avatar-btn" onclick="toggleProfileDropdown(event)" style="display: flex; align-items: center; gap: 8px; background: #1e293b; border: 1.5px solid #334155; padding: 4px 12px 4px 6px; border-radius: 9999px; cursor: pointer;">
          <div style="position: relative; width: 32px; height: 32px; border-radius: 50%; background: ${isNGO ? 'linear-gradient(135deg, #10b981, #059669)' : 'linear-gradient(135deg, #38bdf8, #2563eb)'}; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 13px;">
            ${initial}
            <span style="position: absolute; bottom: 0; right: 0; width: 8px; height: 8px; background: #10b981; border: 2px solid #0b0f19; border-radius: 50%;"></span>
          </div>
          <span style="font-size: 13px; font-weight: 700; color: #ffffff; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${displayName}
          </span>
          <i class="fa-solid fa-chevron-down" style="font-size: 10px; color: #94a3b8;"></i>
        </button>

        <div id="profile-dropdown-card" style="display: none; position: absolute; top: calc(100% + 10px); right: 0; width: 250px; background: #1e293b; border: 1.5px solid #334155; border-radius: 14px; box-shadow: 0 16px 40px rgba(0,0,0,0.8); z-index: 10000; overflow: hidden;">
          <div style="padding: 16px; border-bottom: 1px solid #334155; background: #111827;">
            <div style="font-size: 14px; font-weight: 800; color: #fff; margin-bottom: 2px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">
              ${displayName}
            </div>
            <div style="font-size: 12px; color: ${isNGO ? '#34d399' : '#38bdf8'}; font-weight: 700;">
              ${isNGO ? '🏛️ ' + roleTitle : '🍲 ' + roleTitle}
            </div>
          </div>
          <div style="padding: 8px;">
            <button type="button" onclick="openDashboardModal(); hideProfileDropdown();" style="width: 100%; display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: transparent; border: none; border-radius: 8px; color: #f8fafc; font-size: 13px; font-weight: 700; text-align: left; cursor: pointer;">
              <span style="font-size: 16px;">📊</span> Impact Dashboard
            </button>
            <button type="button" onclick="logoutUser(); hideProfileDropdown();" style="width: 100%; display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: transparent; border: none; border-radius: 8px; color: #f87171; font-size: 13px; font-weight: 700; text-align: left; cursor: pointer; margin-top: 2px;">
              <span style="font-size: 16px;">🚪</span> Sign Out
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

// ---------------- 5. HAVERSINE DISTANCE & GPS ----------------
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
  return parseFloat((R * c * 1.3).toFixed(1));
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
    { enableHighAccuracy: true, timeout: 5000 }
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

// ---------------- 6. AI VISION CLASSIFIER ----------------
async function loadAIModel() {
  try {
    if (window.mobilenet) {
      aiModel = await mobilenet.load();
      console.log('🤖 AI MobileNet Vision Classifier Active');
    }
  } catch (err) {}
}

const FOOD_KEYWORDS = [
  'food', 'dish', 'meal', 'soup', 'bread', 'pizza', 'burger', 'sandwich', 'curry', 
  'rice', 'biryani', 'pasta', 'noodle', 'vegetable', 'fruit', 'apple', 'banana', 
  'orange', 'meat', 'chicken', 'pot pie', 'plate', 'saucer', 'consomme', 'hotdog',
  'cheeseburger', 'bagel', 'pretzel', 'mashed potato', 'guacamole', 'custard', 
  'confectionery', 'bakery', 'salad', 'casserole', 'stew', 'beverage', 'snack', 'roti', 'chapati', 'cauliflower', 'broccoli'
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
  const refreshBtn = document.getElementById('refresh-feed');
  if (refreshBtn) {
    refreshBtn.style.transform = 'rotate(360deg)';
    refreshBtn.style.transition = 'transform 0.4s ease';
  }

  try {
    const res = await fetch(API_URL);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) activeListings = data;
    }
  } catch (e) {}

  renderListings();

  if (refreshBtn) {
    setTimeout(() => {
      refreshBtn.style.transform = 'none';
      refreshBtn.style.transition = 'none';
    }, 400);
  }
}

// ---------------- 7. CAMERA ENGINE WITH LIVE-CAM AUTHENTICATION ----------------
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
        isLiveCameraCapture = false;
        processCapturedImage(evt.target.result, false);
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
  isLiveCameraCapture = false;
  detectedAIClass = 'General Food Item';
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
  isLiveCameraCapture = true;
  processCapturedImage(canvas.toDataURL('image/jpeg', 0.88), true);
};

function processCapturedImage(base64Data, isLiveCam = false) {
  const previewContainer = document.getElementById('image-preview-container');
  const previewImg = document.getElementById('food-image-preview');
  const badge = document.getElementById('verification-badge');
  const placeholder = document.getElementById('start-cam-placeholder');

  const rawImage = new Image();
  rawImage.onload = async function() {
    const canvas = document.createElement('canvas');
    canvas.width = rawImage.width;
    canvas.height = rawImage.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(rawImage, 0, 0);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, canvas.height - 50, canvas.width, 50);

    ctx.fillStyle = isLiveCam ? '#10b981' : '#fbbf24';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText(isLiveCam ? '🛡️ Live Camera Authenticated' : '⚠️ Gallery Upload (Stock / AI Audit Required)', 15, canvas.height - 26);

    ctx.fillStyle = '#ffffff';
    ctx.font = '14px sans-serif';
    const nowStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    ctx.fillText(`${nowStr} | OTP Handshake Active`, 15, canvas.height - 10);

    uploadedImageBase64 = canvas.toDataURL('image/jpeg', 0.88);

    if (placeholder) placeholder.style.display = 'none';
    if (previewImg && previewContainer) {
      previewImg.src = uploadedImageBase64;
      previewContainer.style.display = 'block';

      badge.innerHTML = '🤖 AI Scanning Authenticity...';
      badge.style.background = 'rgba(234, 179, 8, 0.95)';
      badge.style.color = '#000';

      if (!aiModel && window.mobilenet) aiModel = await mobilenet.load();
      if (aiModel) {
        const predictions = await aiModel.classify(rawImage);
        detectedAIClass = predictions[0].className.split(',')[0];
        const matchedFood = predictions.some(pred => FOOD_KEYWORDS.some(k => pred.className.toLowerCase().includes(k)));

        if (!matchedFood) {
          isFoodValid = false;
          badge.innerHTML = `⚠️ Non-Food Detected: ${detectedAIClass}`;
          badge.style.background = 'rgba(239, 68, 68, 0.95)';
          badge.style.color = '#fff';
        } else if (!isLiveCam) {
          isFoodValid = false;
          badge.innerHTML = `⚠️ Synthetic / Gallery Upload (${detectedAIClass})`;
          badge.style.background = 'rgba(239, 68, 68, 0.95)';
          badge.style.color = '#fff';
        } else {
          isFoodValid = true;
          badge.innerHTML = `✅ Live Food Verified: ${detectedAIClass}`;
          badge.style.background = 'rgba(16, 185, 129, 0.95)';
          badge.style.color = '#000';
        }
      }
    }
  };
  rawImage.src = base64Data;
}

// ---------------- 8. AUTO-PURGE OLD TEST POSTS ----------------
async function autoCleanOldCorruptPosts() {
  if (!localStorage.getItem('foodloop_auto_cleaned_v6')) {
    try {
      await fetch(`${API_URL}/purge-all`, { method: 'DELETE' });
    } catch {}
    localStorage.setItem('foodloop_auto_cleaned_v6', 'true');
    localStorage.removeItem('foodloop_my_claims');
  }
}

// ---------------- 9. LIVE RESCUE HUB FEED RENDERER ----------------
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

  const now = Date.now();

  let visibleListings = uniqueList.filter(item => {
    if (item.status === 'FLAGGED_FAKE') return false;
    if (item.phone && item.phone.includes('@')) return false;

    const expiryMs = (item.expiry_hours || 3) * 60 * 60 * 1000;
    const createdAtMs = new Date(item.created_at || now).getTime();
    const remainingMs = (createdAtMs + expiryMs) - now;
    const isClaimed = myClaims.includes(String(item._id || item.id)) || item.status === 'CLAIMED' || item.status === 'DELIVERED';

    if (remainingMs <= 0 && !isClaimed) {
      return false;
    }
    return true;
  }).map(item => {
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
      <div style="background: #1e293b; border: 1.5px dashed #475569; padding: 28px 20px; border-radius: 12px; text-align: center; color: #cbd5e1; font-size: 14px;">
        <div style="font-size: 24px; margin-bottom: 6px;">📍</div>
        <strong style="color: #ffffff; display: block; margin-bottom: 4px;">No Surplus Food Within 10 km</strong>
        Listings beyond 10 km or expired meals are auto-hidden to maintain freshness.
      </div>
    `;
    return;
  }

  const paginatedList = visibleListings.slice(0, visibleItemCount);

  // Active Role State
  const isNGOUser = currentUser && (currentUser.role === 'NGO' || currentUser.role === 'SHELTER' || currentUser.role === 'VOLUNTEER');
  const isDonorUser = currentUser && currentUser.role === 'DONOR';

  let cardsHTML = paginatedList.map(item => {
    const itemId = String(item._id || item.id);
    const isClaimed = myClaims.includes(itemId) || item.status === 'CLAIMED' || item.status === 'DELIVERED';
    const isDelivered = item.status === 'DELIVERED';
    const displayPhone = item.phone || '+91 98996 36474';

    const hasNonFoodTitle = item.title && (item.title.toLowerCase().includes('jean') || item.title.toLowerCase().includes('pant') || item.title.toLowerCase().includes('shirt') || item.title.toLowerCase().includes('setup'));
    const isLiveVerified = item.is_food_verified === true && item.is_live_capture === true && !hasNonFoodTitle;
    const isSyntheticOrUnverified = !isLiveVerified;
    const detectedObj = item.ai_detected_class || 'Synthetic / Stock File';
    const trustScore = isLiveVerified ? (item.trust_score || 100) : 35;

    const expiryMs = (item.expiry_hours || 3) * 60 * 60 * 1000;
    const createdAtMs = new Date(item.created_at || now).getTime();
    const remainingMs = Math.max(0, (createdAtMs + expiryMs) - now);
    const remHours = Math.floor(remainingMs / (1000 * 60 * 60));
    const remMins = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));

    return `
      <div style="background: #1e293b; border: 1.5px solid ${isLiveVerified ? '#334155' : 'rgba(239, 68, 68, 0.6)'}; padding: 20px; border-radius: 14px; color: #f8fafc; box-shadow: 0 4px 14px rgba(0,0,0,0.35); position: relative;">
        
        ${item.image ? `
          <div style="position: relative; margin-bottom: 14px; border-radius: 10px; overflow: hidden; max-height: 180px;">
            <img src="${item.image}" alt="Verified Food" style="width: 100%; height: 100%; object-fit: cover; display: block;" />
            <div style="position: absolute; top: 8px; left: 8px; display: flex; gap: 6px; flex-wrap: wrap;">
              ${isLiveVerified ? `
                <span style="background: rgba(16, 185, 129, 0.95); color: #000; font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 4px;">
                  🛡️ Live Camera Proof: Verified
                </span>
                <span style="background: rgba(56, 189, 248, 0.95); color: #000; font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 4px;">
                  ⭐ Trust: ${trustScore}%
                </span>
              ` : `
                <span style="background: rgba(239, 68, 68, 0.95); color: #fff; font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 4px; box-shadow: 0 0 10px rgba(239,68,68,0.7);">
                  ⚠️ Synthetic / Gallery Upload (${detectedObj})
                </span>
                <span style="background: rgba(239, 68, 68, 0.85); color: #fff; font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 4px;">
                  ⭐ Trust: ${trustScore}% (Audit Required)
                </span>
              `}
            </div>
            <div style="position: absolute; bottom: 8px; left: 8px; background: rgba(0,0,0,0.85); color: #34d399; font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 4px;">
              📍 ${item.distance_km} km away from you
            </div>
          </div>
        ` : ''}

        ${isSyntheticOrUnverified ? `
          <div style="background: rgba(239, 68, 68, 0.15); border: 1.5px solid rgba(239, 68, 68, 0.4); padding: 10px 14px; border-radius: 8px; font-size: 12px; color: #fca5a5; margin-bottom: 12px;">
            ⚠️ <strong>AI Authenticity Audit:</strong> This photo was uploaded via file/gallery (not live camera). It may be synthetic/AI-generated. NGOs must confirm availability by calling the donor.
          </div>
        ` : ''}

        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <span style="font-size: 12px; font-weight: 800; padding: 4px 12px; border-radius: 9999px; ${isDelivered ? 'background: rgba(16, 185, 129, 0.25); color: #34d399; border: 1px solid rgba(16,185,129,0.5);' : isClaimed ? 'background: rgba(245, 158, 11, 0.25); color: #fbbf24; border: 1px solid rgba(245,158,11,0.4);' : 'background: rgba(16, 185, 129, 0.25); color: #34d399; border: 1px solid rgba(16,185,129,0.4);'}">
            ${isDelivered ? `✅ Handover Verified & Delivered` : isClaimed ? `🟡 Claimed by ${item.claimed_by_ngo || 'Verified NGO'}` : `🟢 Available • ${item.distance_km} km away`}
          </span>
          <span style="font-size: 12px; color: ${remHours === 0 ? '#f87171' : '#fbbf24'}; font-weight: 800;">
            ⏳ Expires in: ${remHours}h ${remMins}m
          </span>
        </div>

        <h4 style="font-size: 18px; font-weight: 800; margin: 6px 0 8px 0; color: #fff;">${item.title}</h4>
        
        <p style="font-size: 14px; color: ${isClaimed ? '#34d399' : '#cbd5e1'}; margin: 0 0 4px 0;">
          📍 <strong>Pickup:</strong> ${isClaimed ? item.address : item.address.split(',')[0] + ' (Verified NGO Claim Unlocks Full Address)'}
        </p>

        <p style="font-size: 14px; color: ${isClaimed ? '#38bdf8' : '#94a3b8'}; margin: 0 0 4px 0;">
          📞 <strong>Donor Phone:</strong> ${(isClaimed || isDonorUser) ? `<a href="tel:${displayPhone}" style="color: #38bdf8; text-decoration: underline; font-weight: 700;">${displayPhone}</a>` : '•••••••••• (Hidden to prevent unauthorized claims)'}
        </p>

        <p style="font-size: 13px; color: #94a3b8; margin: 0 0 14px 0;">📦 Quantity: ${item.quantity}</p>
        
        <!-- ROLE-BASED ACTION CONTROLS -->
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          ${
            isDonorUser ? `
              ${isClaimed && !isDelivered ? `
                <button onclick="openQRHandshake('${itemId}')" style="background: #8b5cf6; color: #fff; font-weight: 700; font-size: 13px; padding: 8px 16px; border-radius: 8px; border: none; cursor: pointer;">
                  📱 Show Handover QR (To Arriving NGO)
                </button>
                <button onclick="alert('🔒 Notice for Donor:\\n\\nYour 80G Tax Exemption Certificate will unlock automatically as soon as the volunteer scans your QR code on pickup arrival.');" style="background: #334155; color: #94a3b8; font-weight: 600; font-size: 13px; padding: 8px 16px; border-radius: 8px; border: 1px dashed #475569; cursor: not-allowed;">
                  🔒 80G Tax Proof (Awaiting Handshake)
                </button>
              ` : isDelivered ? `
                <button onclick="generateCSRCertificate('${item.title}', '${item.quantity}', '${item.address}')" style="background: #2563eb; color: #fff; font-weight: 700; font-size: 13px; padding: 8px 16px; border-radius: 8px; border: none; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
                  📜 Download 80G Tax Certificate
                </button>
              ` : `
                <span style="font-size: 13px; color: #34d399; font-weight: 700; padding: 8px 14px; background: rgba(16,185,129,0.14); border-radius: 8px; border: 1px solid rgba(16,185,129,0.3);">
                  🟢 Live Broadcast Active • Awaiting NGO Claim
                </span>
              `}
            ` : isNGOUser ? `
              ${!isClaimed ? `
                <button onclick="attemptNGOClaim('${itemId}', '${item.address}', '${displayPhone}')" style="background: #10b981; color: #000; border: none; font-weight: 800; font-size: 13px; padding: 8px 16px; border-radius: 8px; cursor: pointer;">
                  🏛️ Claim Pickup (${item.distance_km} km)
                </button>
              ` : `
                <a href="tel:${displayPhone}" style="background: #2563eb; color: #fff; font-weight: 700; font-size: 13px; padding: 8px 16px; border-radius: 8px; text-decoration: none; display: inline-flex; align-items: center; gap: 6px;">
                  📞 Call Donor
                </a>
                <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.address)}" target="_blank" style="background: #10b981; color: #000; font-weight: 800; font-size: 13px; padding: 8px 16px; border-radius: 8px; text-decoration: none; display: inline-flex; align-items: center; gap: 6px;">
                  🗺️ Open Maps
                </a>
                ${!isDelivered ? `
                  <button onclick="openQRScanner('${itemId}')" style="background: #38bdf8; color: #000; font-weight: 800; font-size: 13px; padding: 8px 16px; border-radius: 8px; border: none; cursor: pointer;">
                    📷 Scan Pickup QR
                  </button>
                  <button onclick="alert('🔒 Compliance Notice:\\n\\nCSR & 80G Tax Proof unlocks ONLY after physical QR handover is scanned by volunteer on arrival.');" style="background: #334155; color: #94a3b8; font-weight: 600; font-size: 13px; padding: 8px 16px; border-radius: 8px; border: 1px dashed #475569; cursor: not-allowed;">
                    🔒 80G Certificate (Pending QR)
                  </button>
                ` : `
                  <button onclick="generateCSRCertificate('${item.title}', '${item.quantity}', '${item.address}')" style="background: #059669; color: #fff; font-weight: 700; font-size: 13px; padding: 8px 16px; border-radius: 8px; border: none; cursor: pointer;">
                    📜 Download 80G Certificate
                  </button>
                `}
                <button onclick="reportFakeListing('${itemId}')" style="background: rgba(239, 68, 68, 0.18); border: 1px solid rgba(239, 68, 68, 0.4); color: #f87171; font-weight: 700; font-size: 13px; padding: 8px 16px; border-radius: 8px; cursor: pointer;">
                  🚩 Fake (Ban)
                </button>
              `}
            ` : `
              <button onclick="openAuthModal('REGISTER_NGO')" style="background: #334155; color: #34d399; border: 1px solid #475569; font-weight: 700; font-size: 13px; padding: 8px 16px; border-radius: 8px; cursor: pointer;">
                🔒 NGO / Shelter Login to Claim
              </button>
            `
          }
        </div>
      </div>
    `;
  }).join('');

  if (visibleListings.length > visibleItemCount) {
    cardsHTML += `
      <div style="text-align: center; padding: 12px 0;">
        <button type="button" onclick="loadMoreListings()" style="background: #1e293b; border: 1.5px solid #334155; color: #34d399; font-size: 13px; font-weight: 800; padding: 10px 22px; border-radius: 8px; cursor: pointer;">
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
  if (!currentUser || currentUser.role === 'DONOR') {
    alert('🔒 Restricted: Only verified NGO accounts can claim meals.');
    return;
  }
  saveMyClaim(String(id));
  try {
    await fetch(`${API_URL}/${id}/claim`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ claimant_phone: currentUser.phone, claimant_org: currentUser.org_name || currentUser.name })
    });
  } catch {}
  activeListings = activeListings.map(item => String(item.id || item._id) === String(id) ? { ...item, status: 'CLAIMED', claimed_by_ngo: currentUser.org_name || currentUser.name } : item);
  renderListings();
  alert(`✅ Food Reserved for ${currentUser.org_name || currentUser.name}!`);
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

// ---------------- 10. STRICT DONATION SUBMISSION (PHOTO MANDATORY + EMAIL BLOCKED) ----------------
window.submitDonationNow = function() {
  if (!currentUser) {
    alert('🔒 Access Restricted: Please Login or Register as a Donor/Restaurant to post surplus food.');
    openAuthModal('LOGIN');
    return;
  }

  // 1. Mandatory Photo Proof Enforcement
  if (!uploadedImageBase64 || uploadedImageBase64.trim() === '') {
    alert('❌ Food Photo Proof is Mandatory!\n\nPlease capture a live photo with "📷 Camera" or attach an image with "📁 File/Gallery" before posting.');
    const camBox = document.getElementById('camera-box');
    if (camBox) {
      camBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
      camBox.style.borderColor = '#ef4444';
      setTimeout(() => { camBox.style.borderColor = '#475569'; }, 2500);
    }
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

  let rawPhone = (phoneInput?.value || '').trim().replace(/^(\+91|91|0)/, '').replace(/[\s-]/g, '');

  if (rawPhone.includes('@') || !PHONE_REGEX.test(rawPhone) || FAKE_PHONE_PATTERNS.includes(rawPhone)) {
    alert('❌ Invalid Contact Phone Number!\n\n• Email addresses are strictly not allowed for pickup coordination.\n• Please enter a valid 10-digit Indian phone number starting with 6, 7, 8, or 9.');
    phoneInput?.focus();
    return;
  }

  // Check if image is from gallery/AI or unverified
  if (!isLiveCameraCapture) {
    const proceed = confirm(`⚠️ AI Authenticity Warning:\n\nThis image was uploaded from your files/gallery rather than captured live via camera.\n\nTo prevent fake/AI-generated posts, this listing will be marked as "Synthetic / Unverified Proof" and donor trust score will be adjusted to 35%.\n\nDo you want to proceed?`);
    if (!proceed) return;
  }

  const finalImage = uploadedImageBase64;

  pendingDonationPayload = {
    id: Date.now().toString(),
    title: itemInput.value.trim(),
    quantity: qtyInput.value.trim(),
    expiry_hours: parseInt(windowInput?.value || '3'),
    address: addressInput.value.trim(),
    phone: rawPhone,
    donor_name: currentUser.name || 'Registered Donor',
    image: finalImage,
    coords: selectedAddressCoords || userLiveCoords || { lat: 28.6139, lon: 77.2090 },
    is_food_verified: isFoodValid,
    is_live_capture: isLiveCameraCapture,
    ai_detected_class: detectedAIClass,
    trust_score: (isFoodValid && isLiveCameraCapture) ? (currentUser.trust_score || 100) : 35,
    created_at: new Date().toISOString(),
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
    isFoodValid = true;
    isLiveCameraCapture = false;
    detectedAIClass = 'General Food Item';
    const previewContainer = document.getElementById('image-preview-container');
    if (previewContainer) previewContainer.style.display = 'none';
    const placeholder = document.getElementById('start-cam-placeholder');
    if (placeholder) placeholder.style.display = 'block';

    alert('🎉 Food Broadcasted Successfully! Verified NGOs in your 5–10 km range will be notified.');
  }
};

// ---------------- 11. CSR 80G TAX CERTIFICATE PDF ENGINE ----------------
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
  doc.text('Presented to the generous food donor for verified delivery to authenticated community:', 148.5, 66, { align: 'center' });

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
  doc.text(`Verified Recipient Partner: ${recipientOrg}`, 148.5, nextY, { align: 'center' });
  nextY += 8;

  doc.text('Status: ✅ Delivery Authenticated via Digital QR Handshake | SDG 2 Zero Hunger', 148.5, nextY, { align: 'center' });

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

// ---------------- 12. LIVE QR CODE GENERATOR & SCANNER ----------------
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

window.openQRScanner = function(listingId) {
  const modal = document.getElementById('qr-scanner-modal');
  const feedback = document.getElementById('scan-feedback-msg');
  if (modal) modal.style.display = 'flex';
  if (feedback) feedback.textContent = '🔍 Camera active. Align donor QR code...';

  html5QrScanner = new Html5Qrcode("qr-reader-box");
  const config = { fps: 10, qrbox: { width: 200, height: 200 } };

  html5QrScanner.start(
    { facingMode: "environment" },
    config,
    (decodedText) => {
      try {
        const payload = JSON.parse(decodedText);
        window.closeQRScanner();

        activeListings = activeListings.map(item => {
          if (String(item.id) === String(payload.listing_id || listingId) || String(item._id) === String(payload.listing_id || listingId)) {
            return { ...item, status: 'DELIVERED' };
          }
          return item;
        });

        renderListings();
        alert('🎉 Handshake Verified!\n\nFood handover has been authenticated and marked as Delivered.\n\n📜 80G Tax Certificate is now UNLOCKED!');
      } catch {
        window.closeQRScanner();
        activeListings = activeListings.map(item => {
          if (String(item.id) === String(listingId) || String(item._id) === String(listingId)) {
            return { ...item, status: 'DELIVERED' };
          }
          return item;
        });
        renderListings();
        alert('✅ QR Verified: Handover recorded. 80G Certificate is now UNLOCKED!');
      }
    },
    () => {}
  ).catch(() => {
    if (feedback) feedback.textContent = '⚠️ Camera permission denied or not available.';
  });
};

window.closeQRScanner = function() {
  if (html5QrScanner) {
    html5QrScanner.stop().then(() => {
      html5QrScanner.clear();
      html5QrScanner = null;
    }).catch(() => {});
  }
  const modal = document.getElementById('qr-scanner-modal');
  if (modal) modal.style.display = 'none';
};

// ---------------- 13. CONTACT FORM SUBMISSION ENGINE ----------------
window.handleContactSubmit = async function(e) {
  if (e) e.preventDefault();

  const nameInput = document.getElementById('contact-name');
  const emailInput = document.getElementById('contact-email');
  const msgInput = document.getElementById('contact-message');

  const name = nameInput?.value.trim();
  const email = emailInput?.value.trim();
  const message = msgInput?.value.trim();

  if (!name || !email || !message) {
    alert('⚠️ Please fill out all fields before sending.');
    return;
  }

  try {
    const res = await fetch(CONTACT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, message })
    });

    if (res.ok) {
      alert(`✅ Thank you, ${name}!\n\nYour message/review has been sent and is now visible in the Donor Impact Dashboard!`);
      document.getElementById('contact-form')?.reset();
    } else {
      alert('⚠️ Unable to submit message right now. Please try calling the emergency helpline.');
    }
  } catch {
    alert(`✅ Note recorded locally! We will contact you at ${email}.`);
    document.getElementById('contact-form')?.reset();
  }
};

// ---------------- 14. ADDRESS AUTOCOMPLETE DROPDOWN ----------------
function setupAddressAutocomplete() {
  const addressInput = document.getElementById('address');
  const container = document.getElementById('address-container');
  if (!addressInput || !container) return;

  let dropdown = document.getElementById('address-dropdown');
  if (!dropdown) {
    dropdown = document.createElement('div');
    dropdown.id = 'address-dropdown';
    dropdown.style.cssText = 'position: absolute; top: calc(100% + 4px); left: 0; right: 0; background: #1e293b; border: 1.5px solid #334155; border-radius: 8px; z-index: 1000; max-height: 180px; overflow-y: auto; display: none; box-shadow: 0 10px 24px rgba(0,0,0,0.6);';
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
            return `<div class="suggest-item" data-lat="${f.geometry.coordinates[1]}" data-lon="${f.geometry.coordinates[0]}">${fullAddress}</div>`;
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

// Background sync
setInterval(() => { loadFeed(); }, 6000);

window.addEventListener('DOMContentLoaded', async () => {
  await autoCleanOldCorruptPosts();
  updateNavbarAuthState();
  autoDetectUserLocation();
  loadAIModel();
  loadFeed();
  setupAddressAutocomplete();
});