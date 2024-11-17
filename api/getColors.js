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
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

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

    // Enhanced headers to bypass some security restrictions
    const response = await fetch(normalizedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1'
      },
      redirect: 'follow',
      follow: 5, // Follow up to 5 redirects
      timeout: 10000, // 10 second timeout
    });

    if (!response.ok) {
      // If the site is protected by Cloudflare or similar service
      if (response.status === 403 || response.status === 401) {
        return res.status(400).json({
          error: 'This website is protected and cannot be accessed directly',
          message: 'Try a different website or contact the website administrator'
        });
      }
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

    // Modified CSS file fetching to handle protected resources
    const cssPromises = [];
    $('link[rel="stylesheet"]').each((_, element) => {
      const href = $(element).attr('href');
      if (href) {
        try {
          const cssUrl = href.startsWith('http') ? href : new URL(href, normalizedUrl).toString();
          cssPromises.push(
            fetch(cssUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/css,*/*;q=0.1',
                'Accept-Language': 'en-US,en;q=0.9',
              },
              timeout: 5000
            })
              .then(res => res.text())
              .then(cssText => {
                const extractedColors = extractColorsFromCSS(cssText);
                extractedColors.forEach(color => colors.add(color));
              })
              .catch(error => {
                console.warn(`Failed to fetch CSS from ${cssUrl}:`, error.message);
                return null; // Continue with other CSS files
              })
          );
        } catch (e) {
          console.warn(`Invalid CSS URL: ${href}`);
        }
      }
    });

    // Wait for all CSS files to be processed or timeout
    await Promise.allSettled(cssPromises);

    if (colors.size === 0) {
      return res.status(200).json({
        colors: [],
        message: 'No colors found or website is protected'
      });
    }

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
