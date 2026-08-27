const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors());

// Image uploads crash na ho isliye 50mb limit
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const MONGO_URI = 'mongodb://127.0.0.1:27017/foodloop';

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ Connected to Local MongoDB Database!'))
  .catch((err) => console.error('❌ Connection Failed:', err.message));

const DonationSchema = new mongoose.Schema({
  title: { type: String, required: true },
  food_type: { type: String, default: 'Vegetarian' },
  quantity: { type: String, required: true },
  expiry_hours: { type: Number, default: 3 },
  address: { type: String, required: true },
  phone: { type: String, default: '+91 98996 36474' },
  image: { type: String, default: '' },
  is_verified: { type: Boolean, default: true },
  status: { type: String, default: 'AVAILABLE' },
  created_at: { type: Date, default: Date.now }
});

const Donation = mongoose.model('Donation', DonationSchema);

let memoryDonations = [];

app.get('/api/donations', async (req, res) => {
  try {
    const list = await Donation.find().sort({ created_at: -1 });
    res.json(list.length > 0 ? list : memoryDonations);
  } catch {
    res.json(memoryDonations);
  }
});

app.post('/api/donations', async (req, res) => {
  try {
    const newItem = new Donation(req.body);
    await newItem.save();
    res.status(201).json(newItem);
  } catch (err) {
    const fallbackItem = { id: Date.now().toString(), ...req.body, status: 'AVAILABLE' };
    memoryDonations.unshift(fallbackItem);
    res.status(201).json(fallbackItem);
  }
});

app.patch('/api/donations/:id/claim', async (req, res) => {
  try {
    const updated = await Donation.findByIdAndUpdate(
      req.params.id, 
      { status: 'CLAIMED' }, 
      { new: true }
    );
    res.json(updated);
  } catch {
    const item = memoryDonations.find(d => String(d.id) === String(req.params.id) || String(d._id) === String(req.params.id));
    if (item) item.status = 'CLAIMED';
    res.json(item || { status: 'CLAIMED' });
  }
});

const PORT = 5000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));