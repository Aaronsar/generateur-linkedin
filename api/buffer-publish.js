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

  const { apiKey, action, channelId, text, mode, dueAt, organizationId } = req.body;

  if (!apiKey) {
    return res.status(400).json({ error: 'Clé API Buffer manquante' });
  }

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`
  };

  try {
    // ── ACTION: get-channels ─────────────────────────────────────
    if (action === 'get-channels') {
      // Step 1: Get organizations
      const orgQuery = `query { account { organizations { id } } }`;
      const orgRes = await fetch('https://api.buffer.com', {
        method: 'POST',
        headers,
        body: JSON.stringify({ query: orgQuery })
      });

      if (!orgRes.ok) {
        const errText = await orgRes.text();
        return res.status(orgRes.status).json({
          error: `Erreur Buffer (${orgRes.status}): ${errText}`
        });
      }

      const orgData = await orgRes.json();
      if (orgData.errors) {
        return res.status(400).json({
          error: `Erreur Buffer: ${orgData.errors.map(e => e.message).join(', ')}`
        });
      }

      const orgs = orgData.data?.account?.organizations || [];
      if (orgs.length === 0) {
        return res.status(400).json({ error: 'Aucune organisation trouvée dans Buffer' });
      }

      // Step 2: Get channels for each org (use first org, or provided orgId)
      const orgId = organizationId || orgs[0].id;
      const chQuery = `query GetChannels($input: ChannelsInput!) {
        channels(input: $input) {
          id
          name
          displayName
          service
          type
          avatar
          isDisconnected
          isLocked
        }
      }`;

      const chRes = await fetch('https://api.buffer.com', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          query: chQuery,
          variables: { input: { organizationId: orgId } }
        })
      });

      if (!chRes.ok) {
        const errText = await chRes.text();
        return res.status(chRes.status).json({
          error: `Erreur channels Buffer (${chRes.status}): ${errText}`
        });
      }

      const chData = await chRes.json();
      if (chData.errors) {
        return res.status(400).json({
          error: `Erreur channels: ${chData.errors.map(e => e.message).join(', ')}`
        });
      }

      const channels = chData.data?.channels || [];
      // Filter LinkedIn channels only
      const linkedinChannels = channels.filter(c => c.service === 'linkedin');

      return res.status(200).json({
        success: true,
        organizations: orgs,
        organizationId: orgId,
        channels: linkedinChannels,
        allChannels: channels
      });
    }

    // ── ACTION: publish ──────────────────────────────────────────
    if (action === 'publish') {
      if (!channelId) {
        return res.status(400).json({ error: 'Channel ID manquant' });
      }
      if (!text) {
        return res.status(400).json({ error: 'Texte du post manquant' });
      }

      const publishMode = mode || 'shareNow';
      const mutation = `mutation CreatePost($input: CreatePostInput!) {
        createPost(input: $input) {
          ... on PostActionSuccess {
            post {
              id
              text
            }
          }
          ... on MutationError {
            message
          }
        }
      }`;

      const input = {
        channelId,
        text,
        schedulingType: 'automatic',
        mode: publishMode,
        source: 'generateur-linkedin'
      };

      // Add scheduled time if custom schedule
      if (publishMode === 'customScheduled' && dueAt) {
        input.dueAt = dueAt;
      }

      const pubRes = await fetch('https://api.buffer.com', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          query: mutation,
          variables: { input }
        })
      });

      if (!pubRes.ok) {
        const errText = await pubRes.text();
        return res.status(pubRes.status).json({
          error: `Erreur publication Buffer (${pubRes.status}): ${errText}`
        });
      }

      const pubData = await pubRes.json();
      if (pubData.errors) {
        return res.status(400).json({
          error: `Erreur publication: ${pubData.errors.map(e => e.message).join(', ')}`
        });
      }

      const result = pubData.data?.createPost;
      if (result?.message) {
        // MutationError
        return res.status(400).json({ error: result.message });
      }

      return res.status(200).json({
        success: true,
        postId: result?.post?.id,
        text: result?.post?.text,
        mode: publishMode
      });
    }

    return res.status(400).json({ error: `Action inconnue: ${action}` });

  } catch (err) {
    return res.status(500).json({
      error: `Erreur serveur: ${err.message}`
    });
  }
}
