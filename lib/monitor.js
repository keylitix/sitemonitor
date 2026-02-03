const cloudinary = require('cloudinary').v2;
const { PNG } = require('pngjs');
const pixelmatch = require('pixelmatch');
const fs = require('fs').promises;

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// ScreenshotOne API key
const SCREENSHOT_API_KEY = process.env.SCREENSHOTONE_API_KEY;

// In-memory status store (persisted to Cloudinary)
let siteStatus = {};
const STATUS_FILE = 'site-monitor/status.json';

// Initialize storage - load existing status from Cloudinary
async function initializeStorage() {
  try {
    const result = await cloudinary.api.resource(STATUS_FILE, { resource_type: 'raw' });
    const response = await fetch(result.secure_url);
    siteStatus = await response.json();
    console.log('Loaded existing status from Cloudinary');
  } catch (error) {
    console.log('No existing status found, starting fresh');
    siteStatus = {};
  }
  
  // Ensure config directory exists
  try {
    await fs.mkdir('./config', { recursive: true });
  } catch (e) {}
  
  // Create default config if not exists
  try {
    await fs.access('./config/sites.json');
  } catch {
    const defaultConfig = {
      sites: [
        {
          id: "example",
          name: "Example Site",
          url: "https://example.com",
          threshold: 0.05
        }
      ],
      defaults: {
        threshold: 0.05,
        viewport: { width: 1280, height: 720 },
        waitAfterLoad: 2000
      }
    };
    await fs.writeFile('./config/sites.json', JSON.stringify(defaultConfig, null, 2));
  }
}

// Save status to Cloudinary
async function saveStatus() {
  const buffer = Buffer.from(JSON.stringify(siteStatus, null, 2));
  const tempPath = `/tmp/status-${Date.now()}.json`;
  await fs.writeFile(tempPath, buffer);
  
  await cloudinary.uploader.upload(tempPath, {
    resource_type: 'raw',
    public_id: STATUS_FILE,
    overwrite: true
  });
  
  await fs.unlink(tempPath).catch(() => {});
}

// Upload image to Cloudinary
async function uploadImage(buffer, folder, name) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: `site-monitor/${folder}`,
        public_id: name,
        overwrite: true
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result.secure_url);
      }
    );
    uploadStream.end(buffer);
  });
}

// Download image from URL
async function downloadImage(url) {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  return Buffer.from(buffer);
}

// Take screenshot using ScreenshotOne API
async function takeScreenshot(url, viewport = { width: 1280, height: 720 }, delay = 2) {
  const params = new URLSearchParams({
    access_key: SCREENSHOT_API_KEY,
    url: url,
    viewport_width: viewport.width.toString(),
    viewport_height: viewport.height.toString(),
    format: 'png',
    block_ads: 'true',
    block_cookie_banners: 'true',
    delay: delay.toString(),
    timeout: '30'
  });

  const apiUrl = `https://api.screenshotone.com/take?${params.toString()}`;
  
  const startTime = Date.now();
  let statusCode = 0;
  const errors = [];
  
  try {
    const response = await fetch(apiUrl);
    const loadTime = Date.now() - startTime;
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Screenshot API error: ${response.status} - ${errorText}`);
    }
    
    const screenshot = Buffer.from(await response.arrayBuffer());
    statusCode = 200; // If we got the screenshot, the site loaded
    
    return {
      screenshot,
      loadTime,
      statusCode,
      errors
    };
  } catch (error) {
    errors.push(error.message);
    return {
      screenshot: null,
      loadTime: Date.now() - startTime,
      statusCode: 0,
      errors
    };
  }
}

// Compare two images and return difference percentage
async function compareImages(img1Buffer, img2Buffer) {
  const img1 = PNG.sync.read(img1Buffer);
  const img2 = PNG.sync.read(img2Buffer);
  
  // Handle different sizes
  if (img1.width !== img2.width || img1.height !== img2.height) {
    return { diffPercent: 1.0, diffImage: null, sizeMismatch: true };
  }
  
  const { width, height } = img1;
  const diff = new PNG({ width, height });
  
  const numDiffPixels = pixelmatch(
    img1.data,
    img2.data,
    diff.data,
    width,
    height,
    { threshold: 0.1 }
  );
  
  const totalPixels = width * height;
  const diffPercent = numDiffPixels / totalPixels;
  
  return {
    diffPercent,
    diffImage: PNG.sync.write(diff),
    sizeMismatch: false
  };
}

// Check a single site
async function checkSingleSite(siteId) {
  const config = JSON.parse(await fs.readFile('./config/sites.json', 'utf-8'));
  const site = config.sites.find(s => s.id === siteId);
  
  if (!site) {
    throw new Error(`Site not found: ${siteId}`);
  }
  
  const defaults = config.defaults || {};
  const threshold = site.threshold || defaults.threshold || 0.05;
  const viewport = site.viewport || defaults.viewport || { width: 1280, height: 720 };
  const delay = site.delay || defaults.delay || 2;
  
  console.log(`Checking ${site.name} (${site.url})...`);
  
  const { screenshot, loadTime, statusCode, errors } = await takeScreenshot(
    site.url,
    viewport,
    delay
  );
  
  const timestamp = new Date().toISOString();
  const currentStatus = siteStatus[siteId] || {};
  
  // If screenshot failed
  if (!screenshot) {
    const result = {
      id: siteId,
      name: site.name,
      url: site.url,
      lastCheck: timestamp,
      loadTime,
      statusCode,
      consoleErrors: errors,
      status: 'error',
      reason: errors.join(', ') || 'Failed to capture screenshot',
      baselineScreenshot: currentStatus.baselineScreenshot
    };
    siteStatus[siteId] = result;
    await saveStatus();
    console.log(`  Status: error - ${result.reason}`);
    return result;
  }
  
  // Upload current screenshot
  const currentUrl = await uploadImage(screenshot, 'current', siteId);
  
  let result = {
    id: siteId,
    name: site.name,
    url: site.url,
    lastCheck: timestamp,
    loadTime,
    statusCode,
    consoleErrors: errors,
    currentScreenshot: currentUrl,
    status: 'ok'
  };
  
  // If we have a baseline, compare
  if (currentStatus.baselineScreenshot) {
    try {
      const baselineBuffer = await downloadImage(currentStatus.baselineScreenshot);
      const { diffPercent, diffImage, sizeMismatch } = await compareImages(baselineBuffer, screenshot);
      
      result.diffPercent = diffPercent;
      result.threshold = threshold;
      result.baselineScreenshot = currentStatus.baselineScreenshot;
      
      if (sizeMismatch) {
        result.status = 'changed';
        result.reason = 'Viewport size changed';
      } else if (diffPercent > threshold) {
        result.status = 'changed';
        result.reason = `Visual difference: ${(diffPercent * 100).toFixed(1)}%`;
        
        // Upload diff image
        if (diffImage) {
          result.diffScreenshot = await uploadImage(diffImage, 'diff', siteId);
        }
      }
    } catch (compareError) {
      console.error(`Error comparing ${siteId}:`, compareError);
      result.status = 'error';
      result.reason = compareError.message;
    }
  } else {
    // No baseline - set current as baseline
    result.baselineScreenshot = currentUrl;
    result.status = 'new';
    result.reason = 'Initial baseline captured';
  }
  
  // Update status
  siteStatus[siteId] = result;
  await saveStatus();
  
  console.log(`  Status: ${result.status}${result.reason ? ` - ${result.reason}` : ''}`);
  
  return result;
}

// Check all sites
async function checkAllSites() {
  const config = JSON.parse(await fs.readFile('./config/sites.json', 'utf-8'));
  const results = [];
  
  for (const site of config.sites) {
    try {
      const result = await checkSingleSite(site.id);
      results.push(result);
      
      // Small delay between sites to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`Error checking ${site.id}:`, error);
      results.push({
        id: site.id,
        name: site.name,
        url: site.url,
        status: 'error',
        reason: error.message,
        lastCheck: new Date().toISOString()
      });
    }
  }
  
  return results;
}

// Get current status of all sites
async function getSiteStatus() {
  const config = JSON.parse(await fs.readFile('./config/sites.json', 'utf-8'));
  
  return config.sites.map(site => ({
    id: site.id,
    name: site.name,
    url: site.url,
    ...siteStatus[site.id]
  }));
}

// Approve current screenshot as new baseline
async function approveBaseline(siteId) {
  if (!siteStatus[siteId]) {
    throw new Error(`No status found for site: ${siteId}`);
  }
  
  const current = siteStatus[siteId];
  
  // Copy current to baseline
  if (current.currentScreenshot) {
    current.baselineScreenshot = current.currentScreenshot;
    current.status = 'ok';
    current.diffPercent = 0;
    current.reason = 'Baseline approved';
    delete current.diffScreenshot;
    
    await saveStatus();
  }
  
  return current;
}

module.exports = {
  initializeStorage,
  checkAllSites,
  checkSingleSite,
  getSiteStatus,
  approveBaseline
};
