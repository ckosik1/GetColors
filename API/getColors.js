// api/getColors.js

import fetch from 'node-fetch'; // Vercel's Node environment has this package built-in
import css from 'css';

export default async function handler(req, res) {
    // Ensure the request is a POST and get the URL from the body
    if (req.method !== 'POST') return res.status(405).end();
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    try {
        // Fetch HTML content from the URL
        const response = await fetch(url);
        const html = await response.text();

        // Parse CSS files
        const cssLinks = [...html.matchAll(/<link.*?href="(.*?\.css)"/g)].map(match => match[1]);

        let colorList = new Set(); // Use a Set to avoid duplicate colors

        for (const cssUrl of cssLinks) {
            const cssResponse = await fetch(cssUrl.startsWith('http') ? cssUrl : `${url}${cssUrl}`);
            const cssText = await cssResponse.text();

            // Parse CSS to find color properties
            const parsedCSS = css.parse(cssText);
            parsedCSS.stylesheet.rules.forEach(rule => {
                if (rule.declarations) {
                    rule.declarations.forEach(declaration => {
                        if (['color', 'background-color', 'border-color'].includes(declaration.property)) {
                            colorList.add(declaration.value); // Add each color to the set
                        }
                    });
                }
            });
        }

        // Convert Set to Array for JSON response
        res.status(200).json({ colors: Array.from(colorList) });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch or process CSS' });
    }
}
