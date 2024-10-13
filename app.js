const express = require('express');
const axios = require('axios');
const fs = require('fs');
require('dotenv').config(); // To load API key from .env

const app = express();
const port = 3000;

// External API URLs
const configApiUrl = 'https://crimebuehl-bikes.de/api/order'; // Example GET endpoint
const shopwareApiUrl = 'https://crimebuehl-bikes.de/api/search/order'; // POST endpoint for order search
const destinationApiUrl = 'https://another-api.com/update'; // Replace with actual destination API URL

// Middleware to parse incoming requests with JSON payloads
app.use(express.json());

// Headers setup for both GET and POST requests
const axiosHeaders = {
    'Authorization': `Bearer ${process.env.TOKEN}`,  // Authorization using API key from .env
    'sw-access': process.env.API_KEY,                  // sw-access header using API key
};

// Path to file where we store the timestamp
const timestampFilePath = './savedTimestamp.txt';

// Helper function to get saved timestamp from a file
const getSavedTimestamp = () => {
    if (fs.existsSync(timestampFilePath)) {
        const timestamp = fs.readFileSync(timestampFilePath, 'utf-8');
        return timestamp ? new Date(timestamp) : null;
    }
    return null;
};

// Helper function to save the new timestamp
const saveTimestamp = (newTimestamp) => {
    fs.writeFileSync(timestampFilePath, newTimestamp.toISOString(), 'utf-8');
};

// GET route to fetch data from an external API
app.get('/', async (req, res) => {
    try {
        const response = await axios.get(configApiUrl, { headers: axiosHeaders });

        // Send the fetched data back to the client
        res.json({
            apiData: response.data
        });
    } catch (error) {
        console.error('Error fetching data from external API:', error.message);
        res.status(500).json({ error: 'Failed to fetch data from external API' });
    }
});

// POST route to interact with the Shopware API
app.post('/search-order', async (req, res) => {
    try {
        const options = {
            method: 'POST',
            url: shopwareApiUrl,
            headers: axiosHeaders, // Use the same headers as the GET request
            data: req.body         // Pass the request body to the external API
        };

        // Perform the POST request to the Shopware API
        const response = await axios.request(options);

        // Send the API response and custom calculated data back to the client
        res.json({
            apiData: response.data
        });
    } catch (error) {
        console.error('Error fetching data from Shopware API:', error.message);
        res.status(500).json({ error: 'Failed to fetch data from Shopware API' });
    }
});

// New POST route to fetch and process orders based on the saved timestamp
app.post('/fetch-orders', async (req, res) => {
    try {
        // Get the saved timestamp if it exists
        const savedTimestamp = getSavedTimestamp();
        console.log('Saved timestamp:', savedTimestamp);

        // Prepare the body for the token request
        const tokenBody = {
            grant_type: 'client_credentials',
            client_id: process.env.CLIENT_ID,       // Client ID from .env
            client_secret: process.env.CLIENT_SECRET // Client Secret from .env
        };

        // Set the headers for the token request
        const tokenHeaders = {
            'Content-Type': 'application/json', // Set content type for token request
            'sw-access': process.env.API_KEY
        };

        // Make a request to obtain the access token
        const tokenResponse = await axios.post('https://crimebuehl-bikes.de/api/oauth/token', tokenBody, { headers: tokenHeaders });
        const accessToken = tokenResponse.data.access_token; // Adjust according to your response structure

        // Set the headers for fetching orders
        const headers = {
            'Content-Type': 'application/json',           // Set content type
            'Authorization': `Bearer ${accessToken}`,     // Use Bearer token from token response
            'sw-access': process.env.API_KEY              // Additional sw-access header
        };

        // Make a request to the external API to fetch orders
        const response = await axios.post(shopwareApiUrl, {}, { headers });

        // Log the full response to check its structure
        console.log('API Response:', response.data);

        // Extract the orders from the response
        let orders = response.data.data || [];

        // Log attributes of each order
        orders.forEach(order => {
            console.log('Order ID:', order.id);
            console.log('Order:', order); // Log the entire order for debugging
        });

        // Filter orders that are newer than the saved timestamp (if it exists)
        if (savedTimestamp) {
            orders = orders.filter(order => {
                const orderDate = new Date(order.orderDateTime); // Access orderDateTime directly from the order object
                return orderDate > savedTimestamp;
            });
        }

        // Sort the remaining orders by orderDateTime (oldest first)
        orders.sort((a, b) => {
            const dateA = new Date(a.orderDateTime); // Access orderDateTime directly from the order object
            const dateB = new Date(b.orderDateTime); // Access orderDateTime directly from the order object
            return dateA - dateB;
        });

        if (orders.length === 0) {
            return res.json({ message: 'No new orders found.' });
        }

        // Send sorted orders to another API endpoint
       // await axios.post(destinationApiUrl, { orders }, { headers });

        // Get the newest timestamp from the sorted orders and save it
        const newestTimestamp = new Date(orders[orders.length - 1].orderDateTime); // Access orderDateTime directly
        saveTimestamp(newestTimestamp);

        // Respond with the processed orders and the newest timestamp
        res.json({
            message: 'Orders processed successfully.',
            processedOrders: orders,
            newestTimestamp: newestTimestamp
        });

    } catch (error) {
        console.error('Error processing orders:', error.message);
        res.status(500).json({ error: 'Failed to process orders.' });
    }
});

// Start the Express server
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});