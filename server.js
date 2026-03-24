const express = require('express');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const REPO_PATH = process.env.REPO_PATH || __dirname;

app.use(cors());
app.use(express.json());

// Save changes to data.js and push to GitHub
app.post('/api/sync', (req, res) => {
  try {
    const { data } = req.body;
    
    if (!data) {
      return res.status(400).json({ error: 'No data provided' });
    }

    // Write data to data.js
    const dataPath = path.join(REPO_PATH, 'data.js');
    const jsContent = `window.PRELOADED_DATA = ${JSON.stringify(data, null, 2)};`;
    fs.writeFileSync(dataPath, jsContent);

    // Git operations
    try {
      execSync('git config user.email "sync@apptiming.com"', { cwd: REPO_PATH });
      execSync('git config user.name "AppTiming Bot"', { cwd: REPO_PATH });
      execSync('git add data.js', { cwd: REPO_PATH });
      execSync('git commit -m "Update: Sync changes from web app"', { cwd: REPO_PATH });
      execSync('git push origin main', { cwd: REPO_PATH });
    } catch (gitError) {
      // Ignore if no changes to commit
      console.log('Git operation message:', gitError.message);
    }

    res.json({ success: true, message: 'Changes synced to GitHub' });
  } catch (error) {
    console.error('Sync error:', error);
    res.status(500).json({ error: 'Sync failed', details: error.message });
  }
});

// This endpoint will be hit when page loads to get latest data
app.post('/api/pull', (req, res) => {
  try {
    execSync('git pull origin main', { cwd: REPO_PATH });
    
    const dataPath = path.join(REPO_PATH, 'data.js');
    const dataExists = fs.existsSync(dataPath);
    
    res.json({ success: true, message: 'Latest data pulled' });
  } catch (error) {
    console.error('Pull error:', error);
    res.status(500).json({ error: 'Pull failed', details: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
