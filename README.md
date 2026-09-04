# 🏍️ The Sponsored GT650

**A 30-day public marketing experiment.** 20 brands fund a Royal Enfield Continental GT 650 (Mr. Clean — full chrome) by sponsoring positions on the bike itself.

> I don't have ₹4.5L for my dream café racer. So I'm turning it into a rolling billboard — and asking 20 brands to fund it.

## The Mechanics

| Tier | Positions | Price | Model |
|------|-----------|-------|-------|
| 🏆 Crown — THE TANK | 1 | Floor ₹1,00,000 | **Live English auction** (min increment ₹10,000, anti-sniping: bids in last 5 min extend 10 min) |
| 💜 Founding | 4 | ₹50,000 + ₹5,000 per slot claimed | **Dynamic escalation** |
| ⚡ Campaign | 10 | ₹25,000 | Fixed, 30-min hold |
| 🧪 Experiment | 5 | ₹10,000 | Fixed, 30-min hold |

**Goal:** ₹4,50,000 by October 5, 2026 · **Guarantee:** 100% refund if unreached.

## What Sponsors Get

- Premium vinyl placement on the bike (not stickers)
- Unique QR code with live scan analytics
- Category exclusivity — one brand per industry
- 12-month documented "GT650 Tour" (meetups, rides, campuses, co-working spaces)
- Feature in the public case study

## State Machine

```
AVAILABLE → HOLD (30-min TTL) → PAYMENT_PENDING → SOLD
                ↓ expired
            AVAILABLE (auto-released)

Crown: AUCTION_LIVE → highest valid bid → winner pays on auction end
```

## Architecture

- **Frontend:** Single-file website (`index.html`) — interactive bike SVG with 20 clickable hotspots, live auction panel, hold countdowns, leaderboard, nominations. Pure HTML/CSS/JS.
- **Backend:** 6 Base44 serverless functions (`functions/`) — getCampaignStats, submitSponsorApplication, placeCrownBid, confirmSponsorPayment, nominateBrand, trackActivity.
- **Data:** 12 entities — SponsorPosition, Sponsor, Bid, Prospect, Invoice, Nomination, CampaignActivity, TourStop, ContentItem, CampaignMetrics, CampaignInsight, Campaign. Every rupee, bid, and hold is tracked.

## Docs
- [Sponsor Agreement Template](docs/SPONSOR_AGREEMENT.md)

---
Independent experiment. Not affiliated with or endorsed by Royal Enfield.
