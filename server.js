// server.js - Simple Express proxy server for Claude API

// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 3000;

// Get API key from environment variables
const API_KEY = process.env.CLAUDE_API_KEY;

// Check if API key is loaded
if (!API_KEY) {
    console.error('ERROR: CLAUDE_API_KEY not found in .env file!');
    console.error('Please create a .env file with your API key.');
    process.exit(1);
}

// Enable CORS for all routes (allows P5.js to connect)
app.use(cors());

// Parse JSON bodies
app.use(express.json());

// Serve static files from public folder (for your P5.js files)
app.use(express.static('public'));

// Proxy route for Claude API
app.post('/api/claude', async (req, res) => {
    try {
        console.log('Received request:', req.body);

        // Make request to Claude API
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': API_KEY,  // Claude uses x-api-key, not Authorization
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify(req.body)
        });

        const data = await response.json();
        console.log('Claude response:', data);

        // Send Claude's response back to P5.js
        res.json(data);

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Failed to call Claude API' });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log('Open your browser and go to http://localhost:3000 to see your P5.js sketch');
});