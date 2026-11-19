const express = require('express');
const router = express.Router();
const adminConfigService = require('../services/adminConfig.service');
const SUPPORTED_CURRENCIES = ['BTC', 'ETH', 'USDT', 'USDC'];

// Helper to get current ADMIN_KEY dynamically
function getAdminKey() {
  return process.env.ADMIN_KEY || process.env.ADMIN_API_KEY || null;
}

// GET /api/deposit/address?currency=BTC - get a single deposit address (public)
router.get('/address', async (req, res) => {
  const currency = (req.query.currency || 'BTC').toString().toUpperCase();
  if (!SUPPORTED_CURRENCIES.includes(currency)) {
    return res.status(400).json({ success: false, error: 'Unsupported currency' });
  }

  try {
    const address = await adminConfigService.getDepositAddress(currency);
    if (!address) return res.status(404).json({ success: false, error: 'Deposit address is not configured' });
    return res.json({ success: true, currency, address });
  } catch (err) {
    console.error('Deposit address lookup error:', err.message || err);
    return res.status(500).json({ success: false, error: 'Failed to load deposit address' });
  }
});

// GET /api/deposit/addresses - get all deposit addresses (admin only)
router.get('/addresses', async (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  const ADMIN_KEY = getAdminKey();

  if (!ADMIN_KEY || !adminKey || adminKey !== ADMIN_KEY) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  try {
    const addresses = await adminConfigService.getDepositAddresses();
    return res.json({ success: true, addresses });
  } catch (err) {
    console.error('Deposit addresses lookup error:', err.message || err);
    return res.status(500).json({ error: 'Failed to load deposit addresses' });
  }
});

// POST /api/deposit/addresses - set deposit addresses (admin only)
router.post('/addresses', async (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  const ADMIN_KEY = getAdminKey();

  if (!ADMIN_KEY || !adminKey || adminKey !== ADMIN_KEY) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  const { addresses } = req.body;
  if (!addresses || typeof addresses !== 'object' || Array.isArray(addresses)) {
    return res.status(400).json({ error: 'addresses object required' });
  }

  const updates = {};
  for (const symbol of SUPPORTED_CURRENCIES) {
    if (addresses[symbol] !== undefined) {
      if (typeof addresses[symbol] !== 'string' || !addresses[symbol].trim()) {
        return res.status(400).json({ error: `Invalid address for ${symbol}` });
      }
      updates[symbol] = addresses[symbol].trim();
    }
  }
  if (!Object.keys(updates).length) return res.status(400).json({ error: 'No supported addresses provided' });

  try {
    await adminConfigService.setDepositAddresses(updates);
    const savedAddresses = await adminConfigService.getDepositAddresses();
    return res.json({ success: true, addresses: savedAddresses });
  } catch (err) {
    console.error('Deposit addresses update error:', err.message || err);
    return res.status(500).json({ error: 'Failed to save deposit addresses' });
  }
});

module.exports = router;
