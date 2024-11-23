// corsMiddleware.js

export default function cors(req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*'); // Adjust origin as needed https://alterkit.webflow.io
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(200).end(); // Preflight request
        return;
    }

    next();
}
