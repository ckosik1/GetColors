import type { NextApiRequest, NextApiResponse } from 'next';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

// Helper function to validate and normalize URLs
function normalizeUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.toString();
  } catch (e) {
    throw new Error('Invalid URL provided');
  }
}

// Helper function to extract colors from CSS text
function extractColorsFromCSS(cssText: string): string[] {
  const colorSet = new Set<string>();
  
  const patterns = {
    hex: /#([0-9a-fA-F]{3,8})\b/g,
    rgb: /rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)/g,
    rgba: /rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*[\d.]+\s*\)/g,
    hsl: /hsl\(\s*\d+\s*,\s*\d+%\s*,\s*\d+%\s*\)/g,
    hsla: /hsla\(\s*\d+\s*,\s*\d+%\s*,\s*\d+%\s*,\s*[\d.]+\s*\)/g,
    named: /\b(red|blue|green|yellow|purple|orange|black|white|gray|grey|pink|brown)\b/g
  };

  for (const [_, pattern] of Object.entries(patterns)) {
    const matches = cssText.match(pattern);
    if (matches) {
      matches.forEach(color => colorSet.add(color.toLowerCase()));
    }
  }

  return Array.from(colorSet);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Set CORS headers to allow requests from your Webflow site
  res.setHeader('Access-Control-Allow-Origin', '*'); // In production, replace * with your Webflow domain
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const normalizedUrl = normalizeUrl(url);

    const response = await fetch(normalizedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ColorExtractor/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const colors = new Set<string>();

    // Extract inline styles
    $('[style]').each((_, element) => {
      const styleAttr = $(element).attr('style');
      if (styleAttr) {
        const extractedColors = extractColorsFromCSS(styleAttr);
        extractedColors.forEach(color => colors.add(color));
      }
    });

    // Extract colors from style tags
    $('style').each((_, element) => {
      const styleContent = $(element).html();
      if (styleContent) {
        const extractedColors = extractColorsFromCSS(styleContent);
        extractedColors.forEach(color => colors.add(color));
      }
    });

    // Fetch and process external stylesheets
    const cssPromises = [];
    $('link[rel="stylesheet"]').each((_, element) => {
      const href = $(element).attr('href');
      if (href) {
        const cssUrl = href.startsWith('http') ? href : new URL(href, normalizedUrl).toString();
        cssPromises.push(
          fetch(cssUrl)
            .then(res => res.text())
            .then(cssText => {
              const extractedColors = extractColorsFromCSS(cssText);
              extractedColors.forEach(color => colors.add(color));
            })
            .catch(error => console.error(`Failed to fetch CSS from ${cssUrl}:`, error))
        );
      }
    });

    await Promise.all(cssPromises);

    return res.status(200).json({
      colors: Array.from(colors)
    });

  } catch (error: any) {
    console.error('Error processing request:', error);
    return res.status(500).json({
      error: 'Failed to process the request',
      message: error.message
    });
  }
}
