import fetch from 'node-fetch';
import css from 'css';
import { AbortController } from 'node-abort-controller';

const cache = new Map();
const CACHE_DURATION = 3600000;

const ntc = {
    init: function() {
        var color, rgb, hsl;
        for(var i = 0; i < ntc.names.length; i++) {
            color = "#" + ntc.names[i][0];
            rgb = ntc.rgb(color);
            hsl = ntc.hsl(color);
            ntc.names[i].push(rgb[0], rgb[1], rgb[2], hsl[0], hsl[1], hsl[2]);
        }
    },

    name: function(color) {
        color = color.toUpperCase();
        if(color.length < 3 || color.length > 7)
            return ["#000000", "Invalid Color: " + color, false];
        if(color.length % 3 == 0)
            color = "#" + color;
        if(color.length == 4)
            color = "#" + color.substr(1, 1) + color.substr(1, 1) + color.substr(2, 1) + color.substr(2, 1) + color.substr(3, 1) + color.substr(3, 1);

        var rgb = ntc.rgb(color);
        var r = rgb[0], g = rgb[1], b = rgb[2];
        var hsl = ntc.hsl(color);
        var h = hsl[0], s = hsl[1], l = hsl[2];
        var ndf1 = 0; ndf2 = 0; ndf = 0;
        var cl = -1, df = -1;

        for(var i = 0; i < ntc.names.length; i++) {
            if(color == "#" + ntc.names[i][0])
                return ["#" + ntc.names[i][0], ntc.names[i][1], true];

            ndf1 = Math.pow(r - ntc.names[i][2], 2) + Math.pow(g - ntc.names[i][3], 2) + Math.pow(b - ntc.names[i][4], 2);
            ndf2 = Math.pow(h - ntc.names[i][5], 2) + Math.pow(s - ntc.names[i][6], 2) + Math.pow(l - ntc.names[i][7], 2);
            ndf = ndf1 + ndf2 * 2;
            if(df < 0 || df > ndf) {
                df = ndf;
                cl = i;
            }
        }

        return (cl < 0 ? ["#000000", "Invalid Color: " + color, false] : ["#" + ntc.names[cl][0], ntc.names[cl][1], false]);
    },

    hsl: function (color) {
        var rgb = [parseInt('0x' + color.substring(1, 3)) / 255, parseInt('0x' + color.substring(3, 5)) / 255, parseInt('0x' + color.substring(5, 7)) / 255];
        var min, max, delta, h, s, l;
        var r = rgb[0], g = rgb[1], b = rgb[2];

        min = Math.min(r, Math.min(g, b));
        max = Math.max(r, Math.max(g, b));
        delta = max - min;
        l = (min + max) / 2;

        s = 0;
        if(l > 0 && l < 1)
            s = delta / (l < 0.5 ? (2 * l) : (2 - 2 * l));

        h = 0;
        if(delta > 0) {
            if (max == r && max != g) h += (g - b) / delta;
            if (max == g && max != b) h += (2 + (b - r) / delta);
            if (max == b && max != r) h += (4 + (r - g) / delta);
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
        ["0000C8", "Dark Blue"],
        ["0000FF", "Blue"],
        ["000741", "Stratos"],
        ["001B1C", "Swamp"],
        ["002387", "Resolution Blue"],
        ["002900", "Deep Fir"],
        ["002E20", "Burnham"],
        ["002FA7", "International Klein Blue"],
        ["003153", "Prussian Blue"],
        ["003366", "Midnight Blue"],
        ["003399", "Smalt"],
        ["003532", "Deep Teal"],
        ["003E40", "Cyprus"],
        ["004620", "Kaitoke Green"],
        ["0047AB", "Cobalt"],
        ["4B0082", "Indigo"],
        ["800000", "Maroon"],
        ["800080", "Purple"],
        ["808000", "Olive"],
        ["808080", "Gray"],
        ["C0C0C0", "Silver"],
        ["FF0000", "Red"],
        ["FF00FF", "Magenta"],
        ["FF4500", "Orange Red"],
        ["FF6347", "Tomato"],
        ["FF69B4", "Hot Pink"],
        ["FF8C00", "Dark Orange"],
        ["FFA500", "Orange"],
        ["FFD700", "Gold"],
        ["FFFF00", "Yellow"],
        ["FFFFFF", "White"]
    ]
};

// Initialize ntc
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
    // Extract numbers from rgb string
    const [r, g, b] = rgb.match(/\d+/g).map(Number);
    // Convert to hex
    const toHex = (n) => {
        const hex = n.toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    };
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

const hexToRgb = (hex) => {
    // Remove # if present
    hex = hex.replace('#', '');
    
    // Handle shorthand hex
    if (hex.length === 3) {
        hex = hex.split('').map(char => char + char).join('');
    }
    
    const bigint = parseInt(hex, 16);
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
    const delta = max - min;
    
    let h, s, v = max;

    s = max === 0 ? 0 : delta / max;

    if (max === min) {
        h = 0;
    } else {
        switch (max) {
            case r: h = (g - b) / delta + (g < b ? 6 : 0); break;
            case g: h = (b - r) / delta + 2; break;
            case b: h = (r - g) / delta + 4; break;
        }
        h /= 6;
    }

    return `hsb(${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(v * 100)}%)`;
};

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

    if (!isValidUrl(url)) {
        res.status(400).json({ error: 'Invalid URL format' });
        return;
    }

    if (cache.has(url)) {
        const cachedData = cache.get(url);
        if (Date.now() - cachedData.timestamp < CACHE_DURATION) {
            res.status(200).json(cachedData.data);
            return;
        }
        cache.delete(url);
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
            const maxIterations = 10;
            
            while (resolvedColor.includes('var(') && iterations < maxIterations) {
                resolvedColor = resolvedColor.replace(/var\((--[a-zA-Z0-9_-]+)\)/g, (match, variableName) => {
                    return variables[variableName] || match;
                });
                iterations++;
            }
            return resolvedColor;
        };

        const isValidColor = (color) => {
            if (!color) return false;
            
            const normalizedColor = color.toLowerCase().trim();
            
            if (['transparent', 'inherit', 'currentcolor', 'initial', 'unset'].includes(normalizedColor)) {
                return false;
            }
            
            if (normalizedColor.includes('url') || 
                normalizedColor.includes('gradient') || 
                normalizedColor.includes('var(')) {
                return false;
            }
            
            return normalizedColor.startsWith('#') || 
                   normalizedColor.startsWith('rgb(') || 
                   normalizedColor.startsWith('rgba(');
        };

        const extractColors = (parsedCSS) => {
            try {
                parsedCSS.stylesheet.rules.forEach(rule => {
                    if (rule.type === 'rule') {
                        if (rule.selectors && rule.selectors.includes(':root')) {
                            rule.declarations?.forEach(declaration => {
                                if (declaration.property?.startsWith('--')) {
                                    variableDefinitions[declaration.property] = declaration.value;
                                }
                            });
                        } else {
                            rule.declarations?.forEach(declaration => {
                                if (['color', 'background-color', 'border-color'].includes(declaration.property)) {
                                    let color = resolveCssVariables(declaration.value, variableDefinitions);
                                    if (isValidColor(color)) {
                                        if (color.startsWith('rgb')) {
                                            color = rgbToHex(color);
                                        }
                                        colorList.add(color);
                                    }
                                }
                            });
                        }
                    }
                });
            } catch (error) {
                console.error('Error parsing CSS rules:', error);
            }
        };

        const cssPromises = cssLinks.map(async cssUrl => {
            const fullCssUrl = cssUrl.startsWith('http') ? cssUrl : new URL(cssUrl, url).href;
            try {
                const cssResponse = await fetchWithTimeout(fullCssUrl);
                const cssText = await cssResponse.text();
                const parsedCSS = css.parse(cssText);
                extractColors(parsedCSS);
            } catch (error) {
                console.error(`Failed to fetch CSS from ${fullCssUrl}:`, error);
            }
        });

        await Promise.all(cssPromises);

        for (const inlineCss of inlineStyles) {
            try {
                const parsedCSS = css.parse(inlineCss);
                extractColors(parsedCSS);
            } catch (error) {
                console.error('Failed to parse inline CSS:', error);
            }
        }

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
                    color = rgbToHex(color);
                } else {
                    return null;
                }

                // Get the color name using ntc
                const colorName = ntc.name(color)[1];

                return {
                    hex: color.startsWith('#') ? color : rgbToHex(color),
                    rgb: rgbValue,
                    hsb: hsbValue,
                    name: colorName
                };
            } catch (error) {
                console.error('Error processing color:', color, error);
                return null;
            }
        }).filter(Boolean);

        const result = { colors: colorsWithFormats };
        
        cache.set(url, {
            timestamp: Date.now(),
            data: result
        });

        res.status(200).json(result);
    } catch (error) {
        console.error("Error processing the URL:", error);
        res.status(500).json({ 
            error: 'An error occurred while processing the URL',
            message: error.message 
        });
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
