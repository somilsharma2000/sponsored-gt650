/* The Chrome Canvas — app logic */
const API_BASE = 'https://base44.app/api/apps/6a925ce0591b907d7e7f14d1/functions';
const CAMPAIGN_END = new Date('2026-10-05T23:59:59+05:30').getTime();
let campaignData = null;
let selectedPosition = null;
let holdDeadline = null;

/* 21 positions mapped to hotspots on the bike + rider SVG */
const SLOT_MAP = {
  1:  { x: 480, y: 228, w: 128, h: 52, label: 'THE TANK', tier: 'crown' },
  2:  { x: 738, y: 196, w: 78,  h: 46, label: 'HEADLIGHT', tier: 'founding' },
  3:  { x: 300, y: 213, w: 78,  h: 40, label: 'SEAT COWL', tier: 'founding' },
  4:  { x: 560, y: 292, w: 78,  h: 46, label: 'SIDE PANEL', tier: 'founding' },
  5:  { x: 246, y: 268, w: 78,  h: 46, label: 'REAR PANEL', tier: 'founding' },
  20: { x: 393, y: 133, w: 52,  h: 48, label: 'HELMET', tier: 'founding' },
  6:  { x: 726, y: 246, w: 92,  h: 30, label: 'FR. FENDER', tier: 'standard' },
  7:  { x: 122, y: 248, w: 92,  h: 30, label: 'RR. FENDER', tier: 'standard' },
  8:  { x: 652, y: 282, w: 46,  h: 72, label: 'FORK', tier: 'standard' },
  9:  { x: 542, y: 302, w: 68,  h: 52, label: 'ENGINE', tier: 'standard' },
  10: { x: 372, y: 342, w: 84,  h: 26, label: 'EXHAUST 1', tier: 'standard' },
  11: { x: 270, y: 344, w: 84,  h: 26, label: 'EXHAUST 2', tier: 'standard' },
  12: { x: 308, y: 376, w: 82,  h: 26, label: 'SWINGARM', tier: 'standard' },
  13: { x: 398, y: 296, w: 52,  h: 44, label: 'AIRBOX', tier: 'standard' },
  14: { x: 598, y: 238, w: 56,  h: 28, label: 'FRAME', tier: 'standard' },
  15: { x: 792, y: 252, w: 56,  h: 30, label: 'LAMP RIM', tier: 'standard' },
  16: { x: 676, y: 168, w: 52,  h: 30, label: 'MIRROR', tier: 'community' },
  17: { x: 262, y: 292, w: 50,  h: 26, label: 'TAILLIGHT', tier: 'community' },
  18: { x: 96,  y: 282, w: 48,  h: 30, label: 'PLATE', tier: 'community' },
  19: { x: 758, y: 336, w: 50,  h: 30, label: 'CALIPER', tier: 'community' },
  21: { x: 420, y: 190, w: 56,  h: 40, label: 'JACKET', tier: 'community' }
};

const formatINR = n => '₹' + Number(n || 0).toLocaleString('en-IN');
const esc = s => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function showToast(msg, type) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show ' + (type || '');
  t.style.display = 'block';
  clearTimeout(t._hide);
  t._hide = setTimeout(() => { t.style.display = 'none'; }, 4200);
}

/* ---------- CANVAS RENDER ---------- */
function renderSlots() {
  const group = document.getElementById('slotsGroup');
  group.innerHTML = '';
  if (!campaignData || !campaignData.positions) return;
  const soldMap = {};
  (campaignData.leaderboard || []).forEach(lb => { if (lb.positionNumber) soldMap[lb.positionNumber] = lb.brandName; });

  campaignData.positions.forEach(p => {
    const geo = SLOT_MAP[p.positionNumber];
    if (!geo) return;
    const state = p.positionState || 'available';
    const cls = state === 'sold' ? 'sold' : state === 'hold' ? 'hold' : 'available';
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'slot ' + cls);
    g.dataset.pos = p.positionNumber;

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', geo.x); rect.setAttribute('y', geo.y);
    rect.setAttribute('width', geo.w); rect.setAttribute('height', geo.h);
    rect.setAttribute('rx', 9);
    rect.setAttribute('class', 'slot-rect tier-' + geo.tier);
    g.appendChild(rect);

    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', geo.x + geo.w / 2);
    label.setAttribute('y', geo.y + (state === 'available' ? 20 : 15));
    label.setAttribute('class', 'slot-label');
    label.textContent = geo.label;
    g.appendChild(label);

    const sub = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    sub.setAttribute('x', geo.x + geo.w / 2);
    sub.setAttribute('y', geo.y + geo.h - 7);
    sub.setAttribute('class', 'slot-price');
    sub.textContent = state === 'sold' ? (soldMap[p.positionNumber] ? esc(soldMap[p.positionNumber]) : 'SOLD')
      : state === 'hold' ? 'ON HOLD'
      : formatINR(p.price);
    g.appendChild(sub);

    if (state === 'sold' || state === 'hold') {
      const tag = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      tag.setAttribute('x', geo.x + geo.w / 2); tag.setAttribute('y', geo.y + 28);
      tag.setAttribute('class', 'status-tag');
      tag.setAttribute('fill', state === 'hold' ? '#d4af37' : '#34d399');
      tag.textContent = state === 'hold' ? '⏳ HELD' : '✓ ON THE CANVAS';
      g.appendChild(tag);
    }

    g.addEventListener('click', () => {
      if (state === 'sold') { showToast('That spot is taken — the canvas fills fast.', 'error'); return; }
      if (state === 'hold') { showToast('Held by another brand right now. Check back shortly.', 'error'); return; }
      openSponsorModal(p);
    });
    group.appendChild(g);
  });
}

/* ---------- DATA ---------- */
async function fetchStats() {
  try {
    const res = await fetch(API_BASE + '/getCampaignStats');
    const data = await res.json();
    if (data.error) return;
    campaignData = data;
    renderSlots();
    renderHeroStats();
    renderFund();
    renderLeaderboard();
    renderNominations();
  } catch (e) { console.error('stats fetch failed', e); }
}

function renderHeroStats() {
  const c = campaignData.campaign;
  document.getElementById('statRaised').textContent = formatINR(c.raised);
  document.getElementById('statSlots').textContent = c.positionsTaken + '/' + (c.positionsTotal || 21);
  document.getElementById('statPending').textContent = c.pendingApplications;
  const f = (campaignData.positions || []).find(p => p.tier === 'founding');
  if (f) document.querySelectorAll('.founding-price').forEach(el => el.textContent = formatINR(f.price));
}

function renderFund() {
  const c = campaignData.campaign;
  document.getElementById('fundRaised').textContent = formatINR(c.raised);
  document.getElementById('fundFill').style.width = c.progressPercent + '%';
  document.getElementById('fundPct').innerHTML = c.progressPercent + '% funded · experiment ends <strong>Oct 5, 2026</strong>';
  const r = c.raised;
  ['ms1', 'ms2', 'ms3'].forEach((id, i) => {
    const thresholds = [450000, 550000, 700000];
    document.getElementById(id).classList.toggle('reached', r >= thresholds[i]);
  });
}

function renderLeaderboard() {
  const list = document.getElementById('leaderboardList');
  const lb = campaignData.leaderboard || [];
  if (!lb.length) {
    list.innerHTML = '<p style="color:var(--dim); font-size:13.5px;">The canvas is fresh — no confirmed sponsors yet. The first brand on this board becomes part of the origin story.</p>';
    return;
  }
  list.innerHTML = lb.map((s, i) => `
    <div class="lb-row">
      <div class="lb-left">
        <div class="lb-rank ${i < 3 ? 'top' : ''}">${i + 1}</div>
        <div>
          <div class="lb-brand">${esc(s.brandName)}${s.category ? `<span class="lb-cat">${esc(s.category)}</span>` : ''}</div>
          <div class="lb-pos">${esc(s.position || '')}</div>
        </div>
      </div>
      <div class="lb-amt">${formatINR(s.amount)}</div>
    </div>`).join('');
}

function renderNominations() {
  const list = document.getElementById('nomList');
  const noms = campaignData.topNominations || [];
  if (!noms.length) { list.innerHTML = '<p style="color:var(--dim); font-size:12.5px;">No nominations yet — start the list.</p>'; return; }
  list.innerHTML = noms.map(n => `
    <div class="nom-row">
      <div>
        <div class="nom-brand">${esc(n.brandName)}</div>
        ${n.reason ? `<div style="font-size:11px;color:var(--dim);">${esc(n.reason)}</div>` : ''}
      </div>
      <div class="nom-votes">
        <span class="nom-count">${n.votes}</span>
        <button class="vote-btn" onclick="voteFor('${esc(n.brandName).replace(/'/g, "\\'")}')">Vote</button>
      </div>
    </div>`).join('');
}

/* ---------- COUNTDOWN ---------- */
function tickCountdowns() {
  const now = Date.now();
  const diff = CAMPAIGN_END - now;
  const daysEl = document.getElementById('statDays');
  if (diff > 0) {
    const d = Math.ceil(diff / 86400000);
    daysEl.textContent = d;
  } else {
    daysEl.textContent = '0';
  }
  if (holdDeadline) {
    const rem = holdDeadline - now;
    const el = document.getElementById('smHoldTimer');
    if (rem > 0) {
      const m = Math.floor(rem / 60000), s = Math.floor(rem % 60000 / 1000);
      el.textContent = `${m}:${String(s).padStart(2, '0')}`;
    } else { el.textContent = 'expired'; el.style.color = '#ef4444'; }
  }
}

/* ---------- MODALS ---------- */
function openSponsorModal(position) {
  selectedPosition = position;
  const geo = SLOT_MAP[position.positionNumber];
  document.getElementById('smTitle').textContent = 'Claim: ' + (geo ? geo.label : position.displayLabel);
  document.getElementById('saAmount').textContent = formatINR(position.price);
  document.getElementById('smForm').style.display = 'block';
  document.getElementById('smSuccess').style.display = 'none';
  document.getElementById('smHoldBanner').style.display = 'none';
  holdDeadline = null;
  document.getElementById('sponsorModal').classList.add('active');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
  if (id === 'sponsorModal') { holdDeadline = null; selectedPosition = null; }
}

function claimPosition(posNum) {
  const p = (campaignData.positions || []).find(p => p.positionNumber === posNum);
  if (!p) { showToast('Position not found — refresh the page.', 'error'); return; }
  if (p.positionState === 'sold') { showToast('The Tank is taken.', 'error'); return; }
  if (p.positionState === 'hold') { showToast('The Tank is held by another brand right now.', 'error'); return; }
  openSponsorModal(p);
}

function claimFirstAvailable(tier) {
  const p = (campaignData.positions || []).find(p => p.tier === tier && (p.positionState === 'available' || p.isAvailable));
  if (!p) { showToast('No ' + tier + ' slots left — the canvas fills fast.', 'error'); return; }
  openSponsorModal(p);
}

/* ---------- SUBMISSIONS ---------- */
async function submitApplication(e) {
  e.preventDefault();
  const btn = document.getElementById('saSubmitBtn');
  btn.disabled = true; btn.textContent = 'Holding position…';
  try {
    const res = await fetch(API_BASE + '/submitSponsorApplication', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        brandName: document.getElementById('saBrand').value,
        contactName: document.getElementById('saContact').value,
        contactEmail: document.getElementById('saEmail').value,
        contactPhone: document.getElementById('saPhone').value,
        website: document.getElementById('saWebsite').value,
        category: document.getElementById('saCategory').value,
        founderMessage: document.getElementById('saMessage').value,
        positionNumber: selectedPosition.positionNumber,
        tier: selectedPosition.tier
      })
    });
    const data = await res.json();
    if (!data.success) { showToast(data.error || 'Could not hold the position.', 'error'); btn.disabled = false; btn.innerHTML = 'Hold This Position — <span id="saAmount"></span>'; document.getElementById('saAmount').textContent = formatINR(selectedPosition.price); return; }
    holdDeadline = new Date(data.holdExpiry).getTime();
    document.getElementById('smHoldBanner').style.display = 'flex';
    document.getElementById('smForm').style.display = 'none';
    document.getElementById('smSuccess').style.display = 'block';
    document.getElementById('smSuccessMsg').textContent = data.message || 'Position held for 30 minutes.';
    document.getElementById('smTrackingId').textContent = data.trackingId;
    document.getElementById('smNextSteps').innerHTML = (data.nextSteps || []).map(s => '<li>' + esc(s) + '</li>').join('');
    showToast('Position held! Invoice on its way.', 'success');
    fetchStats();
  } catch (err) {
    showToast('Network error — please try again.', 'error');
  }
  btn.disabled = false;
  btn.innerHTML = 'Hold This Position — <span id="saAmount"></span>';
  if (selectedPosition) document.getElementById('saAmount').textContent = formatINR(selectedPosition.price);
}

async function submitNomination(e) {
  e.preventDefault();
  try {
    const res = await fetch(API_BASE + '/nominateBrand', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        brandName: document.getElementById('nomBrand').value,
        brandWebsite: document.getElementById('nomSite').value,
        nominatorName: document.getElementById('nomName').value,
        nominatorEmail: document.getElementById('nomEmail').value,
        reason: document.getElementById('nomReason').value
      })
    });
    const data = await res.json();
    if (!data.success) { showToast(data.error || 'Nomination failed.', 'error'); return; }
    showToast(data.message || 'Recorded!', 'success');
    document.getElementById('nomForm').reset();
    fetchStats();
  } catch (err) { showToast('Network error — please try again.', 'error'); }
}

async function voteFor(brandName) {
  try {
    const res = await fetch(API_BASE + '/nominateBrand', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brandName: brandName })
    });
    const data = await res.json();
    if (!data.success) { showToast(data.error || 'Vote failed.', 'error'); return; }
    showToast(data.message || 'Vote added!', 'success');
    fetchStats();
  } catch (err) { showToast('Network error — please try again.', 'error'); }
}

/* ---------- FAQ ---------- */
function toggleFaq(el) {
  const item = el.parentElement;
  const ans = item.querySelector('.faq-a');
  const isOpen = item.classList.contains('open');
  document.querySelectorAll('.faq-item.open').forEach(i => { i.classList.remove('open'); i.querySelector('.faq-a').style.maxHeight = 0; });
  if (!isOpen) { item.classList.add('open'); ans.style.maxHeight = ans.scrollHeight + 'px'; }
}

/* ---------- INIT ---------- */
(async function init() {
  try {
    fetch(API_BASE + '/trackActivity', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activityType: 'page_view', source: 'website', pagePath: location.pathname })
    }).catch(() => {});
  } catch (e) {}
  await fetchStats();
  tickCountdowns();
  setInterval(tickCountdowns, 1000);
  setInterval(fetchStats, 30000);
})();
