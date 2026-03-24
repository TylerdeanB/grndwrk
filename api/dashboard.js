// api/dashboard.js — GRNDWRK Vercel Serverless Function
// Authenticates via Supabase, fetches live Tanda data, returns dashboard payload

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const TANDA_BASE = 'https://my.tanda.co/api/v2';

// ── Tanda API helpers ──────────────────────────────────────────────────────

async function tandaGet(path, token) {
  const res = await fetch(`${TANDA_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error(`Tanda API error: ${res.status} on ${path}`);
  return res.json();
}

function todayDate() {
  return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
}

// ── Transform Tanda data into GRNDWRK LabourSnapshot ──────────────────────

function buildLabourSnapshot(shifts, timesheets, rosters, teams) {

  // Build department map from teams
  const deptMap = {};
  (teams || []).forEach(t => { deptMap[t.id] = t.name; });

  const now = new Date();
  const nowHour = now.getHours();

  // Active shifts (clocked in, not yet out)
  const activeShifts = (shifts || []).filter(s => s.start && !s.finish);

  // Completed shifts from timesheets
  const completedShifts = (timesheets || []).filter(s => s.start && s.finish);

  // Total rostered cost from rosters
  const rosteredCost = (rosters || []).reduce((sum, r) => sum + (r.cost || 0), 0);

  // Total actual cost (completed + estimated active)
  const completedCost = completedShifts.reduce((sum, s) => sum + (s.cost || 0), 0);
  const activeCostEstimate = activeShifts.reduce((sum, s) => {
    const startTime = new Date(s.start * 1000);
    const hoursWorked = (now - startTime) / 3600000;
    const hourlyRate = s.cost_breakdown?.hourly_rate || 2500; // cents — fallback $25/hr
    return sum + Math.round(hoursWorked * hourlyRate);
  }, 0);

  const totalActualCost = completedCost + activeCostEstimate;

  // Hourly breakdown — build array for last 12 hours
  const hourlyChart = [];
  for (let i = Math.max(0, nowHour - 11); i <= nowHour; i++) {
    const hourShifts = completedShifts.filter(s => {
      const h = new Date(s.start * 1000).getHours();
      return h === i;
    });
    const cost = hourShifts.reduce((sum, s) => sum + (s.cost || 0), 0);
    const staffCount = hourShifts.length + (i === nowHour ? activeShifts.length : 0);
    hourlyChart.push({
      hour: String(i),
      cost,
      staff_count: staffCount,
      labour_pct: 0, // will be enriched if we have revenue data
      status: 'ok',
      projected: false,
    });
  }

  // Department breakdown
  const deptTotals = {};
  [...completedShifts, ...activeShifts].forEach(s => {
    const dept = deptMap[s.team_id] || 'Other';
    if (!deptTotals[dept]) deptTotals[dept] = { cost: 0, hours: 0, staff_count: 0 };
    const hrs = s.finish
      ? (s.finish - s.start) / 3600
      : (now / 1000 - s.start) / 3600;
    deptTotals[dept].cost += s.cost || 0;
    deptTotals[dept].hours += hrs;
    deptTotals[dept].staff_count += 1;
  });

  const byDepartment = Object.entries(deptTotals).map(([label, d]) => ({
    label,
    cost: Math.round(d.cost),
    hours: Math.round(d.hours * 10) / 10,
    staff_count: d.staff_count,
    labour_pct: 0, // enriched below if revenue available
    status: 'ok',
  }));

  return {
    gauge: {
      actual_pct: 0,       // requires revenue — calculated in merger
      rostered_pct: 0,     // requires revenue — calculated in merger
      rostered_cost: rosteredCost,
      actual_cost: totalActualCost,
      active_shift_count: activeShifts.length,
      status: 'ok',
      warning_threshold: 30,
      danger_threshold: 35,
    },
    hourly_chart: hourlyChart,
    by_department: byDepartment,
    _raw_rostered_cost: rosteredCost,
    _raw_actual_cost: totalActualCost,
  };
}

// ── Merge labour % once we have a revenue figure ───────────────────────────

function enrichLabourWithRevenue(labour, revenueCents, config) {
  if (!revenueCents || revenueCents === 0) return labour;

  const actualPct = (labour._raw_actual_cost / revenueCents) * 100;
  const rosteredPct = (labour._raw_rostered_cost / revenueCents) * 100;

  const warn = config?.labour_warn_pct || 30;
  const danger = config?.labour_danger_pct || 35;
  const status = actualPct >= danger ? 'danger' : actualPct >= warn ? 'warn' : 'ok';

  labour.gauge.actual_pct = Math.round(actualPct * 10) / 10;
  labour.gauge.rostered_pct = Math.round(rosteredPct * 10) / 10;
  labour.gauge.status = status;
  labour.gauge.warning_threshold = warn;
  labour.gauge.danger_threshold = danger;

  // Enrich department %
  labour.by_department = labour.by_department.map(d => {
    const pct = (d.cost / revenueCents) * 100;
    return {
      ...d,
      labour_pct: Math.round(pct * 10) / 10,
      status: pct >= danger ? 'danger' : pct >= warn ? 'warn' : 'ok',
    };
  });

  return labour;
}

// ── Build AI insights from live data ──────────────────────────────────────

function buildInsights(labour, config) {
  const insights = [];
  const now = new Date().toISOString();
  const warn = config?.labour_warn_pct || 30;
  const danger = config?.labour_danger_pct || 35;
  const pct = labour.gauge.actual_pct;

  if (pct >= danger) {
    insights.push({
      id: 'labour-danger',
      type: 'labour',
      severity: 'danger',
      title: `Labour at ${pct.toFixed(1)}% — Action Required`,
      description: `Labour cost is ${(pct - danger).toFixed(1)}pts above your ${danger}% danger threshold. Review active shifts immediately.`,
      detected_at: now,
    });
  } else if (pct >= warn) {
    insights.push({
      id: 'labour-warn',
      type: 'labour',
      severity: 'warn',
      title: `Labour trending high — ${pct.toFixed(1)}%`,
      description: `Labour is ${(pct - warn).toFixed(1)}pts above your ${warn}% warning threshold. Monitor closely this session.`,
      detected_at: now,
    });
  }

  if (labour.gauge.active_shift_count > 0) {
    insights.push({
      id: 'active-shifts',
      type: 'labour',
      severity: 'info',
      title: `${labour.gauge.active_shift_count} staff currently clocked in`,
      description: `Live cost tracking active. Actual cost to now: $${(labour.gauge.actual_cost / 100).toFixed(0)}.`,
      detected_at: now,
    });
  }

  return insights;
}

// ── Main handler ───────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', 'https://app.grndwrkaustralia.com');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // ── 1. Authenticate via Supabase ──────────────────────────────────────
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing auth token' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: { user }, error: authError } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', '')
  );

  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  // ── 2. Load venue config for this user ────────────────────────────────
  const { data: config, error: configError } = await supabase
    .from('venue_config')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (configError || !config) {
    return res.status(404).json({ error: 'No venue config found for this user' });
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('venue')
    .eq('user_id', user.id)
    .single();

  if (!config.tanda_token) {
    return res.status(400).json({ error: 'Tanda token not configured for this venue' });
  }

  // ── 3. Fetch live Tanda data ──────────────────────────────────────────
  const today = todayDate();

  try {
    const [shifts, timesheets, rosters, teams] = await Promise.all([
      tandaGet(`/shifts?from=${today}&to=${today}&show_costs=true`, config.tanda_token),
      tandaGet(`/timesheets/on/${today}?show_costs=true`, config.tanda_token),
      tandaGet(`/rosters/current?show_costs=true`, config.tanda_token),
      tandaGet(`/teams`, config.tanda_token),
    ]);

    // ── 4. Build labour snapshot ────────────────────────────────────────
    let labour = buildLabourSnapshot(shifts, timesheets, rosters, teams);

    // Placeholder revenue — will be replaced when BEPOZ/H&L is connected
    // For now we use a reasonable estimate so labour % renders
    const placeholderRevenue = 0;
    labour = enrichLabourWithRevenue(labour, placeholderRevenue, config);

    const insights = buildInsights(labour, config);
    const now = new Date();

    // ── 5. Return dashboard payload ────────────────────────────────────
    return res.status(200).json({
      meta: {
        venue_id: user.id,
        venue_name: profile?.venue || 'My Venue',
        timezone: 'Australia/Melbourne',
        generated_at: now.toISOString(),
        data_as_of: now.toISOString(),
        refresh_interval_seconds: 120,
        data_sources: {
          tanda: 'live',
          pos: 'pending',        // H&L not connected yet
          sevenrooms: 'pending', // SevenRooms not connected yet
        },
      },
      targets: {
        labour_pct_warning: config.labour_warn_pct || 30,
        labour_pct_danger: config.labour_danger_pct || 35,
        cogs_pct_target: config.cogs_target_pct || 28,
        net_profit_pct_target: config.net_profit_target_pct || 18,
        avg_cover_spend_target: config.avg_cover_spend_cents || 9000,
        reservation_conversion_target: config.reservation_conversion_target || 85,
      },
      // Labour is live from Tanda
      labour,
      // KPIs — labour live, others pending POS connection
      kpis: {
        net_profit_today:  { value: 0, delta_pct: 0, status: 'pending' },
        revenue_mtd:       { value: 0, delta_pct: 0, status: 'pending' },
        covers_today:      { value: 0, delta_pct: 0, status: 'pending' },
        labour_pct_actual: { value: labour.gauge.actual_pct, status: labour.gauge.status },
        cogs_pct:          { value: 0, status: 'pending' },
      },
      // P&L pending POS
      pl: {
        hourly_chart: [],
        by_session: [],
        totals: { revenue: 0, cogs: 0, labour: labour.gauge._raw_actual_cost || 0, net_profit: 0, net_profit_pct: 0 },
      },
      // Reservations pending SevenRooms
      reservations: null,
      sections: [],
      trend: { days: [], prior_week_days: [], summary: {} },
      score: {
        overall: null,
        components: {},
      },
      insights,
    });

  } catch (err) {
    console.error('Tanda fetch error:', err.message);
    return res.status(502).json({ error: `Tanda data unavailable: ${err.message}` });
  }
}
