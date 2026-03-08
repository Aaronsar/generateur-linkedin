export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { wpUrl, endpoint } = req.query;

  if (!wpUrl || !endpoint) {
    return res.status(400).json({ error: 'Missing wpUrl or endpoint parameter' });
  }

  // Validate wpUrl to prevent SSRF
  try {
    const parsed = new URL(wpUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return res.status(400).json({ error: 'Invalid URL protocol' });
    }
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  const targetUrl = `${wpUrl.replace(/\/+$/, '')}${endpoint}`;

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'LinkedIn-Generator/1.0',
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({
        error: `WordPress API error: ${response.status} ${response.statusText}`
      });
    }

    const data = await response.json();

    // Forward pagination headers
    const total = response.headers.get('X-WP-Total');
    const totalPages = response.headers.get('X-WP-TotalPages');
    if (total) res.setHeader('X-WP-Total', total);
    if (totalPages) res.setHeader('X-WP-TotalPages', totalPages);

    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({
      error: `Erreur de connexion WordPress: ${err.message}`
    });
  }
}
