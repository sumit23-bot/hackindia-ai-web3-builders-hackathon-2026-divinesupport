const API_URL = 'http://localhost:5000/api/donations';

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

let activeListings = [];

async function loadFeed() {
  try {
    const res = await fetch(API_URL);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) activeListings = data;
    }
  } catch (e) {
    console.log('Backend offline, using memory');
  }
  renderListings();
}

function renderListings() {
  const myClaims = getMyClaimedListings();

  // Smart De-duplicator: Same Title aur Same Address ki sirf 1 entry dikhayega
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
              🗺️ Open Maps Navigation
            </a>
            <a href="tel:${displayPhone}" style="background: #2563eb; color: #fff; font-weight: 600; font-size: 12px; padding: 7px 14px; border-radius: 8px; text-decoration: none; display: inline-flex; align-items: center; gap: 4px;">
              📞 Call Donor
            </a>
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

// ---------------- LIVE GPS & AUTOCOMPLETE LOGIC ----------------
function setupAddressAutocomplete() {
  const addressInput = document.querySelector('input[placeholder*="landmark"]') || 
                       document.querySelector('input[placeholder*="Delhi"]') || 
                       document.querySelector('input[name="address"]') ||
                       document.querySelector('#address');

  if (!addressInput) return;

  const parent = addressInput.parentElement;
  const oldBtn = document.getElementById('gps-locate-btn');
  if (oldBtn) oldBtn.remove();
  addressInput.style.paddingRight = '14px';

  const label = parent.querySelector('label') || parent.previousElementSibling;
  
  let headerRow = parent.querySelector('.location-header-row');
  if (!headerRow) {
    headerRow = document.createElement('div');
    headerRow.className = 'location-header-row';
    headerRow.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;';

    const gpsBtn = document.createElement('button');
    gpsBtn.id = 'gps-locate-btn';
    gpsBtn.type = 'button';
    gpsBtn.innerHTML = '🎯 Use My Current GPS';
    gpsBtn.style.cssText = 'background: rgba(16,185,129,0.15); color: #34d399; font-size: 11px; font-weight: 600; padding: 4px 8px; border-radius: 6px; border: 1px solid rgba(16,185,129,0.3); cursor: pointer; display: inline-flex; align-items: center; gap: 4px;';

    if (label && label.tagName === 'LABEL') {
      label.style.marginBottom = '0';
      headerRow.appendChild(label.cloneNode(true));
      label.replaceWith(headerRow);
      headerRow.appendChild(gpsBtn);
    } else {
      parent.insertBefore(headerRow, addressInput);
      headerRow.innerHTML = `<span style="font-size:12px; color:#94a3b8; font-weight:600;">Pickup Address</span>`;
      headerRow.appendChild(gpsBtn);
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
          const lat = position.coords.latitude;
          const lon = position.coords.longitude;

          try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`);
            const data = await res.json();
            if (data && data.display_name) {
              addressInput.value = data.display_name;
              gpsBtn.innerHTML = '✅ Located';
            } else {
              addressInput.value = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
              gpsBtn.innerHTML = '✅ GPS Coords';
            }
          } catch {
            addressInput.value = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
            gpsBtn.innerHTML = '✅ Coords Set';
          }
          setTimeout(() => { gpsBtn.innerHTML = '🎯 Use My Current GPS'; gpsBtn.style.color = '#34d399'; }, 3000);
        },
        () => {
          alert('Please allow location permission in browser.');
          gpsBtn.innerHTML = '❌ Denied';
          gpsBtn.style.color = '#f87171';
          setTimeout(() => { gpsBtn.innerHTML = '🎯 Use My Current GPS'; gpsBtn.style.color = '#34d399'; }, 3000);
        }
      );
    });
  }

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
      } catch (err) {
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

// ---------------- STRICT SINGLE SUBMISSION ----------------
let isSubmitting = false;

function setupDonationForm() {
  const form = document.querySelector('form') || document.querySelector('.hub-form');
  const postBtn = document.getElementById('publish-donation-btn') || 
                  document.querySelector('button[type="submit"]') || 
                  Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Publish') || b.textContent.includes('Broadcast'));

  const submitAction = async (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (isSubmitting) return;

    const itemInput = document.querySelector('input[placeholder*="biryani"]') || document.querySelector('input[name="food_item"]');
    const addressInput = document.querySelector('input[placeholder*="landmark"]') || document.querySelector('input[name="address"]');
    const qtyInput = document.querySelector('input[placeholder*="servings"]') || document.querySelector('input[name="quantity"]');
    const phoneInput = document.querySelector('input[placeholder*="43210"]') || document.querySelector('input[type="tel"]') || document.querySelector('input[name="phone"]');

    if (!itemInput || !addressInput || !itemInput.value.trim() || !addressInput.value.trim()) {
      alert('Please fill at least the Food item and Pickup address!');
      return;
    }

    isSubmitting = true;

    const newDonation = {
      id: Date.now().toString(),
      title: itemInput.value.trim(),
      quantity: qtyInput && qtyInput.value.trim() ? qtyInput.value.trim() : '20 servings',
      expiry_hours: 3,
      address: addressInput.value.trim(),
      phone: phoneInput && phoneInput.value.trim() ? phoneInput.value.trim() : '+91 98996 36474',
      status: 'AVAILABLE'
    };

    activeListings.unshift(newDonation);
    renderListings();

    try {
      await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newDonation)
      });
    } catch (err) {}

    itemInput.value = '';
    addressInput.value = '';
    if (qtyInput) qtyInput.value = '';
    if (phoneInput) phoneInput.value = '';

    setTimeout(() => { isSubmitting = false; }, 600);
  };

  if (form) form.onsubmit = submitAction;
  else if (postBtn) postBtn.onclick = submitAction;
}

// ---------------- INITIALIZE ----------------
window.addEventListener('DOMContentLoaded', () => {
  loadFeed();
  setupAddressAutocomplete();
  setupDonationForm();
});

setTimeout(() => {
  setupAddressAutocomplete();
  setupDonationForm();
}, 400);