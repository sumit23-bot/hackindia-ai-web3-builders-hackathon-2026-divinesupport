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
  is_food_verified: { type: Boolean, default: true },
  ai_detected_class: { type: String, default: 'Food' },
  trust_score: { type: Number, default: 100 },
  status: { type: String, default: 'AVAILABLE' },
  claimed_by_ngo: { type: String, default: '' },
  created_at: { type: Date, default: Date.now }
}, { strict: false });
const Donation = mongoose.model('Donation', DonationSchema);

// Contact Message Schema
const ContactSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  message: { type: String, required: true },
  created_at: { type: Date, default: Date.now }
});
const Contact = mongoose.model('Contact', ContactSchema);

let memoryUsers = [
  { name: 'Rohan Sharma', phone: '9811122233', role: 'DONOR', org_name: 'Grand Hyatt Delhi Banquet', is_verified: true, trust_score: 100 },
  { name: 'Priya Verma', phone: '9877788899', role: 'NGO', org_name: 'Robin Hood Army (Delhi Shelter Hub)', ngo_darpan_id: 'DL/2024/008194', is_verified: true, trust_score: 100 }
];
let memoryDonations = [];
let memoryContacts = [];
let memoryBlacklist = new Set();

// Auth Endpoints
app.post('/api/auth/register', async (req, res) => {
  const { name, phone, role, org_name, ngo_darpan_id } = req.body;
  try {
    let existing = await User.findOne({ phone });
    if (existing) return res.status(400).json({ error: 'Phone already registered.' });

    const newUser = new User({ name, phone, role, org_name: org_name || name, ngo_darpan_id: ngo_darpan_id || '', is_verified: true });
    await newUser.save();
    return res.status(201).json(newUser);
  } catch (err) {
    const fallbackUser = { id: Date.now().toString(), name, phone, role, org_name: org_name || name, ngo_darpan_id: ngo_darpan_id || '', is_verified: true, trust_score: 100 };
    memoryUsers.push(fallbackUser);
    return res.status(201).json(fallbackUser);
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { phone } = req.body;
  try {
    const user = await User.findOne({ phone });
    if (user) return res.json(user);
  } catch (e) {}

  const memUser = memoryUsers.find(u => u.phone === phone);
  if (memUser) return res.json(memUser);

  return res.status(404).json({ error: 'Account not found! Please register first.' });
});

// Donation Endpoints
app.get('/api/donations', async (req, res) => {
  try {
    const list = await Donation.find().sort({ created_at: -1 });
    res.json(list.length > 0 ? list : memoryDonations);
  } catch {
    res.json(memoryDonations);
  }
});

app.post('/api/donations', async (req, res) => {
  const { phone, is_food_verified, ai_detected_class, trust_score } = req.body;
  if (memoryBlacklist.has(phone)) {
    return res.status(403).json({ error: 'This phone number is blacklisted.' });
  }

  try {
    const newItem = new Donation({
      ...req.body,
      is_food_verified: is_food_verified !== undefined ? is_food_verified : true,
      ai_detected_class: ai_detected_class || 'Food',
      trust_score: trust_score !== undefined ? trust_score : 100
    });
    await newItem.save();
    res.status(201).json(newItem);
  } catch (err) {
    const fallbackItem = { id: Date.now().toString(), ...req.body, status: 'AVAILABLE' };
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
    await Donation.findByIdAndUpdate(req.params.id, { status: 'FLAGGED_FAKE' });
    res.json({ message: 'Reported successfully' });
  } catch {
    res.json({ message: 'Reported locally' });
  }
});

// Contact / Notes Endpoints
app.post('/api/contact', async (req, res) => {
  const { name, email, message } = req.body;
  if (!name || !email || !message) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  try {
    const newNote = new Contact({ name, email, message });
    await newNote.save();
    console.log(`📩 New Help Request from ${name} (${email}): "${message}"`);
    res.status(201).json({ success: true, note: newNote });
  } catch (err) {
    const fallbackNote = { id: Date.now().toString(), name, email, message, created_at: new Date() };
    memoryContacts.unshift(fallbackNote);
    console.log(`📩 New Help Request (Memory) from ${name} (${email}): "${message}"`);
    res.status(201).json({ success: true, note: fallbackNote });
  }
});

app.get('/api/contact', async (req, res) => {
  try {
    const notes = await Contact.find().sort({ created_at: -1 });
    res.json(notes.length > 0 ? notes : memoryContacts);
  } catch {
    res.json(memoryContacts);
  }
});

app.delete('/api/donations/purge-all', async (req, res) => {
  try {
    await Donation.deleteMany({});
    memoryDonations = [];
    res.json({ message: 'Database cleared' });
  } catch {
    memoryDonations = [];
    res.json({ message: 'Memory cleared' });
  }
});

const PORT = 5000;
app.listen(PORT, () => console.log(`🚀 FoodLoop Server running on http://localhost:${PORT}`));