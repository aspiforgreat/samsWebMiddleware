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

// New POST route to fetch and process orders based on the saved timestamp
app.post('/fetch-orders', async (req, res) => {
    try {
        // Get the saved timestamp if it exists
        const savedTimestamp = getSavedTimestamp();
        console.log('Saved timestamp:', savedTimestamp);

        // Get the current date and subtract one day (24 hours in milliseconds)
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

        // Check if the savedTimestamp is older than one day
        if (!savedTimestamp || new Date(savedTimestamp) < oneDayAgo) {
            console.log('Saved timestamp is older than one day or does not exist, fetching new orders.');

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
                    return orderDate > new Date(savedTimestamp);
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

            // Get the newest timestamp from the sorted orders
            const newestTimestamp = new Date(orders[orders.length - 1].orderDateTime); // Access orderDateTime directly

            // Check if the newest timestamp is not older than one day
            if (newestTimestamp >= oneDayAgo) {
                saveTimestamp(newestTimestamp); // Save the newest timestamp
                console.log('Saved the newest timestamp:', newestTimestamp);

                // Respond with the processed orders and the newest timestamp
                return res.json({
                    message: 'Orders processed successfully.',
                    processedOrders: orders,
                    newestTimestamp: newestTimestamp
                });
            } else {
                console.log('Newest timestamp is older than one day; not saving.');
                return res.json({ message: 'No new orders to process.' });
            }
        } else {
            console.log('Saved timestamp is recent; no new orders to fetch.');
            return res.json({ message: 'No new orders to process.' });
        }
    } catch (error) {
        console.error('Error processing orders:', error.message);
        res.status(500).json({ error: 'Failed to process orders.' });
    }
});

// Start the Express server
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});