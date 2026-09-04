import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  try {
    const base44 = createClientFromRequest(req);

    let body: any = {};
    if (req.method === 'POST') {
      try { body = await req.json(); } catch (e) { body = {}; }
    }

    const { brandName, brandWebsite, nominatorName, nominatorEmail, reason } = body;

    if (!brandName || typeof brandName !== 'string' || !brandName.trim()) {
      return json({ success: false, error: "brandName is required" }, 400);
    }

    const trimmedBrand = brandName.trim();
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown';
    const now = Date.now();

    const activities = await base44.entities.CampaignActivity.list();

    // 1. Rate limit: 1 nomination per IP per 60 seconds
    const recentNomination = activities.find((act: any) =>
      act.activityType === 'nomination' &&
      act.referrer === clientIp &&
      act.timestamp &&
      (now - new Date(act.timestamp).getTime()) < 60000
    );
    if (recentNomination) {
      return json({ success: false, error: "Slow down — one nomination per minute." }, 429);
    }

    const nominations = await base44.entities.Nomination.list();

    // 2. Email dedup
    if (nominatorEmail && typeof nominatorEmail === 'string' && nominatorEmail.trim()) {
      const trimmedEmail = nominatorEmail.trim().toLowerCase();
      const duplicateVote = nominations.some((n: any) =>
        n.brandName?.toLowerCase() === trimmedBrand.toLowerCase() &&
        n.nominatorEmail?.toLowerCase() === trimmedEmail
      );
      if (duplicateVote) {
        return json({ success: false, error: "You've already voted for this brand." }, 409);
      }
    }

    // 3. Increment or create
    const existing = nominations.find((n: any) => n.brandName?.toLowerCase() === trimmedBrand.toLowerCase());
    let totalVotes = 1;
    let nominationId = '';

    if (existing) {
      totalVotes = (existing.votes || 0) + 1;
      nominationId = existing.id;
      await base44.entities.Nomination.update(existing.id, { votes: totalVotes, lastVoteAt: new Date(now).toISOString() });
    } else {
      const created = await base44.entities.Nomination.create({
        brandName: trimmedBrand,
        brandWebsite: brandWebsite || '',
        nominatorName: nominatorName || 'Anonymous',
        nominatorEmail: nominatorEmail || '',
        reason: reason || '',
        votes: 1,
        status: 'pending'
      });
      nominationId = created.id;
    }

    await base44.entities.CampaignActivity.create({
      activityType: 'nomination',
      source: 'website',
      referrer: clientIp,
      visitorId: nominatorEmail || clientIp,
      sponsorId: trimmedBrand.toLowerCase(),
      timestamp: new Date(now).toISOString()
    });

    return json({
      success: true,
      message: existing ? `Vote recorded for ${trimmedBrand}!` : `${trimmedBrand} has been nominated for the canvas!`,
      nominationId, brandName: trimmedBrand, votes: totalVotes
    });
  } catch (error) {
    return json({ success: false, error: 'Failed to nominate brand', details: String(error) }, 500);
  }
});