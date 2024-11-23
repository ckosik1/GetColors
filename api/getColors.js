import fetch from 'node-fetch';
import css from 'css';
import { JSDOM } from 'jsdom'; // Use jsdom to parse inline SVG and JS-based colors

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

        const isValidColor = (color) => {
            if (color === 'transparent' || color === 'inherit') return false;
            if (color.startsWith('rgba')) {
                const rgba = color.match(/rgba?\((\d+), (\d+), (\d+), (\d?\.?\d+)\)/);
                if (rgba && parseFloat(rgba[4]) < 0.99) return false;
            }
            return true;
        };

        const hexToRgb = (hex) => {
            let r = 0, g = 0, b = 0;
            if (hex.length === 4) {
                r = parseInt(hex[1] + hex[1], 16);
                g = parseInt(hex[2] + hex[2], 16);
                b = parseInt(hex[3] + hex[3], 16);
            } else if (hex.length === 7) {
                r = parseInt(hex[1] + hex[2], 16);
                g = parseInt(hex[3] + hex[4], 16);
                b = parseInt(hex[5] + hex[6], 16);
            }
            return { r, g, b };
        };

        const colorToRgb = (color) => {
            if (color.startsWith('#')) {
                return hexToRgb(color);
            } else if (color.startsWith('rgb')) {
                const rgba = color.match(/rgba?\((\d+), (\d+), (\d+)/);
                if (rgba) {
                    return { r: parseInt(rgba[1]), g: parseInt(rgba[2]), b: parseInt(rgba[3]) };
                }
            }
            return null;
        };

        const luminance = (r, g, b) => {
            const a = [r, g, b].map((x) => {
                x = x / 255;
                return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
            });
            return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
        };

        const resolveCssVariables = (color, variables) => {
            return color.replace(/var\((--[a-zA-Z0-9_-]+)\)/g, (match, variableName) => {
                return variables[variableName] || match;
            });
        };

        const extractColors = (parsedCSS) => {
            parsedCSS.stylesheet.rules.forEach(rule => {
                if (rule.type === 'rule' || rule.type === 'media') {
                    rule.declarations?.forEach(declaration => {
                        if (declaration.property.startsWith('--')) {
                            variableDefinitions[declaration.property] = declaration.value;
                        } else if (declaration.property === 'color' || declaration.property === 'background-color') {
                            let color = resolveCssVariables(declaration.value, variableDefinitions);
                            if (isValidColor(color)) {
                                colorList.add(color);
                            }
                        }
                    });
                }
            });
        };

        // Fetch and parse each CSS file
        for (const cssUrl of cssLinks) {
            const fullCssUrl = cssUrl.startsWith('http') ? cssUrl : new URL(cssUrl, url).href;
            const cssResponse = await fetch(fullCssUrl);
            const cssText = await cssResponse.text();
            const parsedCSS = css.parse(cssText);
            extractColors(parsedCSS);
        }

        // Parse inline CSS in <style> tags
        for (const inlineCss of inlineStyles) {
            const parsedCSS = css.parse(inlineCss);
            extractColors(parsedCSS);
        }

        // Process inline SVG and styles using JSDOM
        const dom = new JSDOM(html);
        const svgElements = dom.window.document.querySelectorAll('svg *');
        svgElements.forEach((el) => {
            const fillColor = el.getAttribute('fill');
            const strokeColor = el.getAttribute('stroke');
            if (fillColor && isValidColor(fillColor)) colorList.add(fillColor);
            if (strokeColor && isValidColor(strokeColor)) colorList.add(strokeColor);
        });

        // Sort colors by luminance
        const sortedColors = Array.from(colorList).sort((a, b) => {
            const rgbA = colorToRgb(a);
            const rgbB = colorToRgb(b);
            if (!rgbA || !rgbB) return 0;
            const luminanceA = luminance(rgbA.r, rgbA.g, rgbA.b);
            const luminanceB = luminance(rgbB.r, rgbB.g, rgbB.b);
            return luminanceA - luminanceB;
        });

        res.status(200).json({ colors: sortedColors });
    } catch (error) {
        res.status(500).json({ error: 'An error occurred while processing the URL' });
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
