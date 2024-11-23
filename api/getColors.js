import fetch from 'node-fetch';
import css from 'css';
import { AbortController } from 'node-abort-controller';
import ntc from './ntc'; // Import the ntc object from ntc.js

// Cache for storing processed URLs
const cache = new Map();
const CACHE_DURATION = 3600000; // 1 hour in milliseconds

// Utility function to validate URLs
const isValidUrl = (string) => {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
};

// Fetch with timeout implementation
const fetchWithTimeout = async (url, options = {}) => {
    const timeout = 5000; // 5 seconds
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        throw error;
    }
};

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', 'https://alterkit.webflow.io');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // Validate request method
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method Not Allowed' });
        return;
    }

    const { url } = req.body;

    // Validate URL presence and format
    if (!url) {
        res.status(400).json({ error: 'URL is required' });
        return;
    }

    if (!isValidUrl(url)) {
        res.status(400).json({ error: 'Invalid URL format' });
        return;
    }

    // Check cache
    if (cache.has(url)) {
        const cachedData = cache.get(url);
        if (Date.now() - cachedData.timestamp < CACHE_DURATION) {
            res.status(200).json(cachedData.data);
            return;
        } else {
            cache.delete(url);
        }
    }

    try {
        const response = await fetchWithTimeout(url);
        const html = await response.text();

        const cssLinks = [...html.matchAll(/<link.*?href="(.*?\.css)"/g)].map(match => match[1]);
        const inlineStyles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(match => match[1]);

        let colorList = new Set();
        let variableDefinitions = {};

        const resolveCssVariables = (color, variables) => {
            let resolvedColor = color;
            let iterations = 0;
            const maxIterations = 10; // Prevent infinite loops with circular references
            
            while (resolvedColor.includes('var(') && iterations < maxIterations) {
                resolvedColor = resolvedColor.replace(/var\((--[a-zA-Z0-9_-]+)\)/g, (match, variableName) => {
                    return variables[variableName] || match;
                });
                iterations++;
            }
            return resolvedColor;
        };

        const isValidColor = (color) => {
            return color && 
                   color !== 'transparent' && 
                   color !== 'inherit' && 
                   color !== 'currentColor' &&
                   !color.includes('url') &&
                   !color.includes('gradient') &&
                   (color.startsWith('#') || 
                    color.startsWith('rgb') || 
                    color.startsWith('hsl'));
        };

        // Helper functions to convert colors
        const hexToRgb = (hex) => {
            // Handle shorthand hex (#FFF)
            if (hex.length === 4) {
                hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
            }
            
            const bigint = parseInt(hex.slice(1), 16);
            const r = (bigint >> 16) & 255;
            const g = (bigint >> 8) & 255;
            const b = bigint & 255;
            return `rgb(${r}, ${g}, ${b})`;
        };

        const rgbToHsb = (r, g, b) => {
            r = r / 255;
            g = g / 255;
            b = b / 255;
            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            let h, s, v = max;

            const d = max - min;
            s = max === 0 ? 0 : d / max;

            if (max === min) {
                h = 0; // achromatic
            } else {
                switch (max) {
                    case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                    case g: h = (b - r) / d + 2; break;
                    case b: h = (r - g) / d + 4; break;
                }
                h /= 6;
            }

            return [Math.round(h * 360), Math.round(s * 100), Math.round(v * 100)];
        };

        // Process CSS files
        for (const cssLink of cssLinks) {
            const cssResponse = await fetchWithTimeout(cssLink);
            const cssText = await cssResponse.text();
            const parsedCss = css.parse(cssText);

            parsedCss.stylesheet.rules.forEach(rule => {
                if (rule.declarations) {
                    rule.declarations.forEach(declaration => {
                        if (declaration.property && declaration.value) {
                            const color = resolveCssVariables(declaration.value, variableDefinitions);
                            if (isValidColor(color)) {
                                colorList.add(color);
                            }
                        }
                    });
                }
            });
        }

        // Process inline styles
        inlineStyles.forEach(style => {
            const parsedCss = css.parse(style);
            parsedCss.stylesheet.rules.forEach(rule => {
                if (rule.declarations) {
                    rule.declarations.forEach(declaration => {
                        if (declaration.property && declaration.value) {
                            const color = resolveCssVariables(declaration.value, variableDefinitions);
                            if (isValidColor(color)) {
                                colorList.add(color);
                            }
                        }
                    });
                }
            });
        });

        // Convert color list to an array and map to include names
        const colorsWithFormats = Array.from(colorList).map(color => {
            try {
                let rgbValue, hsbValue;

                if (color.startsWith('#')) {
                    rgbValue = hexToRgb(color);
                    const [r, g, b] = rgbValue.match(/\d+/g).map(Number);
                    hsbValue = rgbToHsb(r, g, b);
                } else if (color.startsWith('rgb')) {
                    rgbValue = color;
                    const [r, g, b] = color.match(/\d+/g).map(Number);
                    hsbValue = rgbToHsb(r, g, b);
                    color = hexToRgb(rgbValue); // Convert to hex for color naming
                } else {
                    return null;
                }

                // Get the color name using ntc
                const colorName = ntc.name(color)[1];

                return {
                    hex: color.startsWith('#') ? color : hexToRgb(color),
                    rgb: rgbValue,
                    hsb: hsbValue,
                    name: colorName // Add the color name to the response
                };
            } catch (error) {
                console.error('Error processing color:', color, error);
                return null;
            }
        }).filter(Boolean);

        // Cache the result
        cache.set(url, { timestamp: Date.now(), data: colorsWithFormats });

        // Send response
        res.status(200).json(colorsWithFormats);
    } catch (error) {
        console.error('Error fetching or processing URL:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
}

/*
import fetch from 'node-fetch';
import css from 'css';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', 'https://alterkit.webflow.io');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method Not Allowed' });
        return;
    }

    const { url } = req.body;
    if (!url) {
        res.status(400).json({ error: 'URL is required' });
        return;
    }

    try {
        const response = await fetch(url);
        const html = await response.text();

        const cssLinks = [...html.matchAll(/<link.*?href="(.*?\.css)"/g)].map(match => match[1]);
        const inlineStyles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(match => match[1]);

        let colorList = new Set();
        let variableDefinitions = {};

        const resolveCssVariables = (color, variables) => {
            let resolvedColor = color;
            while (resolvedColor.includes('var(')) {
                resolvedColor = resolvedColor.replace(/var\((--[a-zA-Z0-9_-]+)\)/g, (match, variableName) => {
                    return variables[variableName] || match;
                });
            }
            return resolvedColor;
        };

        const isValidColor = (color) => {
            return color && color !== 'transparent' && color !== 'inherit' && !color.includes('url');
        };

        const extractColors = (parsedCSS) => {
            parsedCSS.stylesheet.rules.forEach(rule => {
                if (rule.type === 'rule') {
                    // Check if it's a :root rule for CSS variables
                    if (rule.selectors && rule.selectors.includes(':root')) {
                        rule.declarations.forEach(declaration => {
                            if (declaration.property.startsWith('--')) {
                                variableDefinitions[declaration.property] = declaration.value;
                            }
                        });
                    } else {
                        rule.declarations?.forEach(declaration => {
                            if (declaration.property === 'color' || declaration.property === 'background-color') {
                                let color = resolveCssVariables(declaration.value, variableDefinitions);
                                if (isValidColor(color)) {
                                    colorList.add(color);
                                }
                            }
                        });
                    }
                } else if (rule.type === 'media') {
                    rule.rules.forEach(innerRule => {
                        innerRule.declarations?.forEach(declaration => {
                            if (declaration.property === 'color' || declaration.property === 'background-color') {
                                let color = resolveCssVariables(declaration.value, variableDefinitions);
                                if (isValidColor(color)) {
                                    colorList.add(color);
                                }
                            }
                        });
                    });
                }
            });
        };

        for (const cssUrl of cssLinks) {
            const fullCssUrl = cssUrl.startsWith('http') ? cssUrl : new URL(cssUrl, url).href;
            try {
                const cssResponse = await fetch(fullCssUrl);
                const cssText = await cssResponse.text();
                const parsedCSS = css.parse(cssText);
                extractColors(parsedCSS);
            } catch (error) {
                console.error(`Failed to fetch CSS from ${fullCssUrl}:`, error);
            }
        }

        for (const inlineCss of inlineStyles) {
            const parsedCSS = css.parse(inlineCss);
            extractColors(parsedCSS);
        }

        const sortedColors = Array.from(colorList).sort();

        res.status(200).json({ colors: sortedColors });
    } catch (error) {
        console.error("Error processing the URL:", error);
        res.status(500).json({ error: 'An error occurred while processing the URL' });
    }
}
*/
