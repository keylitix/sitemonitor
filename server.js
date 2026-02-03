const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const cron = require('node-cron');
const { checkAllSites, getSiteStatus, approveBaseline, initializeStorage, checkSingleSite } = require('./lib/monitor');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

// Dashboard home
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API: Get all site statuses
app.get('/api/sites', async (req, res) => {
  try {
    const status = await getSiteStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Trigger manual check
app.post('/api/check', async (req, res) => {
  try {
    res.json({ message: 'Check started', status: 'running' });
    // Run check in background
    checkAllSites().catch(console.error);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Check single site
app.post('/api/check/:siteId', async (req, res) => {
  try {
    const result = await checkSingleSite(req.params.siteId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Approve new baseline
app.post('/api/approve/:siteId', async (req, res) => {
  try {
    await approveBaseline(req.params.siteId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Get site config
app.get('/api/config', async (req, res) => {
  try {
    const config = JSON.parse(await fs.readFile('./config/sites.json', 'utf-8'));
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Update site config
app.post('/api/config', async (req, res) => {
  try {
    await fs.writeFile('./config/sites.json', JSON.stringify(req.body, null, 2));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Initialize and start server
async function start() {
  await initializeStorage();
  
  // Schedule checks based on env var (default: every 6 hours)
  const schedule = process.env.CHECK_SCHEDULE || '0 */6 * * *';
  cron.schedule(schedule, () => {
    console.log('Running scheduled check...');
    checkAllSites().catch(console.error);
  });

  app.listen(PORT, () => {
    console.log(`Site Monitor running on port ${PORT}`);
    console.log(`Check schedule: ${schedule}`);
  });
}

start().catch(console.error);
