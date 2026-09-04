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

    const { brandName, contactName, contactEmail, contactPhone, website, logoUrl, brandColor, positionNumber, tier, category, founderMessage } = body;

    if (!brandName || !contactEmail || positionNumber === undefined || positionNumber === null) {
      return json({ success: false, error: "Missing required fields: brandName, contactEmail, positionNumber" }, 400);
    }

    const positions = await base44.asServiceRole.entities.SponsorPosition.list();
    const position = positions.find((p: any) => p.positionNumber === Number(positionNumber));
    if (!position) return json({ success: false, error: "Position not found" }, 404);

    const effectiveTier = tier || position.tier;
    const now = new Date();

    // Auto-release expired hold
    if (position.positionState === 'hold' && position.holdUntil && new Date(position.holdUntil) < now) {
      await base44.asServiceRole.entities.SponsorPosition.update(position.id, {
        positionState: 'available', isAvailable: true, holdBy: null, holdUntil: null
      });
      position.positionState = 'available'; position.isAvailable = true; position.holdUntil = null; position.holdBy = null;
    }

    // Availability check
    const isActivelyHeld = position.positionState === 'hold' && position.holdUntil && new Date(position.holdUntil) >= now;
    if (position.positionState === 'sold' || isActivelyHeld || !position.isAvailable) {
      return json({ success: false, error: "This position was just taken or held by another brand. Refresh and pick another slot." }, 409);
    }

    // Category exclusivity
    const targetCategory = (category || position.category || '').toLowerCase().trim();
    if (targetCategory) {
      const sponsors = await base44.asServiceRole.entities.Sponsor.list();
      const existingPaidSponsor = sponsors.find((s: any) =>
        s.paymentStatus === 'paid' && s.status === 'active' &&
        s.category && s.category.toLowerCase().trim() === targetCategory
      );
      if (existingPaidSponsor) {
        return json({ success: false, error: `Category exclusivity: a paid sponsor already owns the '${targetCategory}' category on the canvas.` }, 409);
      }
    }

    // Pricing: fixed for all tiers; founding escalates with each sold/held founding slot
    let amount: number;
    if (effectiveTier === 'founding') {
      const soldOrHeldFoundingCount = positions.filter((p: any) =>
        p.tier === 'founding' && (p.positionState === 'sold' ||
          (p.positionState === 'hold' && p.holdUntil && new Date(p.holdUntil) >= now))
      ).length;
      amount = 50000 + (soldOrHeldFoundingCount * 5000);
    } else {
      amount = position.price || position.basePrice || 0;
    }

    const holdExpiry = new Date(now.getTime() + 30 * 60 * 1000).toISOString();
    const trackingId = `CC-${Date.now().toString(36).toUpperCase()}-${positionNumber}`;
    const uniqueUrl = `?ref=${trackingId}`;

    const sponsor = await base44.asServiceRole.entities.Sponsor.create({
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
      isCrown: effectiveTier === 'crown',
      isFounding: effectiveTier === 'founding',
      isBid: false,
      contractSigned: false,
      qrScans: 0,
      shareClicks: 0,
      socialMentions: 0,
      source: 'website',
      campaignId: 'sponsored-gt650-2026'
    });

    await base44.asServiceRole.entities.SponsorPosition.update(position.id, {
      positionState: 'hold',
      isAvailable: false,
      holdUntil: holdExpiry,
      holdBy: sponsor.id
    });

    await base44.asServiceRole.entities.CampaignActivity.create({
      activityType: 'application',
      source: 'website',
      sponsorId: sponsor.id,
      timestamp: now.toISOString()
    });

    return json({
      success: true,
      message: "Position held for 30 minutes. Complete checkout to make it permanent.",
      sponsorId: sponsor.id,
      trackingId,
      amount,
      holdExpiry,
      positionLabel: position.displayLabel,
      nextSteps: [
        "Your slot is reserved for 30 minutes — the countdown is live",
        "Complete checkout within 30 minutes to lock it permanently",
        "You'll receive an invoice and the sponsor agreement by email",
        "Once payment is verified, your brand goes live on The Chrome Canvas"
      ]
    });
  } catch (error) {
    return json({ success: false, error: 'Failed to submit application', details: String(error) }, 500);
  }
});