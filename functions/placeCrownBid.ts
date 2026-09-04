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

    const {
      bidderName,
      bidderEmail,
      bidderPhone,
      brandName,
      website,
      logoUrl,
      category,
      bidAmount
    } = body;

    if (!bidderName || !bidderEmail || !brandName || bidAmount === undefined || bidAmount === null) {
      return new Response(JSON.stringify({
        success: false,
        error: "Missing required fields: bidderName, bidderEmail, brandName, bidAmount"
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const numBidAmount = Number(bidAmount);
    if (isNaN(numBidAmount) || numBidAmount <= 0) {
      return new Response(JSON.stringify({
        success: false,
        error: "bidAmount must be a positive number"
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // 1. Find Crown position (positionNumber === 1 or tier === 'crown')
    const positions = await base44.entities.SponsorPosition.list();
    const position = positions.find((p: any) => p.positionNumber === 1 || p.tier === 'crown');

    if (!position) {
      return new Response(JSON.stringify({
        success: false,
        error: "Crown position not found"
      }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }

    // 2. Validate bidAmount >= position.minNextBid (if no bids yet, minNextBid = basePrice + 10000 = 110000)
    const basePrice = position.basePrice || 100000;
    const hasBids = (position.bidCount || 0) > 0;
    const minNextBid = hasBids
      ? (position.minNextBid || ((position.currentBid || basePrice) + 10000))
      : (basePrice + 10000);

    if (numBidAmount < minNextBid) {
      return new Response(JSON.stringify({
        success: false,
        error: `Bid amount must be at least ₹${minNextBid.toLocaleString()}`
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // 3. Validate bidAmount > position.currentBid
    const currentBid = position.currentBid || 0;
    if (hasBids && numBidAmount <= currentBid) {
      return new Response(JSON.stringify({
        success: false,
        error: `Bid amount must be higher than current bid of ₹${currentBid.toLocaleString()}`
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // 4. Check category exclusivity
    const targetCategory = (category || position.category || '').toLowerCase().trim();
    const sponsors = await base44.entities.Sponsor.list();
    if (targetCategory) {
      const existingPaidSponsor = sponsors.find((s: any) =>
        s.paymentStatus === 'paid' &&
        s.status === 'active' &&
        s.category &&
        s.category.toLowerCase().trim() === targetCategory
      );

      if (existingPaidSponsor) {
        return new Response(JSON.stringify({
          success: false,
          error: `Category exclusivity violation: A paid sponsor already exists in category '${targetCategory}'`
        }), { status: 409, headers: { 'Content-Type': 'application/json' } });
      }
    }

    // 5. ANTI-SNIPING: if current time is within 5 minutes of auctionEndTime, extend auctionEndTime by 10 minutes
    const now = Date.now();
    let isExtended = false;
    let updatedAuctionEndTime = position.auctionEndTime;

    if (position.auctionEndTime) {
      const auctionEndMs = new Date(position.auctionEndTime).getTime();
      const diffMs = auctionEndMs - now;

      if (diffMs > 0 && diffMs <= 5 * 60 * 1000) {
        updatedAuctionEndTime = new Date(auctionEndMs + 10 * 60 * 1000).toISOString();
        isExtended = true;
      }
    } else {
      // Default auction end time 7 days from now if not set
      updatedAuctionEndTime = new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();
    }

    // 6. Update previous leading bidder's sponsor record to status='bid_outbid' if exists
    const leadingSponsors = sponsors.filter((s: any) => s.isCrown && s.status === 'bid_leading');
    for (const prevSponsor of leadingSponsors) {
      await base44.entities.Sponsor.update(prevSponsor.id, {
        status: 'bid_outbid'
      });
    }

    if (position.highestBidder) {
      const prevHighestSponsor = sponsors.find((s: any) => s.id === position.highestBidder);
      if (prevHighestSponsor && prevHighestSponsor.status === 'bid_leading') {
        await base44.entities.Sponsor.update(prevHighestSponsor.id, {
          status: 'bid_outbid'
        });
      }
    }

    // 7. Create Sponsor record: status='bid_leading', isBid=true, isCrown=true, bidAmount=bidAmount, amount=bidAmount
    const trackingId = `CROWN-BID-${Date.now().toString(36).toUpperCase()}`;
    const newSponsor = await base44.entities.Sponsor.create({
      brandName,
      contactName: bidderName,
      contactEmail: bidderEmail,
      contactPhone: bidderPhone || '',
      website: website || '',
      logoUrl: logoUrl || '',
      brandColor: '#FFD700',
      positionNumber: 1,
      positionLabel: position.displayLabel || 'Crown Slot',
      tier: 'crown',
      category: category || position.category || '',
      amount: numBidAmount,
      bidAmount: numBidAmount,
      status: 'bid_leading',
      paymentStatus: 'pending',
      trackingId,
      uniqueUrl: `?ref=${trackingId}`,
      isCrown: true,
      isFounding: false,
      isBid: true,
      contractSigned: false,
      qrScans: 0,
      shareClicks: 0,
      socialMentions: 0,
      campaignId: 'sponsored-gt650-2026'
    });

    // 8. Update Crown position: currentBid=bidAmount, highestBidder=sponsor.id, highestBidderName=bidderName, highestBidderEmail=bidderEmail, minNextBid=bidAmount+10000, bidCount++
    const newBidCount = (position.bidCount || 0) + 1;
    const nextMinBid = numBidAmount + 10000;

    await base44.entities.SponsorPosition.update(position.id, {
      currentBid: numBidAmount,
      highestBidder: newSponsor.id,
      highestBidderName: bidderName,
      highestBidderEmail: bidderEmail,
      minNextBid: nextMinBid,
      bidCount: newBidCount,
      positionState: 'auction_live',
      auctionEndTime: updatedAuctionEndTime
    });

    // 9. Create CampaignActivity for bid
    await base44.entities.CampaignActivity.create({
      activityType: 'crown_bid',
      source: 'website',
      sponsorId: newSponsor.id,
      timestamp: new Date().toISOString()
    });

    // 10. Return response
    return new Response(JSON.stringify({
      success: true,
      currentBid: numBidAmount,
      minNextBid: nextMinBid,
      bidCount: newBidCount,
      auctionEndTime: updatedAuctionEndTime,
      isExtended,
      message: isExtended
        ? "Bid placed successfully! Anti-sniping activated: auction extended by 10 minutes."
        : "Bid placed successfully! You are currently the leading bidder for the Crown slot."
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Failed to place Crown bid',
      details: String(error)
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
