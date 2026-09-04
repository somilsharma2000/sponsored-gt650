# ⚡ The Chrome Canvas

**A 30-day public marketing experiment.** A full-chrome Royal Enfield Continental GT 650 becomes India's most documented rolling gallery — 21 brand positions on the bike **and the rider**, 12 months of measured exposure, every rupee tracked in a public ledger.

> This isn't a donation page. It's 190 kg of rolling chrome with 21 premium ad positions — priced to move. No auctions. No waiting.

## The Inventory (21 positions — bike + rider)

| Tier | Positions | Price | Spots |
|------|-----------|-------|-------|
| 🏆 **The Tank** | 1 | ₹1,00,000 fixed | Full chrome tank wrap — the hero shot of every photo |
| 💜 **Founding** | 5 | ₹50,000 **+₹5,000 per claim** | Headlight cowl, seat cowl, side panel, rear panel + **rider's helmet** |
| ⚡ **Campaign** | 10 | ₹25,000 fixed | Fenders, exhausts, engine, swingarm, fork |
| 🧪 **Community** | 5 | ₹10,000 fixed | Mirror, taillight, plate, caliper + **rider's jacket back** |

**Sold-out canvas = exactly ₹7,00,000.** Milestones unlock as the Chrome Fund climbs:
- ₹4.5L → the bike hits the road
- ₹5.5L → 12-month, 100+ stop tour fully funded
- ₹7.0L → documentary-grade case study + full analytics suite

## Why Fixed Prices (Research-Backed)

Auctions delay deals and close low — seller data and academic research on Buy-It-Now models both show fixed prices with instant checkout convert faster and fairer. So: one price, one click, 30-minute hold. The only rising number is the Founding rate, which rewards early believers. Prices and milestones stay visible: anchoring makes mid-tiers feel reasonable, and the goal-gradient effect turns progress into momentum.

## What Sponsors Get

- Premium vinyl placement (bike or rider gear — not stickers)
- Unique QR code with live scan analytics + sponsor dashboard
- Category exclusivity — one brand per industry, enforced by the backend
- 12-month documented tour (100+ locations), licensed photo/video content
- Feature in the public case study

**The Confident Guarantee:** if the Chrome Fund doesn't hit ₹4,50,000 by October 5, 2026, every rupee is refunded within 7 working days.

## State Machine

```
AVAILABLE → HOLD (30-min TTL) → PAID/ACTIVE → SOLD
                ↓ expired
            AVAILABLE (auto-released)
```

## Architecture

- **Frontend:** `index.html` + `styles.css` + `app.js` — interactive bike+rider SVG with 21 clickable hotspots, live Chrome Fund milestone ladder, founding price escalation ticker, hold countdowns, leaderboard, nominations. Pure HTML/CSS/JS, zero dependencies. Hosted on GitHub Pages.
- **Backend:** 5 Base44 serverless functions (`functions/`) with full CORS — getCampaignStats, submitSponsorApplication, confirmSponsorPayment, nominateBrand, trackActivity.
- **Data:** 12 entities — SponsorPosition, Sponsor, Bid, Prospect, Invoice, Nomination, CampaignActivity, TourStop, ContentItem, CampaignMetrics, CampaignInsight, Campaign. Every rupee, hold, and scan is tracked.

## Docs
- [Sponsor Agreement Template](docs/SPONSOR_AGREEMENT.md)

---
Independent experiment. Not affiliated with or endorsed by Royal Enfield.
