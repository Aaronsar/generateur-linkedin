export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { token, text, personId } = req.body;

  if (!token) {
    return res.status(400).json({ error: 'Token LinkedIn manquant' });
  }
  if (!text) {
    return res.status(400).json({ error: 'Texte du post manquant' });
  }

  try {
    // Step 1: Get person ID if not provided
    let authorId = personId;
    if (!authorId) {
      const profileRes = await fetch('https://api.linkedin.com/v2/userinfo', {
        headers: {
          'Authorization': `Bearer ${token}`,
        }
      });
      if (!profileRes.ok) {
        const err = await profileRes.text();
        return res.status(profileRes.status).json({
          error: `Erreur d'authentification LinkedIn. Vérifie ton token. (${profileRes.status})`
        });
      }
      const profileData = await profileRes.json();
      authorId = profileData.sub;
      if (!authorId) {
        return res.status(400).json({ error: 'Impossible de récupérer l\'ID du profil LinkedIn' });
      }
    }

    // Step 2: Publish the post
    const postPayload = {
      author: `urn:li:person:${authorId}`,
      commentary: text,
      visibility: 'PUBLIC',
      distribution: {
        feedDistribution: 'MAIN_FEED',
        targetEntities: [],
        thirdPartyDistributionChannels: []
      },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false
    };

    const publishRes = await fetch('https://api.linkedin.com/rest/posts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
        'LinkedIn-Version': '202402'
      },
      body: JSON.stringify(postPayload)
    });

    if (!publishRes.ok) {
      let errorMsg;
      try {
        const errData = await publishRes.json();
        errorMsg = errData.message || errData.error || JSON.stringify(errData);
      } catch {
        errorMsg = await publishRes.text();
      }
      return res.status(publishRes.status).json({
        error: `Erreur publication LinkedIn (${publishRes.status}): ${errorMsg}`
      });
    }

    // Get post ID from response header
    const postId = publishRes.headers.get('x-restli-id') || '';
    const postUrl = postId
      ? `https://www.linkedin.com/feed/update/${postId}/`
      : null;

    return res.status(200).json({
      success: true,
      postId,
      postUrl,
      personId: authorId
    });

  } catch (err) {
    return res.status(500).json({
      error: `Erreur serveur: ${err.message}`
    });
  }
}
