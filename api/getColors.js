// api/getColors.js
import fetch from 'node-fetch';
import css from 'css';

export default async function handler(req, res) {
    // CORS headers to allow requests from Webflow
    res.setHeader('Access-Control-Allow-Origin', 'https://alterkit.webflow.io'); // Replace with your Webflow domain
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight (OPTIONS) request
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // Only allow POST requests
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method Not Allowed' });
        return;
    }

    // Extract the URL from the request body
    const { url } = req.body;
    if (!url) {
        res.status(400).json({ error: 'URL is required' });
        return;
    }

    try {
        // Fetch the HTML content from the URL
        const response = await fetch(url);
        const html = await response.text();

        // Extract CSS file links from the HTML
        const cssLinks = [...html.matchAll(/<link.*?href="(.*?\.css)"/g)].map(match => match[1]);

        // Use a Set to avoid duplicate colors
        let colorList = new Set();

        // Fetch and parse each CSS file
        for (const cssUrl of cssLinks) {
            const cssResponse = await fetch(cssUrl.startsWith('http') ? cssUrl : `${url}${cssUrl}`);
            const cssText = await cssResponse.text();
            const parsedCSS = css.parse(cssText);

            // Extract color-related properties from CSS rules
            parsedCSS.stylesheet.rules.forEach(rule => {
                if (rule.declarations) {
                    rule.declarations.forEach(declaration => {
                        if (declaration.property === 'color' || declaration.property === 'background-color') {
                            colorList.add(declaration.value);
                        }
                    });
                }
            });
        }

        // Respond with the list of unique colors
        res.status(200).json({ colors: Array.from(colorList) });
    } catch (error) {
        console.error("Error processing the URL:", error);
        res.status(500).json({ error: 'An error occurred while processing the URL' });
    }
}
