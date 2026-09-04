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
      brandName,
      contactName,
      contactEmail,
      contactPhone,
      website,
      logoUrl,
      brandColor,
      positionNumber,
      tier,
      category,
      founderMessage
    } = body;

    if (!brandName || !contactEmail || positionNumber === undefined || positionNumber === null) {
      return new Response(JSON.stringify({
        success: false,
        error: "Missing required fields: brandName, contactEmail, positionNumber"
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const positions = await base44.entities.SponsorPosition.list();
    const position = positions.find((p: any) => p.positionNumber === Number(positionNumber));

    if (!position) {
      return new Response(JSON.stringify({
        success: false,
        error: "Position not found"
      }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }

    const effectiveTier = tier || position.tier;

    // 1. Crown tier check: REJECT with message 'Crown slot is auction-only. Use placeCrownBid endpoint.'
    if (effectiveTier === 'crown' || Number(positionNumber) === 1) {
      return new Response(JSON.stringify({
        success: false,
        error: "Crown slot is auction-only. Use placeCrownBid endpoint."
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const now = new Date();

    // Auto-release hold if expired
    if (position.positionState === 'hold' && position.holdUntil && new Date(position.holdUntil) < now) {
      await base44.entities.SponsorPosition.update(position.id, {
        positionState: 'available',
        isAvailable: true,
        holdBy: null,
        holdUntil: null
      });
      position.positionState = 'available';
      position.isAvailable = true;
      position.holdUntil = null;
      position.holdBy = null;
    }

    // 2. Check position availability
    const isActivelyHeld = position.positionState === 'hold' && position.holdUntil && new Date(position.holdUntil) >= now;
    if (position.positionState === 'sold' || isActivelyHeld || !position.isAvailable) {
      return new Response(JSON.stringify({
        success: false,
        error: "This position is not available"
      }), { status: 409, headers: { 'Content-Type': 'application/json' } });
    }

    // 3. Category exclusivity check
    const targetCategory = (category || position.category || '').toLowerCase().trim();
    if (targetCategory) {
      const sponsors = await base44.entities.Sponsor.list();
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

    // 4. Calculate pricing
    let amount: number;
    if (effectiveTier === 'founding') {
      const soldFoundingCount = positions.filter((p: any) => p.tier === 'founding' && p.positionState === 'sold').length;
      amount = 50000 + (soldFoundingCount * 5000);
    } else {
      amount = position.price || position.basePrice || 0;
    }

    const holdExpiry = new Date(now.getTime() + 30 * 60 * 1000).toISOString();
    const trackingId = `SP-${Date.now().toString(36).toUpperCase()}-${positionNumber}`;
    const uniqueUrl = `?ref=${trackingId}`;

    // 5. Create sponsor with status='hold', paymentStatus='pending'
    const sponsor = await base44.entities.Sponsor.create({
      brandName,
      contactName: contactName || '',
      contactEmail,
      contactPhone: contactPhone || '',
      website: website || '',
      logoUrl: logoUrl || '',
      brandColor: brandColor || '#000000',
      positionNumber: Number(positionNumber),
      positionLabel: position.displayLabel,
      tier: effectiveTier,
      category: category || position.category || '',
      amount,
      status: 'hold',
      paymentStatus: 'pending',
      trackingId,
      uniqueUrl,
      holdExpiry,
      founderMessage: founderMessage || '',
      isCrown: false,
      isFounding: effectiveTier === 'founding',
      isBid: false,
      contractSigned: false,
      qrScans: 0,
      shareClicks: 0,
      socialMentions: 0,
      campaignId: 'sponsored-gt650-2026'
    });

    // 6. Set position to positionState='hold' with 30-min holdUntil
    await base44.entities.SponsorPosition.update(position.id, {
      positionState: 'hold',
      isAvailable: false,
      holdUntil: holdExpiry,
      holdBy: brandName
    });

    // 7. Create CampaignActivity for application
    await base44.entities.CampaignActivity.create({
      activityType: 'application',
      source: 'website',
      sponsorId: sponsor.id,
      timestamp: now.toISOString()
    });

    return new Response(JSON.stringify({
      success: true,
      message: "Sponsor application submitted and 30-minute hold initiated!",
      sponsorId: sponsor.id,
      trackingId,
      amount,
      holdExpiry,
      positionLabel: position.displayLabel,
      nextSteps: [
        "Your 30-minute position reservation is now active",
        "Complete payment within 30 minutes to permanently confirm your slot",
        "You'll receive a confirmation email with invoice details",
        "Once payment is verified, your brand logo goes live on The Sponsored MacBook"
      ]
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Failed to submit application',
      details: String(error)
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
