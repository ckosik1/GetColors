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

        // Function to calculate luminance of a color
        const luminance = (r, g, b) => {
            const a = [r, g, b].map(function (x) {
                x = x / 255;
                return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
            });
            return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
        };

        // Convert color to RGB and calculate luminance
        const getRgbFromColor = (color) => {
            const rgba = color.match(/rgba?\((\d+), (\d+), (\d+)/);
            if (rgba) {
                return { r: parseInt(rgba[1]), g: parseInt(rgba[2]), b: parseInt(rgba[3]) };
            }
            return null;
        };

        // Function to check if an element is visible (not display:none or visibility:hidden)
        const isElementVisible = (element) => {
            const style = window.getComputedStyle(element);
            return style.display !== 'none' && style.visibility !== 'hidden';
        };

        // Function to resolve CSS variables in a color string
        const resolveCssVariables = (color, variables) => {
            return color.replace(/var\((--[a-zA-Z0-9_-]+)\)/g, (match, variableName) => {
                return variables[variableName] || match;
            });
        };

        // Fetch and parse each CSS file
        for (const cssUrl of cssLinks) {
            const fullCssUrl = cssUrl.startsWith('http') ? cssUrl : new URL(cssUrl, url).href;
            console.log('Fetching CSS from:', fullCssUrl);
            const cssResponse = await fetch(fullCssUrl);
            const cssText = await cssResponse.text();
            const parsedCSS = css.parse(cssText);

            // Extract variable definitions
            parsedCSS.stylesheet.rules.forEach(rule => {
                if (rule.type === 'rule') {
                    rule.declarations.forEach(declaration => {
                        if (declaration.property.startsWith('--')) {
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

                            // Replace any variables in the color value
                            color = resolveCssVariables(color, variableDefinitions);

                            if (isValidColor(color)) {
                                colorList.add(color);
                            }
                        }
                    });
                }
            });
        }

        // Sort colors by luminance (lightest to darkest)
        const sortedColors = Array.from(colorList).sort((a, b) => {
            const rgbA = getRgbFromColor(a);
            const rgbB = getRgbFromColor(b);
            if (!rgbA || !rgbB) return 0; // If color isn't in rgb, don't sort
            const luminanceA = luminance(rgbA.r, rgbA.g, rgbA.b);
            const luminanceB = luminance(rgbB.r, rgbB.g, rgbB.b);
            return luminanceA - luminanceB; // Sort lightest to darkest
        });

        // Respond with the sorted colors
        console.log('Sorted colors:', sortedColors);
        res.status(200).json({ colors: sortedColors });
    } catch (error) {
        console.error('Error processing the URL:', error);
        res.status(500).json({ error: 'An error occurred while processing the URL' });
    }
}
