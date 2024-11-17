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

        // Extract CSS links and inline styles
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

