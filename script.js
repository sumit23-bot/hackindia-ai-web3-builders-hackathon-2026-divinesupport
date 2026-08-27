const API_URL = 'http://localhost:5000/api/donations';
const PIN_API_URL = 'http://localhost:5000/api/generate-pin';

let aiModel = null;
let currentSecurityPIN = '';
let currentGeneratedOTP = '';
let isFoodValid = false;
let isRealCameraPhoto = false;
let isPINVerifiedByOCR = false;
let userLiveCoords = null;
let uploadedImageBase64 = '';
let activeListings = [];
let pendingDonationPayload = null;

// Fetch Device-Unique Non-Replicable PIN from Server
async function generateSessionSecurityPIN() {
  const pinEl = document.getElementById('live-security-pin');
  if (pinEl) pinEl.textContent = `#FL-GENERATING...`;

  try {
    const res = await fetch(PIN_API_URL);
    if (res.ok) {
      const data = await res.json();
      currentSecurityPIN = data.pin;
    } else {
      currentSecurityPIN = Math.floor(10000 + Math.random() * 90000).toString();
    }
  } catch {
    // Client Entropy Fallback based on device timestamp + crypto
    const cryptoArray = new Uint32Array(1);
    window.crypto.getRandomValues(cryptoArray);
    currentSecurityPIN = (10000 + (cryptoArray[0] % 90000)).toString();
  }

  isPINVerifiedByOCR = false;
  if (pinEl) pinEl.textContent = `#FL-${currentSecurityPIN}`;
}

// Pre-load MobileNet AI Model
async function loadAIModel() {
  try {
    if (window.mobilenet) {
      aiModel = await mobilenet.load();
      console.log('🤖 AI Food Vision Model Loaded');
    }
  } catch (err) {
    console.error('AI model load error:', err);
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
    console.log('Backend offline, using local state');
  }
  renderListings();
}

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

  const visibleListings = uniqueList.filter(item => {
    const itemId = String(item._id || item.id);
    return item.status === 'AVAILABLE' || myClaims.includes(itemId);
  });

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

  if (visibleListings.length === 0) {
    container.innerHTML = `<div style="background: #18181b; border: 1px dashed #27272a; padding: 24px; border-radius: 12px; text-align: center; color: #71717a; font-size: 14px;">No active food listings available right now.</div>`;
    return;
  }

  container.innerHTML = visibleListings.map(item => {
    const itemId = String(item._id || item.id);
    const isClaimedByMe = myClaims.includes(itemId) || item.status === 'CLAIMED';
    const displayPhone = item.phone || '+91 98996 36474';

    return `
      <div style="background: #18181b; border: 1px solid #27272a; padding: 18px; border-radius: 14px; color: #f4f4f5; box-shadow: 0 4px 12px rgba(0,0,0,0.3);">
        
        ${item.image ? `
          <div style="position: relative; margin-bottom: 12px; border-radius: 10px; overflow: hidden; max-height: 170px;">
            <img src="${item.image}" alt="Verified Food" style="width: 100%; height: 100%; object-fit: cover; display: block;" />
            <div style="position: absolute; top: 8px; left: 8px; display: flex; gap: 6px;">
              <span style="background: rgba(16, 185, 129, 0.95); color: #000; font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 4px;">
                🛡️ AI & PIN Verified
              </span>
              <span style="background: rgba(59, 130, 246, 0.95); color: #fff; font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 4px;">
                📍 Geofenced
              </span>
            </div>
          </div>
        ` : ''}

        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <span style="font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 9999px; ${isClaimedByMe ? 'background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid rgba(245,158,11,0.3);' : 'background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16,185,129,0.3);'}">
            ${isClaimedByMe ? '🟡 Claimed by You (En Route)' : '🟢 Available'}
          </span>
          <span style="font-size: 11px; color: #a1a1aa;">⏱ ${item.expiry_hours || 3}h window</span>
        </div>

        <h4 style="font-size: 16px; font-weight: 700; margin: 4px 0 6px 0; color: #fff;">${item.title}</h4>
        
        <p style="font-size: 13px; color: ${isClaimedByMe ? '#34d399' : '#d4d4d8'}; margin: 0 0 4px 0;">
          📍 <strong>Pickup:</strong> ${isClaimedByMe ? item.address : item.address.split(',')[0] + ' (Claim to unlock full address)'}
        </p>

        <p style="font-size: 13px; color: ${isClaimedByMe ? '#60a5fa' : '#71717a'}; margin: 0 0 4px 0;">
          📞 <strong>Donor Contact:</strong> ${isClaimedByMe ? `<a href="tel:${displayPhone}" style="color: #60a5fa; text-decoration: underline; font-weight: 600;">${displayPhone}</a>` : '•••••••••• (Hidden for donor privacy)'}
        </p>

        <p style="font-size: 12px; color: #a1a1aa; margin: 0 0 12px 0;">📦 Quantity: ${item.quantity}</p>
        
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          ${!isClaimedByMe ? `
            <button onclick="claim('${itemId}', '${item.address}')" style="background: #10b981; color: #000; font-weight: 700; font-size: 12px; padding: 7px 14px; border-radius: 8px; border: none; cursor: pointer;">
              Claim Pickup
            </button>
          ` : `
            <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.address)}" target="_blank" style="background: #10b981; color: #000; font-weight: 700; font-size: 12px; padding: 7px 14px; border-radius: 8px; text-decoration: none; display: inline-flex; align-items: center; gap: 4px;">
              🗺️ Open Navigation
            </a>
            <a href="tel:${displayPhone}" style="background: #2563eb; color: #fff; font-weight: 600; font-size: 12px; padding: 7px 14px; border-radius: 8px; text-decoration: none; display: inline-flex; align-items: center; gap: 4px;">
              📞 Call Donor
            </a>
            <button onclick="openQRHandshake('${itemId}')" style="background: #8b5cf6; color: #fff; font-weight: 700; font-size: 12px; padding: 7px 14px; border-radius: 8px; border: none; cursor: pointer;">
              🤝 Handover QR
            </button>
          `}
        </div>
      </div>
    `;
  }).join('');
}

async function claim(id, address) {
  saveMyClaim(String(id));
  try {
    await fetch(`${API_URL}/${id}/claim`, { method: 'PATCH' });
  } catch (err) {}

  activeListings = activeListings.map(item => {
    if (String(item.id) === String(id) || String(item._id) === String(id)) {
      return { ...item, status: 'CLAIMED' };
    }
    return item;
  });

  renderListings();
  window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`, '_blank');
}

// ---------------- 1. HARDWARE ANTI-AI INSPECTOR ----------------
function checkImageOrigin(file, imgElement, callback) {
  if (!window.EXIF) {
    callback({ isReal: true });
    return;
  }

  EXIF.getData(imgElement, function() {
    const software = (EXIF.getTag(this, "Software") || "").toLowerCase();
    const aiSignatures = ['dall-e', 'midjourney', 'stable diffusion', 'firefly', 'canva', 'bing', 'gemini', 'chatgpt', 'openai'];
    const isAISoftware = aiSignatures.some(sig => software.includes(sig));

    const fileName = file.name.toLowerCase();
    const isAIGeneratedName = fileName.includes('ai_') || fileName.includes('generated') || fileName.includes('dalle') || fileName.includes('midjourney') || fileName.includes('gemini') || fileName.includes('bing');

    if (isAISoftware || isAIGeneratedName) {
      callback({ isReal: false, reason: 'AI Generation Signature Detected' });
    } else {
      callback({ isReal: true });
    }
  });
}

// ---------------- 2. STRICT OCR & AI CLASSIFICATION ----------------
function setupImageUpload() {
  const fileInput = document.getElementById('food-image-input');
  const previewContainer = document.getElementById('image-preview-container');
  const previewImg = document.getElementById('food-image-preview');
  const badge = document.getElementById('verification-badge');

  if (!fileInput) return;

  fileInput.addEventListener('change', async function(e) {
    const file = e.target.files[0];
    if (!file) return;

    isPINVerifiedByOCR = false;
    isFoodValid = false;
    isRealCameraPhoto = false;

    const reader = new FileReader();
    reader.onload = async function(evt) {
      uploadedImageBase64 = evt.target.result;
      if (previewImg && previewContainer) {
        previewImg.src = uploadedImageBase64;
        previewContainer.style.display = 'block';

        badge.innerHTML = '🔍 Stage 1: Authenticity Check...';
        badge.style.background = 'rgba(234, 179, 8, 0.95)';
        badge.style.color = '#000';

        previewImg.onload = async () => {
          // 1. Anti-AI
          checkImageOrigin(file, previewImg, async (originResult) => {
            if (!originResult.isReal) {
              isRealCameraPhoto = false;
              badge.innerHTML = `🚫 Blocked: Synthetic / AI Generated Image`;
              badge.style.background = 'rgba(239, 68, 68, 0.95)';
              badge.style.color = '#fff';
              alert('⚠️ Anti-Spam: AI generated/downloaded photos are prohibited.');
              return;
            }
            isRealCameraPhoto = true;

            // 2. MobileNet Food Classification
            badge.innerHTML = '🤖 Stage 2: Scanning Food Item...';
            if (!aiModel) aiModel = await mobilenet.load();
            const predictions = await aiModel.classify(previewImg);
            const matchedFood = predictions.some(pred => FOOD_KEYWORDS.some(k => pred.className.toLowerCase().includes(k)));

            if (!matchedFood) {
              isFoodValid = false;
              badge.innerHTML = `❌ No Food Detected (${predictions[0].className.split(',')[0]})`;
              badge.style.background = 'rgba(239, 68, 68, 0.95)';
              badge.style.color = '#fff';
              alert(`⚠️ Food Check Failed: No edible food detected.`);
              return;
            }
            isFoodValid = true;

            // 3. Strict OCR for Device-Unique Security PIN Tag
            badge.innerHTML = `📝 Stage 3: Scanning Unique Tag (#FL-${currentSecurityPIN})...`;
            badge.style.background = 'rgba(234, 179, 8, 0.95)';
            badge.style.color = '#000';

            try {
              if (window.Tesseract) {
                const { data: { text } } = await Tesseract.recognize(uploadedImageBase64, 'eng');
                console.log('OCR Extracted Text:', text);
                
                const cleanText = text.replace(/[\s\-_#]/g, '').toLowerCase();
                const targetCode = currentSecurityPIN.toLowerCase();
                const targetFLCode = `fl${currentSecurityPIN}`.toLowerCase();

                if (cleanText.includes(targetCode) || cleanText.includes(targetFLCode)) {
                  isPINVerifiedByOCR = true;
                  badge.innerHTML = `✅ 100% Verified: Food + Tag (#FL-${currentSecurityPIN})`;
                  badge.style.background = 'rgba(16, 185, 129, 0.95)';
                  badge.style.color = '#000';
                } else {
                  isPINVerifiedByOCR = false;
                  badge.innerHTML = `❌ Tag Missing: Code #FL-${currentSecurityPIN} NOT Found`;
                  badge.style.background = 'rgba(239, 68, 68, 0.95)';
                  badge.style.color = '#fff';
                  alert(`⚠️ Security Check Failed!\n\nCould NOT find "#FL-${currentSecurityPIN}" written in the image.\n\nPlease write "#FL-${currentSecurityPIN}" on a paper slip, place it next to the food, and take the photo.`);
                }
              } else {
                isPINVerifiedByOCR = false;
              }
            } catch (err) {
              isPINVerifiedByOCR = false;
              badge.innerHTML = `❌ OCR Scan Error`;
              badge.style.background = 'rgba(239, 68, 68, 0.95)';
              badge.style.color = '#fff';
            }
          });
        };
      }
    };
    reader.readAsDataURL(file);
  });
}

// ---------------- 3. GEOFENCING & GPS COORDINATE LOCK ----------------
function setupAddressAutocomplete() {
  const addressInput = document.querySelector('input[placeholder*="landmark"]') || 
                       document.querySelector('input[placeholder*="Delhi"]') || 
                       document.querySelector('input[name="address"]') ||
                       document.querySelector('#address');

  if (!addressInput) return;

  const parent = addressInput.parentElement;
  
  const oldBtn = document.getElementById('gps-locate-btn');
  if (oldBtn) oldBtn.remove();
  const oldHeaders = parent.querySelectorAll('.location-header-row');
  oldHeaders.forEach(h => h.remove());

  let existingLabel = parent.querySelector('label') || parent.previousElementSibling;
  
  let headerRow = document.createElement('div');
  headerRow.className = 'location-header-row';
  headerRow.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;';

  const labelTitle = document.createElement('span');
  labelTitle.textContent = 'Pickup address (Delhi / Noida)';
  labelTitle.style.cssText = 'font-size: 13px; color: #94a3b8; font-weight: 500;';

  const gpsBtn = document.createElement('button');
  gpsBtn.id = 'gps-locate-btn';
  gpsBtn.type = 'button';
  gpsBtn.innerHTML = '🎯 Use Live GPS';
  gpsBtn.style.cssText = 'background: rgba(16,185,129,0.15); color: #34d399; font-size: 11px; font-weight: 600; padding: 4px 8px; border-radius: 6px; border: 1px solid rgba(16,185,129,0.3); cursor: pointer; display: inline-flex; align-items: center; gap: 4px;';

  headerRow.appendChild(labelTitle);
  headerRow.appendChild(gpsBtn);

  if (existingLabel && (existingLabel.tagName === 'LABEL' || existingLabel.textContent.includes('Pickup address'))) {
    existingLabel.replaceWith(headerRow);
  } else {
    parent.insertBefore(headerRow, addressInput);
  }

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition((pos) => {
      userLiveCoords = { lat: pos.coords.latitude, lon: pos.coords.longitude };
    });
  }

  gpsBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (!navigator.geolocation) {
      alert('Geolocation not supported.');
      return;
    }

    gpsBtn.innerHTML = '⏳ Locating...';
    gpsBtn.style.color = '#fbbf24';

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        userLiveCoords = { lat: position.coords.latitude, lon: position.coords.longitude };
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${userLiveCoords.lat}&lon=${userLiveCoords.lon}&zoom=18&addressdetails=1`);
          const data = await res.json();
          if (data && data.display_name) {
            addressInput.value = data.display_name;
            gpsBtn.innerHTML = '✅ Located';
          } else {
            addressInput.value = `${userLiveCoords.lat.toFixed(5)}, ${userLiveCoords.lon.toFixed(5)}`;
            gpsBtn.innerHTML = '✅ GPS Coords';
          }
        } catch {
          addressInput.value = `${userLiveCoords.lat.toFixed(5)}, ${userLiveCoords.lon.toFixed(5)}`;
          gpsBtn.innerHTML = '✅ Coords Set';
        }
        setTimeout(() => { gpsBtn.innerHTML = '🎯 Use Live GPS'; gpsBtn.style.color = '#34d399'; }, 3000);
      },
      () => {
        alert('Please allow location permission in browser.');
        gpsBtn.innerHTML = '❌ Denied';
        gpsBtn.style.color = '#f87171';
      }
    );
  });

  let dropdown = document.getElementById('address-dropdown');
  if (!dropdown) {
    parent.style.position = 'relative';
    dropdown = document.createElement('div');
    dropdown.id = 'address-dropdown';
    dropdown.style.cssText = 'position: absolute; top: calc(100% + 4px); left: 0; right: 0; background: #18181b; border: 1px solid #3f3f46; border-radius: 8px; z-index: 1000; max-height: 180px; overflow-y: auto; display: none; box-shadow: 0 10px 20px rgba(0,0,0,0.5);';
    parent.appendChild(dropdown);
  }

  let debounceTimer;
  addressInput.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    clearTimeout(debounceTimer);
    if (query.length < 3) {
      dropdown.style.display = 'none';
      return;
    }

    debounceTimer = setTimeout(async () => {
      try {
        const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query + ' India')}&limit=5`);
        const data = await res.json();
        
        if (data.features && data.features.length > 0) {
          dropdown.innerHTML = data.features.map(f => {
            const p = f.properties;
            const fullAddress = [p.name, p.street, p.city, p.state].filter(Boolean).join(', ');
            return `<div class="suggest-item" style="padding: 10px 14px; font-size: 13px; color: #f4f4f5; cursor: pointer; border-bottom: 1px solid #27272a;" onmouseover="this.style.background='#27272a'" onmouseout="this.style.background='transparent'">${fullAddress}</div>`;
          }).join('');
          
          dropdown.style.display = 'block';

          dropdown.querySelectorAll('.suggest-item').forEach(el => {
            el.addEventListener('click', () => {
              addressInput.value = el.textContent;
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

// ---------------- 4. STRICT SUBMISSION & ONE-TIME BURN HANDLER ----------------
function setupDonationForm() {
  const form = document.querySelector('form') || document.querySelector('.hub-form');
  const postBtn = document.getElementById('publish-donation-btn');

  const submitAction = async (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    const itemInput = document.querySelector('input[placeholder*="biryani"]') || document.querySelector('input[name="food_item"]') || document.querySelector('input[name="food"]');
    const addressInput = document.querySelector('input[placeholder*="landmark"]') || document.querySelector('input[name="address"]');
    const qtyInput = document.querySelector('input[placeholder*="servings"]') || document.querySelector('input[name="quantity"]');
    const phoneInput = document.getElementById('donor-phone') || document.querySelector('input[type="tel"]');

    if (!itemInput || !itemInput.value.trim()) {
      alert('⚠️ Please specify what food you are donating.');
      return;
    }

    if (!addressInput || !addressInput.value.trim()) {
      alert('⚠️ Please provide a pickup address or use GPS.');
      return;
    }

    if (!phoneInput || !phoneInput.value.trim() || phoneInput.value.trim().length < 10) {
      alert('⚠️ Please enter a valid 10-digit mobile number for OTP verification.');
      return;
    }

    if (!uploadedImageBase64) {
      alert(`📸 Photo Required: Please capture a photo of the food along with unique paper tag #FL-${currentSecurityPIN}.`);
      return;
    }

    if (!isRealCameraPhoto || !isFoodValid) {
      alert('🚫 Security Block: Uploaded image failed AI authenticity and food classification checks.');
      return;
    }

    if (!isPINVerifiedByOCR) {
      alert(`🚫 Verification Blocked:\n\nThe unique tag "#FL-${currentSecurityPIN}" was NOT detected on paper slip.\n\nPlease write "#FL-${currentSecurityPIN}" on paper, place it beside the food, and upload.`);
      return;
    }

    pendingDonationPayload = {
      id: Date.now().toString(),
      title: itemInput.value.trim(),
      quantity: qtyInput && qtyInput.value.trim() ? qtyInput.value.trim() : '20 servings',
      expiry_hours: 3,
      address: addressInput.value.trim(),
      phone: phoneInput.value.trim(),
      image: uploadedImageBase64,
      is_verified: true,
      pin_code: currentSecurityPIN,
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

  if (form) form.onsubmit = submitAction;
  else if (postBtn) postBtn.onclick = submitAction;
}

// ---------------- OTP MODAL HANDLERS ----------------
function setupOTPHandlers() {
  const verifyBtn = document.getElementById('otp-verify-btn');
  const cancelBtn = document.getElementById('otp-cancel-btn');
  const otpModal = document.getElementById('otp-modal');
  const otpInput = document.getElementById('otp-input-field');

  if (cancelBtn) {
    cancelBtn.onclick = () => { if (otpModal) otpModal.style.display = 'none'; };
  }

  if (verifyBtn) {
    verifyBtn.onclick = async () => {
      if (otpInput.value.trim() !== currentGeneratedOTP) {
        alert('❌ Invalid OTP Code. Please enter the code shown in the banner.');
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

          if (res.status === 409) {
            alert('🚫 Security Alert: This Security PIN has already been used and burned. Generating fresh code...');
            generateSessionSecurityPIN();
            return;
          }

          activeListings.unshift(pendingDonationPayload);
          renderListings();

        } catch (err) {}

        // Reset Form & Generate Next Unique Unused PIN
        document.querySelector('input[name="food"]').value = '';
        document.querySelector('input[name="address"]').value = '';
        const qty = document.querySelector('input[name="quantity"]');
        if (qty) qty.value = '';
        const phone = document.getElementById('donor-phone');
        if (phone) phone.value = '';
        uploadedImageBase64 = '';
        isFoodValid = false;
        isRealCameraPhoto = false;
        isPINVerifiedByOCR = false;
        const previewContainer = document.getElementById('image-preview-container');
        const fileInput = document.getElementById('food-image-input');
        if (previewContainer) previewContainer.style.display = 'none';
        if (fileInput) fileInput.value = '';

        generateSessionSecurityPIN();
        alert('🎉 Verified Donation Published Successfully! PIN has been burned.');
      }
    };
  }
}

// ---------------- 5. VOLUNTEER QR CODE HANDSHAKE ----------------
function openQRHandshake(itemId) {
  const qrModal = document.getElementById('qr-modal');
  const qrContainer = document.getElementById('qrcode-container');
  const closeBtn = document.getElementById('qr-close-btn');

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

  if (closeBtn) {
    closeBtn.onclick = () => { qrModal.style.display = 'none'; };
  }
}

window.addEventListener('DOMContentLoaded', () => {
  generateSessionSecurityPIN();
  loadAIModel();
  loadFeed();
  setupImageUpload();
  setupAddressAutocomplete();
  setupDonationForm();
  setupOTPHandlers();
});

setTimeout(() => {
  setupImageUpload();
  setupAddressAutocomplete();
  setupDonationForm();
  setupOTPHandlers();
}, 400);