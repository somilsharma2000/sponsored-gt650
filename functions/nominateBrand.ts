import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";

Deno.serve(async (req: Request) => {
  try {
    const base44 = createClientFromRequest(req);

    let body: any = {};
    if (req.method === 'POST') {
      try {
        body = await req.json();
      } catch (e) {
        body = {};
      }
    }

    const { brandName, brandWebsite, nominatorName, nominatorEmail, reason } = body;

    if (!brandName || typeof brandName !== 'string' || !brandName.trim()) {
      return new Response(JSON.stringify({
        success: false,
        error: "brandName is required"
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const trimmedBrand = brandName.trim();
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown';
    const now = Date.now();

    const activities = await base44.entities.CampaignActivity.list();

    // 1. Rate limit: check CampaignActivity for nomination type from same referrer (IP) within last 60 seconds
    const recentNomination = activities.find((act: any) =>
      act.activityType === 'nomination' &&
      act.referrer === clientIp &&
      act.timestamp &&
      (now - new Date(act.timestamp).getTime()) < 60000
    );

    if (recentNomination) {
      return new Response(JSON.stringify({
        success: false,
        error: "Rate limit exceeded. Please wait 60 seconds before submitting another nomination."
      }), { status: 429, headers: { 'Content-Type': 'application/json' } });
    }

    const nominations = await base44.entities.Nomination.list();

    // 2. Email dedup: if nominatorEmail already voted for same brandName, return 409
    if (nominatorEmail && typeof nominatorEmail === 'string' && nominatorEmail.trim()) {
      const trimmedEmail = nominatorEmail.trim().toLowerCase();
      const duplicateVote = nominations.some((n: any) =>
        n.brandName?.toLowerCase() === trimmedBrand.toLowerCase() &&
        n.nominatorEmail?.toLowerCase() === trimmedEmail
      ) || activities.some((act: any) =>
        act.activityType === 'nomination' &&
        act.visitorId?.toLowerCase() === trimmedEmail &&
        act.sponsorId?.toLowerCase() === trimmedBrand.toLowerCase()
      );

      if (duplicateVote) {
        return new Response(JSON.stringify({
          success: false,
          error: "You have already voted for this brand."
        }), { status: 409, headers: { 'Content-Type': 'application/json' } });
      }
    }

    // 3. If brand already exists in nominations, increment votes; if new, create nomination with votes=1
    const existing = nominations.find((n: any) =>
      n.brandName?.toLowerCase() === trimmedBrand.toLowerCase()
    );

    let totalVotes = 1;
    let nominationId = '';

    if (existing) {
      totalVotes = (existing.votes || 0) + 1;
      nominationId = existing.id;
      await base44.entities.Nomination.update(existing.id, {
        votes: totalVotes
      });
    } else {
      const created = await base44.entities.Nomination.create({
        brandName: trimmedBrand,
        brandWebsite: brandWebsite || '',
        nominatorName: nominatorName || 'Anonymous',
        nominatorEmail: nominatorEmail || '',
        reason: reason || '',
        votes: 1
      });
      nominationId = created.id;
      totalVotes = 1;
    }

    // 4. Create CampaignActivity for nomination
    await base44.entities.CampaignActivity.create({
      activityType: 'nomination',
      source: 'website',
      referrer: clientIp,
      visitorId: nominatorEmail || clientIp,
      sponsorId: trimmedBrand.toLowerCase(),
      timestamp: new Date(now).toISOString()
    });

    // 5. Return success
    return new Response(JSON.stringify({
      success: true,
      message: existing ? `Vote recorded for ${trimmedBrand}!` : `${trimmedBrand} has been nominated!`,
      nominationId,
      brandName: trimmedBrand,
      votes: totalVotes
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Failed to nominate brand',
      details: String(error)
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
