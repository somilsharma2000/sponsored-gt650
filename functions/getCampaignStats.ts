import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";

Deno.serve(async (req: Request) => {
  try {
    const base44 = createClientFromRequest(req);

    const positions = await base44.entities.SponsorPosition.list();
    const sponsors = await base44.entities.Sponsor.list();
    const nominations = await base44.entities.Nomination.list();
    const activities = await base44.entities.CampaignActivity.list();

    const now = new Date();

    // 1. AUTO-RELEASE expired holds: if positionState === 'hold' && holdUntil < now, reset to available
    for (const p of positions) {
      if (p.positionState === 'hold' && p.holdUntil && new Date(p.holdUntil) < now) {
        await base44.entities.SponsorPosition.update(p.id, {
          positionState: 'available',
          isAvailable: true,
          holdBy: null,
          holdUntil: null
        });
        p.positionState = 'available';
        p.isAvailable = true;
        p.holdBy = null;
        p.holdUntil = null;
      }
    }

    // 2. Calculate Founding tier dynamic pricing: price = basePrice + (count of sold/hold founding positions) * 5000. Update each founding position's price field.
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

    // 3. Count only paid+active sponsors as raised total
    const activeSponsors = sponsors.filter((s: any) => 
      s.status === 'active' && s.paymentStatus === 'paid'
    );
    const totalRaised = activeSponsors.reduce((sum: number, s: any) => 
      sum + (s.amount || s.bidAmount || 0), 0
    );
    const totalTarget = 600000;

    // 4. Build leaderboard (paid sponsors only)
    const leaderboard = activeSponsors
      .map((s: any) => ({
        id: s.id,
        position: s.positionLabel,
        positionNumber: s.positionNumber,
        brandName: s.brandName,
        amount: s.amount || s.bidAmount || 0,
        tier: s.tier,
        logoUrl: s.logoUrl,
        website: s.website,
        category: s.category
      }))
      .sort((a: any, b: any) => b.amount - a.amount);

    // 5. Top nominations
    const topNominations = nominations
      .map((n: any) => ({
        id: n.id,
        brandName: n.brandName,
        brandWebsite: n.brandWebsite,
        votes: n.votes || 0,
        reason: n.reason
      }))
      .sort((a: any, b: any) => b.votes - a.votes)
      .slice(0, 10);

    // 6. Campaign counts
    const positionsTotal = positions.length;
    const positionsTaken = positions.filter((p: any) => p.positionState === 'sold').length;
    const positionsHeld = positions.filter((p: any) => p.positionState === 'hold').length;
    const positionsAvailable = positions.filter((p: any) => p.positionState === 'available' || (p.isAvailable && p.positionState !== 'sold' && p.positionState !== 'hold')).length;
    const pendingApplications = sponsors.filter((s: any) => 
      s.status === 'applied' || s.status === 'hold' || s.paymentStatus === 'pending'
    ).length;

    // 7. Stats object
    const pageViews = activities.filter((a: any) => a.activityType === 'page_view').length;
    const qrScans = activities.filter((a: any) => a.activityType === 'qr_scan').length;
    const shares = activities.filter((a: any) => a.activityType === 'share').length;
    const applications = activities.filter((a: any) => a.activityType === 'application').length;

    // 8. Crown position auction object
    const crownPosition = positions.find((p: any) => p.tier === 'crown' || p.positionNumber === 1);
    let auction = null;
    if (crownPosition) {
      const currentBid = crownPosition.currentBid || crownPosition.basePrice || 100000;
      const minNextBid = crownPosition.minNextBid || (currentBid + 10000);
      const auctionEnd = crownPosition.auctionEndTime ? new Date(crownPosition.auctionEndTime).getTime() : 0;
      const timeRemaining = auctionEnd ? Math.max(0, auctionEnd - Date.now()) : 0;

      auction = {
        positionNumber: crownPosition.positionNumber,
        currentBid,
        highestBidderName: crownPosition.highestBidderName || "No bids yet",
        highestBidderEmail: crownPosition.highestBidderEmail || "",
        minNextBid,
        bidCount: crownPosition.bidCount || 0,
        auctionEndTime: crownPosition.auctionEndTime || null,
        timeRemaining
      };
    }

    const result = {
      campaign: {
        name: "The Sponsored MacBook",
        tagline: "Can 20 brands fund one MacBook? An experiment in brand-funded creativity.",
        target: totalTarget,
        raised: totalRaised,
        progressPercent: Math.min(100, Math.round((totalRaised / totalTarget) * 100)),
        positionsTotal,
        positionsTaken,
        positionsHeld,
        positionsAvailable,
        pendingApplications
      },
      stats: {
        pageViews,
        qrScans,
        shares,
        applications,
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
        basePrice: p.basePrice || p.price || 0,
        tier: p.tier,
        positionState: p.positionState || (p.isAvailable ? 'available' : 'sold'),
        isAvailable: Boolean(p.isAvailable && p.positionState !== 'sold' && p.positionState !== 'hold'),
        category: p.category || null,
        description: p.description || '',
        currentBid: p.tier === 'crown' ? (p.currentBid || p.basePrice || 100000) : undefined,
        highestBidderName: p.tier === 'crown' ? p.highestBidderName : undefined,
        minNextBid: p.tier === 'crown' ? (p.minNextBid || ((p.currentBid || p.basePrice || 100000) + 10000)) : undefined,
        auctionEndTime: p.tier === 'crown' ? p.auctionEndTime : undefined,
        bidCount: p.tier === 'crown' ? (p.bidCount || 0) : undefined
      })),
      auction
    };

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: 'Failed to fetch campaign stats', 
      details: String(error) 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});
