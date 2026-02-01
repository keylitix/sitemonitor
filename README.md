# Site Visual Monitor

A visual regression monitoring tool that screenshots your websites and alerts you when they look different. Perfect for catching broken CSS, failed JavaScript, missing images, or caching issues.

## Features

- 📸 **Visual Regression Detection** - Compares screenshots to detect visual changes
- 🎯 **Configurable Thresholds** - Set how much change triggers an alert per site
- 🖼️ **Side-by-Side Comparison** - See baseline vs current screenshots
- 🔴 **Diff Highlighting** - Pink overlay shows exactly what changed
- ⏰ **Scheduled Checks** - Automatically runs on your schedule
- ✅ **Baseline Approval** - Accept intentional changes with one click
- 📊 **Dashboard** - Clean web UI to monitor all your sites

## Quick Start

### 1. Get Your Cloudinary Credentials

1. Log in to [Cloudinary Console](https://console.cloudinary.com/)
2. Go to **Dashboard**
3. Copy these three values:
   - Cloud Name
   - API Key
   - API Secret

### 2. Deploy to Render

#### Option A: One-Click Deploy (Recommended)

1. Push this code to a GitHub repository
2. Go to [Render Dashboard](https://dashboard.render.com/)
3. Click **New** → **Web Service**
4. Connect your GitHub repo
5. Render will auto-detect the settings, but verify:
   - **Runtime:** Node
   - **Build Command:** `npm install && npx playwright install chromium --with-deps`
   - **Start Command:** `npm start`
6. Add Environment Variables:
   - `CLOUDINARY_CLOUD_NAME` = your cloud name
   - `CLOUDINARY_API_KEY` = your API key
   - `CLOUDINARY_API_SECRET` = your API secret
   - `CHECK_SCHEDULE` = `0 */6 * * *` (optional, defaults to every 6 hours)
7. Click **Create Web Service**

#### Option B: Using render.yaml

1. Push this code to GitHub
2. Go to Render Dashboard → **Blueprints**
3. Connect your repo
4. Fill in the environment variables when prompted

### 3. Configure Your Sites

Once deployed:

1. Open your Render URL (e.g., `https://site-visual-monitor.onrender.com`)
2. Click **Configure Sites**
3. Edit the JSON to add your sites:

```json
{
  "sites": [
    {
      "id": "company-homepage",
      "name": "Company Homepage",
      "url": "https://yourcompany.com",
      "threshold": 0.03
    },
    {
      "id": "company-blog",
      "name": "Company Blog",
      "url": "https://yourcompany.com/blog",
      "threshold": 0.05
    },
    {
      "id": "client-site-abc",
      "name": "Client ABC",
      "url": "https://clientabc.com",
      "threshold": 0.05,
      "viewport": {
        "width": 1920,
        "height": 1080
      }
    }
  ],
  "defaults": {
    "threshold": 0.05,
    "viewport": {
      "width": 1280,
      "height": 720
    },
    "waitAfterLoad": 2000
  }
}
```

4. Click **Save Configuration**
5. Click **Run Check Now** to capture initial baselines

## Configuration Options

### Site Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | string | required | Unique identifier (no spaces) |
| `name` | string | required | Display name |
| `url` | string | required | Full URL to monitor |
| `threshold` | number | 0.05 | Difference threshold (0.05 = 5%) |
| `viewport` | object | {width: 1280, height: 720} | Browser viewport size |
| `waitAfterLoad` | number | 2000 | Milliseconds to wait after page load |

### Threshold Guide

- `0.01` (1%) - Very sensitive, catches tiny changes
- `0.03` (3%) - Recommended for critical pages
- `0.05` (5%) - Good default, ignores minor variations
- `0.10` (10%) - Lenient, only catches major changes

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CLOUDINARY_CLOUD_NAME` | Yes | Your Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | Yes | Your Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Yes | Your Cloudinary API secret |
| `CHECK_SCHEDULE` | No | Cron schedule (default: `0 */6 * * *`) |
| `PORT` | No | Server port (default: 3000) |

### Check Schedule Examples

| Schedule | Cron Expression |
|----------|-----------------|
| Every hour | `0 * * * *` |
| Every 6 hours | `0 */6 * * *` |
| Every 12 hours | `0 */12 * * *` |
| Daily at midnight | `0 0 * * *` |
| Daily at 6am and 6pm | `0 6,18 * * *` |

## Usage

### Dashboard

- **Summary Cards** - Quick overview of site statuses
- **Site Cards** - Each site shows status, screenshots, and actions
- **Click screenshots** - Opens full-size in modal
- **Check Now** - Run an immediate check on one or all sites
- **Approve as New Baseline** - Accept intentional changes

### Status Meanings

| Status | Meaning |
|--------|---------|
| 🟢 OK | Site looks the same as baseline |
| 🟡 Changed | Visual difference exceeds threshold |
| 🔴 Error | Site failed to load or HTTP error |
| 🔵 New | First check, baseline captured |

### Workflow

1. **Initial Setup** - First check captures baselines for all sites
2. **Ongoing Monitoring** - Scheduled checks compare against baselines
3. **When Changed** - Review the diff, visit the site
4. **If Intentional** - Click "Approve as New Baseline"
5. **If Problem** - Fix the issue, re-run check

## Free Tier Limits

### Render Free Tier
- Service spins down after 15 minutes of inactivity
- First request after sleep takes ~30 seconds
- 750 hours/month (plenty for one service)

### Cloudinary Free Tier
- 25GB storage
- 25GB bandwidth/month
- More than enough for this use case

### Tips for Staying Free
- Check every 6-12 hours instead of hourly
- Keep viewport sizes reasonable (1280x720 is fine)
- Periodically clean old screenshots from Cloudinary

## Troubleshooting

### "Service unavailable" on first visit
Normal - free tier spins down. Wait 30 seconds and refresh.

### Screenshots look wrong
- Increase `waitAfterLoad` for slow-loading sites
- Some sites block headless browsers - may need workarounds

### Too many false positives
- Increase threshold for that site
- Some sites have dynamic content (ads, timestamps) - consider threshold of 0.10+

### Changes not detecting
- Decrease threshold
- Check that the page actually loads (look at HTTP status)

## Adding Email Alerts Later

When you're ready to add email alerts, you'll need to:

1. Add a service like SendGrid or Mailgun
2. Add their API key to environment variables  
3. Modify `lib/monitor.js` to send emails when status is "changed" or "error"

Let me know when you want this and I can provide the code!

## Local Development

```bash
# Install dependencies
npm install

# Install Playwright browsers
npx playwright install chromium

# Set environment variables
export CLOUDINARY_CLOUD_NAME=xxx
export CLOUDINARY_API_KEY=xxx
export CLOUDINARY_API_SECRET=xxx

# Run locally
npm start
```

Visit http://localhost:3000

## License

MIT
