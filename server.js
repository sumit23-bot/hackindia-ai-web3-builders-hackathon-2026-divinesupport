const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

mongoose.connect('mongodb://127.0.0.1:27017/foodloop')
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(() => console.log('⚠️ Using Memory Fallback'));

const DonationSchema = new mongoose.Schema({
  title: String,
  food_type: String,
  quantity: String,
  expiry_hours: Number,
  address: String,
  phone: String,
  status: { type: String, default: 'AVAILABLE' },
  created_at: { type: Date, default: Date.now }
});

const Donation = mongoose.model('Donation', DonationSchema);

let memoryDonations = [
  { id: '1', title: '50 Meals Dal Makhani & Roti', quantity: '50 servings', expiry_hours: 3, address: 'Sector 62, Noida, Uttar Pradesh', phone: '+91 98765 43210', status: 'AVAILABLE' }
];

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
  } catch {
    const fallbackItem = { id: Date.now().toString(), ...req.body, status: 'AVAILABLE' };
    memoryDonations.unshift(fallbackItem);
    res.status(201).json(fallbackItem);
  }
});

app.patch('/api/donations/:id/claim', async (req, res) => {
  try {
    const updated = await Donation.findByIdAndUpdate(req.params.id, { status: 'CLAIMED' }, { new: true });
    res.json(updated);
  } catch {
    const item = memoryDonations.find(d => String(d.id) === String(req.params.id) || String(d._id) === String(req.params.id));
    if (item) item.status = 'CLAIMED';
    res.json(item || { status: 'CLAIMED' });
  }
});

const PORT = 5000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));