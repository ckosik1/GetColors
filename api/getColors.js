import fetch from 'node-fetch';
import css from 'css';

export default async function handler(req, res) {
    // Set CORS headers for all responses
    res.setHeader('Access-Control-Allow-Origin', 'https://alterkit.webflow.io'); // Adjust to your Webflow domain
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    console.log('Received request:', req.method);

    // Handle preflight request (OPTIONS)
    if (req.method === 'OPTIONS') {
        console.log('Handling OPTIONS request');
        res.status(200).end();
        return;
    }

    // Only allow POST requests
    if (req.method !== 'POST') {
        console.log('Method not allowed');
        res.status(405).json({ error: 'Method Not Allowed' });
        return;
    }

    // Extract the URL from the request body
    const { url } = req.body;
    if (!url) {
        console.log('No URL provided');
        res.status(400).json({ error: 'URL is required' });
        return;
    }

    try {
        console.log('Fetching HTML from URL:', url);
        const response = await fetch(url);
        const html = await response.text();

        // Extract CSS file links from the HTML
        const cssLinks = [...html.matchAll(/<link.*?href="(.*?\.css)"/g)].map(match => match[1]);
        console.log('CSS links found:', cssLinks);

        let colorList = new Set();
        let variableDefinitions = {};

        // Function to check if a color is valid (not transparent, inherit, or low opacity)
        const isValidColor = (color) => {
            if (color === 'transparent' || color === 'inherit') return false;
            if (color.startsWith('rgba')) {
                const rgba = color.match(/rgba?\((\d+), (\d+), (\d+), (\d?\.?\d+)\)/);
                if (rgba && parseFloat(rgba[4]) < 0.99) return false;
            }
            return true;
        };

        // Fetch and parse each CSS file
        for (const cssUrl of cssLinks) {
            const fullCssUrl = cssUrl.startsWith('http') ? cssUrl : new URL(cssUrl, url).href;
            console.log('Fetching CSS from:', fullCssUrl);
            const cssResponse = await fetch(fullCssUrl);
            const cssText = await cssResponse.text();
            const parsedCSS = css.parse(cssText);

            // Extract variable definitions from the entire CSS
            parsedCSS.stylesheet.rules.forEach(rule => {
                if (rule.declarations) {
                    rule.declarations.forEach(declaration => {
                        if (declaration.property.startsWith('--')) {
                            // Store variable definitions, including fallback values
                            variableDefinitions[declaration.property] = declaration.value;
                        }
                    });
                }
            });

            // Extract color-related properties from CSS rules
            parsedCSS.stylesheet.rules.forEach(rule => {
                if (rule.declarations) {
                    rule.declarations.forEach(declaration => {
                        if (declaration.property === 'color' || declaration.property === 'background-color') {
                            let color = declaration.value;

                            // Resolve any variables in the color value
                            color = resolveCssVariables(color, variableDefinitions);

                            if (isValidColor(color)) {
                                colorList.add(color);
                            }
                        }
                    });
                }
            });
        }

        // Respond with the list of unique colors
        console.log('Colors extracted:', Array.from(colorList));
        res.status(200).json({ colors: Array.from(colorList) });
    } catch (error) {
        console.error('Error processing the URL:', error);
        res.status(500).json({ error: 'An error occurred while processing the URL' });
    }
}

// Function to resolve CSS variables in a color string
const resolveCssVariables = (color, variables) => {
    return color.replace(/var\((--[a-zA-Z0-9_-]+)(?:, *([^)]*))?\)/g, (match, variableName, fallback) => {
        // Check if the variable is defined and has a fallback
        const variableValue = variables[variableName];

        // If the variable is found, return its value, otherwise use the fallback value or return the original variable reference
        return variableValue ? variableValue : (fallback || match);
    });
};
