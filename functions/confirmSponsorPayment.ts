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

    const { sponsorId } = body;

    if (!sponsorId) {
      return new Response(JSON.stringify({
        success: false,
        error: "sponsorId is required to confirm payment"
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const sponsors = await base44.entities.Sponsor.list();
    const sponsor = sponsors.find((s: any) => s.id === sponsorId);

    if (!sponsor) {
      return new Response(JSON.stringify({
        success: false,
        error: "Sponsor not found"
      }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }

    // 1. Update sponsor: status='active', paymentStatus='paid', holdExpiry=null
    await base44.entities.Sponsor.update(sponsor.id, {
      status: 'active',
      paymentStatus: 'paid',
      holdExpiry: null
    });

    // 2. Update position: positionState='sold', isAvailable=false, holdUntil=null, holdBy=null
    const positions = await base44.entities.SponsorPosition.list();
    const position = positions.find((p: any) => p.positionNumber === sponsor.positionNumber);

    if (position) {
      await base44.entities.SponsorPosition.update(position.id, {
        positionState: 'sold',
        isAvailable: false,
        holdUntil: null,
        holdBy: null
      });
    }

    // 3. Create CampaignActivity for payment_confirmed
    await base44.entities.CampaignActivity.create({
      activityType: 'payment_confirmed',
      source: 'payment_gateway',
      sponsorId: sponsor.id,
      timestamp: new Date().toISOString()
    });

    // 4. Return success
    return new Response(JSON.stringify({
      success: true,
      message: "Payment confirmed successfully. Sponsor is now active.",
      sponsorId: sponsor.id,
      brandName: sponsor.brandName,
      positionNumber: sponsor.positionNumber,
      amount: sponsor.amount || sponsor.bidAmount
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Failed to confirm sponsor payment',
      details: String(error)
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
