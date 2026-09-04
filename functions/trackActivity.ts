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

    const url = new URL(req.url);
    const { activityType, source, referrer, visitorId, sponsorId, pagePath } = {
      ...body,
      activityType: body.activityType || url.searchParams.get('activityType'),
      source: body.source || url.searchParams.get('source') || 'website',
      referrer: body.referrer || url.searchParams.get('referrer') || '',
      visitorId: body.visitorId || url.searchParams.get('visitorId') || '',
      sponsorId: body.sponsorId || url.searchParams.get('sponsorId') || '',
      pagePath: body.pagePath || url.searchParams.get('pagePath') || ''
    };

    if (!activityType) return json({ success: false, error: "activityType is required" }, 400);

    const activity = await base44.entities.CampaignActivity.create({
      activityType,
      source: source || 'website',
      referrer: referrer || '',
      visitorId: visitorId || '',
      sponsorId: sponsorId || '',
      pagePath: pagePath || '',
      timestamp: new Date().toISOString()
    });

    // Analytics counters on Sponsor
    if (sponsorId) {
      const sponsors = await base44.entities.Sponsor.list();
      const sponsor = sponsors.find((s: any) => s.id === sponsorId || s.trackingId === sponsorId);
      if (sponsor) {
        if (activityType === 'qr_scan') {
          await base44.entities.Sponsor.update(sponsor.id, { qrScans: (sponsor.qrScans || 0) + 1 });
        } else if (activityType === 'share' || activityType === 'share_click') {
          await base44.entities.Sponsor.update(sponsor.id, { shareClicks: (sponsor.shareClicks || 0) + 1 });
        } else if (activityType === 'social_mention') {
          await base44.entities.Sponsor.update(sponsor.id, { socialMentions: (sponsor.socialMentions || 0) + 1 });
        }
      }
    }

    return json({ success: true, tracked: true, activityId: activity.id });
  } catch (error) {
    return json({ success: false, error: 'Failed to track activity', details: String(error) }, 500);
  }
});