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

    const url = new URL(req.url);
    const { activityType, source, referrer, visitorId, sponsorId } = {
      ...body,
      activityType: body.activityType || url.searchParams.get('activityType'),
      source: body.source || url.searchParams.get('source') || 'website',
      referrer: body.referrer || url.searchParams.get('referrer') || '',
      visitorId: body.visitorId || url.searchParams.get('visitorId') || '',
      sponsorId: body.sponsorId || url.searchParams.get('sponsorId') || ''
    };

    if (!activityType) {
      return new Response(JSON.stringify({
        success: false,
        error: "activityType is required"
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const activity = await base44.entities.CampaignActivity.create({
      activityType,
      source: source || 'website',
      referrer: referrer || '',
      visitorId: visitorId || '',
      sponsorId: sponsorId || '',
      timestamp: new Date().toISOString()
    });

    // Handle analytics counters on Sponsor if sponsorId is supplied
    if (sponsorId) {
      const sponsors = await base44.entities.Sponsor.list();
      const sponsor = sponsors.find((s: any) => s.id === sponsorId || s.trackingId === sponsorId);

      if (sponsor) {
        if (activityType === 'qr_scan') {
          await base44.entities.Sponsor.update(sponsor.id, {
            qrScans: (sponsor.qrScans || 0) + 1
          });
        } else if (activityType === 'share' || activityType === 'share_click') {
          await base44.entities.Sponsor.update(sponsor.id, {
            shareClicks: (sponsor.shareClicks || 0) + 1
          });
        } else if (activityType === 'social_mention') {
          await base44.entities.Sponsor.update(sponsor.id, {
            socialMentions: (sponsor.socialMentions || 0) + 1
          });
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      tracked: true,
      activityId: activity.id
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Failed to track activity',
      details: String(error)
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
