import fetch from 'node-fetch';
import css from 'css';
import { AbortController } from 'node-abort-controller';

const cache = new Map();
const CACHE_DURATION = 3600000;

const ntc = {
    init: function() {
        let color, rgb, hsl;
        for(let i = 0; i < ntc.names.length; i++) {
            color = "#" + ntc.names[i][0];
            rgb = ntc.rgb(color);
            hsl = ntc.hsl(color);
            ntc.names[i].push(rgb[0], rgb[1], rgb[2], hsl[0], hsl[1], hsl[2]);
        }
    },

    name: function(color) {
        color = color.toUpperCase();
        if(color.length < 3 || color.length > 7) return ["#000000", "Invalid Color: " + color, false];
        if(color.length % 3 == 0) color = "#" + color;
        if(color.length === 4) color = "#" + color[1] + color[1] + color[2] + color[2] + color[3] + color[3];

        const rgb = ntc.rgb(color);
        const hsl = ntc.hsl(color);
        let df = -1, cl = -1;

        for(let i = 0; i < ntc.names.length; i++) {
            if(color === "#" + ntc.names[i][0]) return ["#" + ntc.names[i][0], ntc.names[i][1], true];

            const ndf1 = Math.pow(rgb[0] - ntc.names[i][2], 2) + Math.pow(rgb[1] - ntc.names[i][3], 2) + Math.pow(rgb[2] - ntc.names[i][4], 2);
            const ndf2 = Math.pow(hsl[0] - ntc.names[i][5], 2) + Math.pow(hsl[1] - ntc.names[i][6], 2) + Math.pow(hsl[2] - ntc.names[i][7], 2);
            const ndf = ndf1 + ndf2 * 2;

            if(df < 0 || df > ndf) {
                df = ndf;
                cl = i;
            }
        }
        return cl < 0 ? ["#000000", "Invalid Color: " + color, false] : ["#" + ntc.names[cl][0], ntc.names[cl][1], false];
    },

    hsl: function(color) {
        const rgb = [parseInt('0x' + color.substring(1, 3)) / 255, parseInt('0x' + color.substring(3, 5)) / 255, parseInt('0x' + color.substring(5, 7)) / 255];
        const [r, g, b] = rgb;
        const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
        const l = (min + max) / 2;
        const s = l > 0 && l < 1 ? delta / (l < 0.5 ? (2 * l) : (2 - 2 * l)) : 0;
        let h = 0;

        if(delta > 0) {
            if (max === r && max !== g) h += (g - b) / delta;
            if (max === g && max !== b) h += (2 + (b - r) / delta);
            if (max === b && max !== r) h += (4 + (r - g) / delta);
            h /= 6;
        }
        return [parseInt(h * 255), parseInt(s * 255), parseInt(l * 255)];
    },

    rgb: function(color) {
        return [parseInt('0x' + color.substring(1, 3)), parseInt('0x' + color.substring(3, 5)), parseInt('0x' + color.substring(5, 7))];
    },

    names: [
        ["000000", "Black"],
        ["000080", "Navy Blue"],
        // Add additional color codes as needed
        ["FFFFFF", "White"]
    ]
};

ntc.init();

const isValidUrl = (string) => {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
};

const fetchWithTimeout = async (url, options = {}) => {
    const timeout = 5000;
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

const rgbToHex = (rgb) => {
    const [r, g, b] = rgb.match(/\d+/g).map(Number);
    const toHex = (n) => n.toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

const hexToRgb = (hex) => {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(char => char + char).join('');
    const bigint = parseInt(hex, 16);
    const r = (bigint >> 16) & 255, g = (bigint >> 8) & 255, b = bigint & 255;
    return `rgb(${r}, ${g}, ${b})`;
};

const rgbToHsb = (r, g, b) => {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
    const v = max, s = max === 0 ? 0 : delta / max;
    let h = 0;

    if (max !== min) {
        h = max === r ? (g - b) / delta + (g < b ? 6 : 0) :
            max === g ? (b - r) / delta + 2 :
            (r - g) / delta + 4;
        h /= 6;
    }
    return `hsb(${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(v * 100)}%)`;
};

const resolveCssVariables = (color, variables) => {
    let resolvedColor = color, iterations = 0, maxIterations = 10;
    while (resolvedColor.includes('var(') && iterations < maxIterations) {
        resolvedColor = resolvedColor.replace(/var\((--[a-zA-Z0-9_-]+)\)/g, (_, variableName) => {
            return variables[variableName] || _;
        });
        iterations++;
    }
    return resolvedColor;
};

const isValidColor = (color) => {
    if (!color) return false;
    const normalizedColor = color.toLowerCase().trim();
    return !['transparent', 'inherit', 'currentcolor', 'initial', 'unset'].includes(normalizedColor) &&
           !normalizedColor.includes('url') && !normalizedColor.includes('gradient') && 
           (normalizedColor.startsWith('#') || normalizedColor.startsWith('rgb'));
};

const extractColors = (parsedCSS, colorList, variableDefinitions) => {
    parsedCSS.stylesheet.rules.forEach(rule => {
        if (rule.type === 'rule') {
            if (rule.selectors?.includes(':root')) {
                rule.declarations.forEach(declaration => {
                    if (declaration.property?.startsWith('--')) variableDefinitions[declaration.property] = declaration.value;
                });
            } else {
                rule.declarations.forEach(declaration => {
                    if (['color', 'background-color', 'border-color'].includes(declaration.property)) {
                        let color = resolveCssVariables(declaration.value, variableDefinitions);
                        if (isValidColor(color)) {
                            if (color.startsWith('rgb')) color = rgbToHex(color);
                            colorList.add(color);
                        }
                    }
                });
            }
        }
    });
};

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', 'https://alterkit.webflow.io');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const { url } = req.body;
    if (!url || !isValidUrl(url)) return res.status(400).json({ error: 'Invalid URL format' });

    if (cache.has(url)) {
        const cachedData = cache.get(url);
        if (Date.now() - cachedData.timestamp < CACHE_DURATION) return res.status(200).json(cachedData.data);
        cache.delete(url);
    }

    try {
        const response = await fetchWithTimeout(url);
        const html = await response.text();
        const cssLinks = Array.from(html.matchAll(/<link[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi), match => match[1]);
        const allColors = new Set();
        const variableDefinitions = {};

        for (const cssLink of cssLinks) {
            if (!cssLink.startsWith('http')) continue;

            const cssResponse = await fetchWithTimeout(cssLink);
            const cssText = await cssResponse.text();
            const parsedCSS = css.parse(cssText);

            extractColors(parsedCSS, allColors, variableDefinitions);
        }

        const colorNames = Array.from(allColors).map(color => {
            const hexColor = color.startsWith('#') ? color : rgbToHex(color);
            const hsbColor = rgbToHsb(...ntc.rgb(hexColor));
            const colorName = ntc.name(hexColor)[1];
            return { hex: hexColor, rgb: hexToRgb(hexColor), hsb: hsbColor, name: colorName };
        });

        cache.set(url, { data: colorNames, timestamp: Date.now() });
        res.status(200).json(colorNames);

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error processing the URL' });
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
