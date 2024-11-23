import fetch from 'node-fetch';
import css from 'css';
import { parse as parseColor } from 'color-parse';

export default async function handler(req, res) {
    // CORS headers
    const allowedOrigins = ['https://alterkit.webflow.io', 'http://localhost:3000'];
    const origin = req.headers.origin;
    
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }

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
        const colors = await extractColorsFromUrl(url);
        res.status(200).json({ colors });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'An error occurred while processing the URL' });
    }
}

async function extractColorsFromUrl(url) {
    const response = await fetch(url);
    const html = await response.text();
    
    // Extract all CSS sources
    const cssLinks = [...html.matchAll(/<link[^>]*?href="([^"]*?\.css)[^"]*"/g)]
        .map(match => match[1]);
    const inlineStyles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
        .map(match => match[1]);
    
    const colors = new Map(); // Using Map to store color info objects
    const cssVariables = new Map();

    // Process inline styles first
    for (const inlineStyle of inlineStyles) {
        try {
            const parsedCSS = css.parse(inlineStyle);
            extractColorsFromRules(parsedCSS.stylesheet.rules, colors, cssVariables, url);
        } catch (error) {
            console.error('Error parsing inline CSS:', error);
        }
    }

    // Process external stylesheets
    for (const cssLink of cssLinks) {
        try {
            const fullUrl = new URL(cssLink, url).href;
            const cssResponse = await fetch(fullUrl);
            const cssText = await cssResponse.text();
            const parsedCSS = css.parse(cssText);
            extractColorsFromRules(parsedCSS.stylesheet.rules, colors, cssVariables, url);
        } catch (error) {
            console.error(`Error processing CSS file ${cssLink}:`, error);
        }
    }

    // Convert colors to array and sort by luminance
    return Array.from(colors.values())
        .sort((a, b) => b.luminance - a.luminance)
        .map(colorInfo => ({
            hex: colorInfo.hex,
            rgb: colorInfo.rgb,
            hsb: colorInfo.hsb
        }));
}

function extractColorsFromRules(rules, colors, cssVariables, baseUrl) {
    for (const rule of rules) {
        if (rule.type === 'comment') continue;

        if (rule.type === 'rule' && rule.declarations) {
            for (const declaration of rule.declarations) {
                if (!declaration.value) continue;

                // Store CSS variables
                if (declaration.property?.startsWith('--')) {
                    cssVariables.set(declaration.property, declaration.value);
                    continue;
                }

                // Only process color-related properties
                if (!isColorProperty(declaration.property)) continue;

                const value = resolveVariables(declaration.value, cssVariables);
                const colorInfo = parseColorValue(value);
                
                if (colorInfo) {
                    colors.set(colorInfo.hex, colorInfo);
                }
            }
        }

        // Handle nested rules (media queries, keyframes, etc.)
        if (rule.rules) {
            extractColorsFromRules(rule.rules, colors, cssVariables, baseUrl);
        }
    }
}

function isColorProperty(property) {
    return /color$|^background(-color)?$|^border(-\w+)*-color$|^outline-color$/.test(property);
}

function resolveVariables(value, variables) {
    return value.replace(/var\((--[^,)]+)(,[^)]+)?\)/g, (_, name) => {
        return variables.get(name) || '';
    });
}

function parseColorValue(value) {
    try {
        // Skip invalid or transparent colors
        if (!value || value === 'transparent' || value === 'inherit' || 
            value === 'currentColor' || value === 'initial') {
            return null;
        }

        const parsed = parseColor(value);
        
        // Skip if invalid or transparent
        if (!parsed || !parsed.values || parsed.alpha < 0.99) {
            return null;
        }

        // Convert to different formats
        const [r, g, b] = parsed.values;
        const hex = rgbToHex(r, g, b);
        const hsb = rgbToHsb(r, g, b);
        const luminance = calculateLuminance(r, g, b);

        return {
            hex,
            rgb: `rgb(${r}, ${g}, ${b})`,
            hsb: `hsb(${hsb.h}°, ${hsb.s}%, ${hsb.b}%)`,
            luminance
        };
    } catch (error) {
        return null;
    }
}

function rgbToHex(r, g, b) {
    const toHex = (n) => n.toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function rgbToHsb(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;

    let h = 0;
    let s = max === 0 ? 0 : delta / max;
    let v = max;

    if (delta !== 0) {
        if (max === r) {
            h = ((g - b) / delta) % 6;
        } else if (max === g) {
            h = (b - r) / delta + 2;
        } else {
            h = (r - g) / delta + 4;
        }

        h = Math.round(h * 60);
        if (h < 0) h += 360;
    }

    return {
        h: Math.round(h),
        s: Math.round(s * 100),
        b: Math.round(v * 100)
    };
}

function calculateLuminance(r, g, b) {
    const [rs, gs, bs] = [r, g, b].map(c => {
        c = c / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
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
