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

    const { sponsorId } = body;
    if (!sponsorId) return json({ success: false, error: "sponsorId is required to confirm payment" }, 400);

    const sponsors = await base44.entities.Sponsor.list();
    const sponsor = sponsors.find((s: any) => s.id === sponsorId);
    if (!sponsor) return json({ success: false, error: "Sponsor not found" }, 404);

    await base44.entities.Sponsor.update(sponsor.id, {
      status: 'active',
      paymentStatus: 'paid',
      holdExpiry: null,
      lastActivityAt: new Date().toISOString()
    });

    const positions = await base44.entities.SponsorPosition.list();
    const position = positions.find((p: any) => p.positionNumber === sponsor.positionNumber);
    if (position) {
      await base44.entities.SponsorPosition.update(position.id, {
        positionState: 'sold',
        isAvailable: false,
        holdUntil: null,
        holdBy: null,
        soldPrice: sponsor.amount,
        soldAt: new Date().toISOString(),
        category: sponsor.category || position.category
      });
    }

    await base44.entities.CampaignActivity.create({
      activityType: 'payment_confirmed',
      source: 'payment_gateway',
      sponsorId: sponsor.id,
      timestamp: new Date().toISOString()
    });

    return json({
      success: true,
      message: "Payment confirmed. Welcome to the canvas.",
      sponsorId: sponsor.id,
      brandName: sponsor.brandName,
      positionNumber: sponsor.positionNumber,
      amount: sponsor.amount
    });
  } catch (error) {
    return json({ success: false, error: 'Failed to confirm sponsor payment', details: String(error) }, 500);
  }
});