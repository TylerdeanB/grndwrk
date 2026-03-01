# GRNDWRK — AI Performance Systems for Hospitality

> Real-time P&L visibility, live labour tracking, and AI-powered operational insights for hospitality venues.

---

## What It Is

GRNDWRK connects a venue's existing POS (BEPOZ), workforce management (Tanda), and reservations (SevenRooms) tools into a single real-time performance dashboard.

**Target market:** Independent and family-owned hospitality venues in Australia, $1M–$10M annual revenue.

---

## Repo Structure

```
grndwrk/
├── dashboard/
│   └── grndwrk-mobile.html       → Mobile-first dashboard (current build)
├── api/
│   ├── grndwrk-api-server.js     → Mock API server v1
│   ├── grndwrk-api-server-v2.js  → Mock API server v2 (SevenRooms)
│   ├── grndwrk-schema.js         → Data schema v1
│   └── grndwrk-schema-v2.js      → Data schema v2 (ReservationsSnapshot)
├── docs/
│   ├── GRNDWRK_CLAUDE.md         → App memory & technical spec
│   └── GRNDWRK_Business_Overview.docx
└── README.md
```

---

## Data Sources

| System | Purpose | Status |
|---|---|---|
| BEPOZ (POS) | Revenue, COGS, covers, section data | Integration in progress |
| Tanda (Workforce) | Labour cost, rosters, timesheets | API documented |
| SevenRooms (Reservations) | Bookings, covers, no-shows, guest profiles | Partner-gated |

---

## Business Model

| Tier | Price | Includes |
|---|---|---|
| Starter | $1,500–$2,500/month | Single venue, core dashboard, weekly AI summary |
| Growth | $3,500–$5,000/month | Multi-venue, full integration, monthly strategy call |
| Enterprise | $7,500–$15,000/month | Group operators, custom build, dedicated support |

---

*GRNDWRK · Confidential · 2026 · grndwrk.com.au*