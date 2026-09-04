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

    const positions = await base44.entities.SponsorPosition.list();
    const sponsors = await base44.entities.Sponsor.list();
    const nominations = await base44.entities.Nomination.list();
    const activities = await base44.entities.CampaignActivity.list();

    const now = new Date();

    // 1. AUTO-RELEASE expired holds
    for (const p of positions) {
      if (p.positionState === 'hold' && p.holdUntil && new Date(p.holdUntil) < now) {
        await base44.entities.SponsorPosition.update(p.id, {
          positionState: 'available', isAvailable: true, holdBy: null, holdUntil: null
        });
        p.positionState = 'available'; p.isAvailable = true; p.holdBy = null; p.holdUntil = null;
      }
    }

    // 2. Founding dynamic pricing: basePrice + (sold/hold founding count) * 5000
    const soldHoldFoundingCount = positions.filter((p: any) =>
      p.tier === 'founding' && (p.positionState === 'sold' || p.positionState === 'hold')
    ).length;

    for (const p of positions) {
      if (p.tier === 'founding') {
        const basePrice = p.basePrice || 50000;
        const dynamicPrice = basePrice + (soldHoldFoundingCount * 5000);
        if (p.price !== dynamicPrice) {
          await base44.entities.SponsorPosition.update(p.id, { price: dynamicPrice });
          p.price = dynamicPrice;
        }
      }
    }

    // 3. Raised total: paid+active sponsors only
    const activeSponsors = sponsors.filter((s: any) =>
      s.status === 'active' && s.paymentStatus === 'paid'
    );
    const totalRaised = activeSponsors.reduce((sum: number, s: any) => sum + (s.amount || 0), 0);
    const totalTarget = 450000;

    // 4. Leaderboard (paid sponsors only)
    const leaderboard = activeSponsors
      .map((s: any) => ({
        id: s.id, position: s.positionLabel, positionNumber: s.positionNumber,
        brandName: s.brandName, amount: s.amount || 0,
        tier: s.tier, logoUrl: s.logoUrl, website: s.website, category: s.category
      }))
      .sort((a: any, b: any) => b.amount - a.amount);

    // 5. Top nominations
    const topNominations = nominations
      .map((n: any) => ({ id: n.id, brandName: n.brandName, brandWebsite: n.brandWebsite, votes: n.votes || 0, reason: n.reason }))
      .sort((a: any, b: any) => b.votes - a.votes)
      .slice(0, 10);

    // 6. Counts
    const positionsTotal = positions.length;
    const positionsTaken = positions.filter((p: any) => p.positionState === 'sold').length;
    const positionsHeld = positions.filter((p: any) => p.positionState === 'hold').length;
    const positionsAvailable = positions.filter((p: any) =>
      p.positionState === 'available' || (p.isAvailable && p.positionState !== 'sold' && p.positionState !== 'hold')
    ).length;
    const pendingApplications = sponsors.filter((s: any) =>
      s.status === 'applied' || s.status === 'hold' || s.paymentStatus === 'pending'
    ).length;

    // 7. Stats
    const pageViews = activities.filter((a: any) => a.activityType === 'page_view').length;
    const qrScans = activities.filter((a: any) => a.activityType === 'qr_scan').length;
    const shares = activities.filter((a: any) => a.activityType === 'share').length;
    const applications = activities.filter((a: any) => a.activityType === 'application').length;

    const result = {
      campaign: {
        name: "The Chrome Canvas",
        tagline: "21 brands. One chrome café racer. 12 months of documented attention. The most public ad space in India.",
        target: totalTarget,
        raised: totalRaised,
        progressPercent: Math.min(100, Math.round((totalRaised / totalTarget) * 100)),
        positionsTotal, positionsTaken, positionsHeld, positionsAvailable, pendingApplications
      },
      stats: {
        pageViews, qrScans, shares, applications,
        totalNominations: nominations.length,
        totalSponsors: activeSponsors.length
      },
      leaderboard,
      topNominations,
      positions: positions.map((p: any) => ({
        positionNumber: p.positionNumber,
        displayLabel: p.displayLabel,
        positionName: p.positionName || p.displayLabel,
        price: p.price || p.basePrice || 0,
        tier: p.tier,
        positionState: p.positionState || (p.isAvailable ? 'available' : 'sold'),
        isAvailable: Boolean(p.isAvailable && p.positionState !== 'sold' && p.positionState !== 'hold'),
        category: p.category || null,
        description: p.description || '',
        partName: p.partName || '',
        sizeLabel: p.sizeLabel || ''
      }))
    };

    return json(result);
  } catch (error) {
    return json({ error: 'Failed to fetch campaign stats', details: String(error) }, 500);
  }
});