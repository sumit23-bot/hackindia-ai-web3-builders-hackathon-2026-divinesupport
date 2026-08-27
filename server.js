const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors());

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const MONGO_URI = 'mongodb://127.0.0.1:27017/foodloop';

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ Connected to Local MongoDB Database!'))
  .catch((err) => console.error('❌ Database Connection Error:', err.message));

// User / NGO Schema
const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true, unique: true },
  role: { type: String, enum: ['DONOR', 'NGO', 'SHELTER', 'VOLUNTEER'], default: 'DONOR' },
  org_name: { type: String, default: '' },
  ngo_darpan_id: { type: String, default: '' },
  is_verified: { type: Boolean, default: true },
  trust_score: { type: Number, default: 100 },
  donations_count: { type: Number, default: 0 },
  claims_count: { type: Number, default: 0 },
  is_blacklisted: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now }
});
const User = mongoose.model('User', UserSchema);

// Donation Schema
const DonationSchema = new mongoose.Schema({
  title: { type: String, required: true },
  food_type: { type: String, default: 'Vegetarian' },
  quantity: { type: String, required: true },
  expiry_hours: { type: Number, default: 3 },
  address: { type: String, required: true },
  phone: { type: String, default: '+91 98996 36474' },
  donor_id: { type: String, default: '' },
  donor_name: { type: String, default: 'Anonymous Donor' },
  image: { type: String, default: '' },
  coords: {
    lat: { type: Number, default: 28.6139 },
    lon: { type: Number, default: 77.2090 }
  },
  is_verified: { type: Boolean, default: true },
  trust_score: { type: Number, default: 100 },
  status: { type: String, default: 'AVAILABLE' },
  claimed_by_ngo: { type: String, default: '' },
  created_at: { type: Date, default: Date.now }
});
const Donation = mongoose.model('Donation', DonationSchema);

let memoryUsers = [
  { name: 'Rohan Sharma', phone: '9811122233', role: 'DONOR', org_name: 'Grand Hyatt Delhi Banquet', is_verified: true, trust_score: 100 },
  { name: 'Priya Verma', phone: '9877788899', role: 'NGO', org_name: 'Robin Hood Army (Delhi Shelter Hub)', ngo_darpan_id: 'DL/2024/008194', is_verified: true, trust_score: 100 }
];
let memoryDonations = [];
let memoryBlacklist = new Set();

// ---------------- STRICT AUTH ENDPOINTS ----------------
app.post('/api/auth/register', async (req, res) => {
  const { name, phone, role, org_name, ngo_darpan_id } = req.body;

  try {
    let existing = await User.findOne({ phone });
    if (existing) {
      return res.status(400).json({ error: 'This phone number is already registered. Please Sign In directly.' });
    }

    const newUser = new User({
      name,
      phone,
      role,
      org_name: org_name || name,
      ngo_darpan_id: ngo_darpan_id || '',
      is_verified: true
    });
    await newUser.save();
    return res.status(201).json(newUser);
  } catch (err) {
    const existsMem = memoryUsers.find(u => u.phone === phone);
    if (existsMem) {
      return res.status(400).json({ error: 'This phone number is already registered. Please Sign In directly.' });
    }
    const fallbackUser = {
      id: Date.now().toString(),
      name,
      phone,
      role,
      org_name: org_name || name,
      ngo_darpan_id: ngo_darpan_id || '',
      is_verified: true,
      trust_score: 100
    };
    memoryUsers.push(fallbackUser);
    return res.status(201).json(fallbackUser);
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { phone } = req.body;

  try {
    const user = await User.findOne({ phone });
    if (user) {
      if (user.is_blacklisted || memoryBlacklist.has(phone)) {
        return res.status(403).json({ error: 'This account has been banned due to spam activity.' });
      }
      return res.json(user);
    }
  } catch (e) {}

  const memUser = memoryUsers.find(u => u.phone === phone);
  if (memUser) {
    if (memUser.is_blacklisted || memoryBlacklist.has(phone)) {
      return res.status(403).json({ error: 'This account has been banned due to spam activity.' });
    }
    return res.json(memUser);
  }

  // STRICT REJECTION: User doesn't exist
  return res.status(404).json({ error: 'Account not found! This phone number is not registered. Please click "Create Verified Account" first.' });
});

// ---------------- DONATIONS ----------------
app.get('/api/donations', async (req, res) => {
  try {
    const list = await Donation.find().sort({ created_at: -1 });
    res.json(list.length > 0 ? list : memoryDonations);
  } catch {
    res.json(memoryDonations);
  }
});

app.post('/api/donations', async (req, res) => {
  const { phone } = req.body;

  if (memoryBlacklist.has(phone)) {
    return res.status(403).json({ error: 'This phone number is permanently blacklisted.' });
  }

  try {
    const donor = await User.findOne({ phone });
    if (donor && donor.is_blacklisted) {
      return res.status(403).json({ error: 'Donor is permanently blacklisted.' });
    }

    let score = donor ? donor.trust_score : 100;
    const newItem = new Donation({ ...req.body, trust_score: score });
    await newItem.save();

    if (donor) {
      donor.donations_count += 1;
      await donor.save();
    }

    res.status(201).json(newItem);
  } catch (err) {
    const fallbackItem = { id: Date.now().toString(), ...req.body, trust_score: 100, status: 'AVAILABLE' };
    memoryDonations.unshift(fallbackItem);
    res.status(201).json(fallbackItem);
  }
});

app.patch('/api/donations/:id/claim', async (req, res) => {
  const { claimant_phone, claimant_org } = req.body || {};

  try {
    const updated = await Donation.findByIdAndUpdate(
      req.params.id, 
      { status: 'CLAIMED', claimed_by_ngo: claimant_org || 'Verified NGO Partner' }, 
      { new: true }
    );
    res.json(updated);
  } catch {
    const item = memoryDonations.find(d => String(d.id) === String(req.params.id) || String(d._id) === String(req.params.id));
    if (item) {
      item.status = 'CLAIMED';
      item.claimed_by_ngo = claimant_org || 'Verified NGO';
    }
    res.json(item || { status: 'CLAIMED' });
  }
});

app.post('/api/donations/:id/report-fake', async (req, res) => {
  try {
    const donation = await Donation.findById(req.params.id);
    if (donation) {
      donation.status = 'FLAGGED_FAKE';
      await donation.save();
      memoryBlacklist.add(donation.phone);
    }
    res.json({ message: 'Donor reported.' });
  } catch {
    const item = memoryDonations.find(d => String(d.id) === String(req.params.id) || String(d._id) === String(req.params.id));
    if (item) {
      item.status = 'FLAGGED_FAKE';
      if (item.phone) memoryBlacklist.add(item.phone);
    }
    res.json({ message: 'Donor reported.' });
  }
});

const PORT = 5000;
app.listen(PORT, () => console.log(`🚀 FoodLoop Server running on http://localhost:${PORT}`));