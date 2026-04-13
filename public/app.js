// ── State ──────────────────────────────────────────────
let allEntries = [], allUsers = [], chart = null;
let activePeriod = 0; // 0 = this month
let calYear, calMonth, calPhone = '', calData = [];
let currentDetailDate = null;
let editingFoodId = null;
let editingWeightId = null;
let historyFilter = '';

const HEBREW_MONTHS = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
const DAYS_HE = ['א׳','ב׳','ג׳','ד׳','ה׳','ו׳','ש׳'];
const USER_COLORS = ['#4f46e5','#f43f5e','#10b981','#f59e0b'];

const WORKOUT_EMOJIS = {
  'ריצה':'🏃','חדר כושר':'💪','ספינינג':'🚴','שחייה':'🏊',
  'יוגה':'🧘','הליכה':'🚶','פילאטיס':'🤸','ספורט קבוצתי':'⚽','לא אימון':'❌',
};
function workoutEmoji(t) { return WORKOUT_EMOJIS[t] || '🏋️'; }

// ── Init ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const now = new Date();
  calYear = now.getFullYear(); calMonth = now.getMonth() + 1;

  loadAll();

  function navigateTo(view) {
    document.querySelectorAll('.nav-btn, .mob-nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(`view-${view}`).classList.add('active');
    window.scrollTo(0, 0);
    if (view === 'calendar' && calPhone) loadCalendar();
  }

  document.querySelectorAll('.nav-btn, .mob-nav-btn').forEach(btn => btn.addEventListener('click', () => navigateTo(btn.dataset.view)));

  document.querySelectorAll('.btn-period').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.btn-period').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activePeriod = parseInt(btn.dataset.days);
    renderChart();
  }));

  document.getElementById('manualForm').addEventListener('submit', handleManualEntry);
  document.getElementById('calPrev').addEventListener('click', () => { calMonth--; if (calMonth<1){calMonth=12;calYear--;} loadCalendar(); });
  document.getElementById('calNext').addEventListener('click', () => { calMonth++; if (calMonth>12){calMonth=1;calYear++;} loadCalendar(); });
});

// ── Load ────────────────────────────────────────────────
async function loadAll() {
  const [stats, entries, users] = await Promise.all([
    fetch('/api/stats').then(r=>r.json()),
    fetch('/api/entries?limit=500').then(r=>r.json()),
    fetch('/api/users').then(r=>r.json()),
  ]);
  allEntries = entries; allUsers = users;
  if (users.length && !calPhone) calPhone = users[0].phone;
  renderUserSwitchers(stats);
  renderStats(stats);
  renderChart();
  renderTable();
  populateSelects();
}

// ── User Switchers ───────────────────────────────────────
function renderUserSwitchers(stats) {
  const html = allUsers.map((u, i) => {
    const s = stats.find(x => x.phone === u.phone);
    const latest = allEntries.find(e => e.user_phone === u.phone);
    const weightStr = latest ? `${latest.weight.toFixed(1)} ק"ג` : 'אין נתונים';
    const initials = u.name.slice(0, 1);
    return `<button class="user-btn" data-phone="${u.phone}" onclick="switchUser('${u.phone}')" style="--uc:${USER_COLORS[i]}">
      <div class="ub-avatar" style="background:${USER_COLORS[i]}">${initials}</div>
      <div class="ub-info">
        <div class="ub-name">${u.name}</div>
        <div class="ub-weight">${weightStr}</div>
      </div>
    </button>`;
  }).join('');

  document.getElementById('userSwitcher').innerHTML = html;
  document.getElementById('calUserSwitcher').innerHTML = html;

  // Set active
  setActiveUserBtn(calPhone);
}

function switchUser(phone) {
  calPhone = phone;
  setActiveUserBtn(phone);
  // Re-render chart filtered to this user
  renderChart();
  // If calendar is visible, reload it too
  if (document.getElementById('view-calendar').classList.contains('active')) loadCalendar();
}

function setActiveUserBtn(phone) {
  document.querySelectorAll('.user-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.phone === phone);
  });
}

// ── Stats cards ─────────────────────────────────────────
function renderStats(stats) {
  const c = document.getElementById('stats-cards');
  if (!stats.length) { c.innerHTML='<p class="empty-state">אין נתונים — שלח משקל בוואטצאפ! 📱</p>'; return; }
  c.innerHTML = stats.map(s => {
    const latest = allEntries.find(e=>e.user_phone===s.phone);
    const prev   = allEntries.filter(e=>e.user_phone===s.phone)[1];
    const diff   = latest&&prev ? (latest.weight-prev.weight).toFixed(1) : null;
    const cls    = diff>0?'up':diff<0?'down':'flat';
    const arrow  = diff>0?'⬆️':diff<0?'⬇️':'➡️';
    const diffTxt= diff!==null?`${diff>0?'+':''}${diff} ק"ג`:'מדידה ראשונה';
    let prog = '';
    if (s.target_weight&&latest) {
      const done = Math.min(100,Math.max(0,Math.abs((s.max_weight||latest.weight)-latest.weight)/Math.abs((s.max_weight||latest.weight)-s.target_weight)*100));
      prog = `<div class="meta">🎯 יעד: ${s.target_weight} ק"ג — נותרו ${Math.max(0,latest.weight-s.target_weight).toFixed(1)} ק"ג</div>
        <div class="progress-bar"><div class="progress-fill" style="width:${done}%"></div></div>`;
    }
    const lastDate = latest?new Date(latest.recorded_at).toLocaleDateString('he-IL'):'—';
    return `<div class="stat-card">
      <div class="name">👤 ${s.name}</div>
      <div class="current-weight">${latest?latest.weight.toFixed(1):'—'} <small>ק"ג</small></div>
      <div class="meta"><span class="change ${cls}">${diff!==null?arrow:''} ${diffTxt}</span>
        <span>עודכן: ${lastDate} · ${s.total_entries||0} מדידות</span></div>
      ${prog}</div>`;
  }).join('');
}

// ── Chart with workout row ───────────────────────────────
async function renderChart() {
  const now = new Date();
  let fromDate, toDate, labels;

  if (activePeriod === 0) {
    // Current month — all days
    const y = now.getFullYear(), m = now.getMonth();
    const daysInMonth = new Date(y, m+1, 0).getDate();
    fromDate = new Date(y, m, 1);
    toDate   = new Date(y, m, daysInMonth);
    labels   = Array.from({length: daysInMonth}, (_,i) => String(i + 1));
  } else {
    fromDate = new Date(); fromDate.setDate(fromDate.getDate() - activePeriod);
    toDate   = new Date();
    labels   = null; // use actual data points
  }

  const fromStr = fromDate.toISOString().slice(0,10);
  const toStr   = toDate.toISOString().slice(0,10);

  // Fetch workouts only for selected user
  const workoutsByUser = {};
  const selectedUsers = calPhone ? allUsers.filter(u => u.phone === calPhone) : allUsers;
  await Promise.all(selectedUsers.map(async u => {
    const wks = await fetch(`/api/workouts-range?phone=${u.phone}&from=${fromStr}&to=${toStr}`).then(r=>r.json());
    workoutsByUser[u.phone] = {};
    wks.forEach(w => { workoutsByUser[u.phone][w.recorded_at.slice(0,10)] = w.type; });
  }));

  const ctx = document.getElementById('weightChart').getContext('2d');
  const colors = USER_COLORS;

  let datasets;
  if (activePeriod === 0 && labels) {
    // Monthly view — plot all days, null for missing
    const y = now.getFullYear(), m = now.getMonth();
    const usersToShow = calPhone ? allUsers.filter(u => u.phone === calPhone) : allUsers;
    datasets = usersToShow.map((u, i) => {
      const colorIdx = allUsers.findIndex(x => x.phone === u.phone);
      const userEntries = allEntries.filter(e => e.user_phone === u.phone);
      const entryByDate = {};
      userEntries.forEach(e => { entryByDate[e.recorded_at.slice(0,10)] = e.weight; });
      const data = Array.from({length: labels.length}, (_,idx) => {
        const d = new Date(y, m, idx+1).toISOString().slice(0,10);
        return entryByDate[d] ?? null;
      });
      return {
        label: u.name, data,
        borderColor: colors[colorIdx], backgroundColor: colors[colorIdx]+'18',
        pointBackgroundColor: colors[colorIdx], pointRadius: 5,
        pointStyle: 'circle', pointBorderColor: '#fff', pointBorderWidth: 2,
        pointHoverRadius: 7, tension: 0.35, fill: false,
        spanGaps: false,
      };
    });
  } else {
    // Range view
    let data = [...allEntries].reverse().filter(e => {
      const inRange = new Date(e.recorded_at) >= fromDate && new Date(e.recorded_at) <= toDate;
      const inUser  = calPhone ? e.user_phone === calPhone : true;
      return inRange && inUser;
    });
    const phones = [...new Set(data.map(e=>e.user_phone))];
    datasets = phones.map((ph,i) => {
      const u = allUsers.find(u=>u.phone===ph);
      const pts = data.filter(e=>e.user_phone===ph);
      return {
        label: u?.name||ph,
        data: pts.map(e=>({x:new Date(e.recorded_at).toLocaleDateString('he-IL'),y:e.weight})),
        borderColor: colors[i], backgroundColor: colors[i]+'18',
        pointBackgroundColor: colors[i], pointRadius: 5,
        pointStyle: 'circle', pointBorderColor: '#fff', pointBorderWidth: 2,
        tension: 0.35, fill: false,
      };
    });
    labels = null;
  }

  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: 'line',
    data: { labels: labels||undefined, datasets },
    options: {
      indexAxis: 'y',
      responsive: true,
      interaction: { mode:'index', intersect:false },
      plugins: {
        legend: { labels: { color:'#1e293b', font:{size:13} } },
        tooltip: { callbacks: { label: c=>`${c.dataset.label}: ${c.parsed.x?.toFixed(1)||'—'} ק"ג` } },
      },
      scales: {
        x: {
          ticks:{ color:'#64748b', callback: v=>`${v} ק"ג` },
          grid:{ color:'#e2e8f0' },
        },
        y: {
          ticks:{
            color:'#64748b', font:{size:11},
            callback: (val, idx) => activePeriod === 0 ? (idx % 5 === 0 ? val : null) : val,
          },
          grid:{ color:'#e2e8f0' },
          reverse: false,
        },
      },
    },
  });

  // Render workout row (monthly only)
  renderWorkoutRow(activePeriod === 0 && labels ? labels : null, workoutsByUser, fromDate, toDate);
}

function renderWorkoutRow(labels, workoutsByUser, fromDate, toDate) {
  const row = document.getElementById('workoutRow');
  if (!labels) { row.innerHTML = ''; return; }

  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();

  // Collect all workout types across users
  const allWorkouts = {}; // date → [emojis]
  Object.values(workoutsByUser).forEach(byDate => {
    Object.entries(byDate).forEach(([date, type]) => {
      if (!allWorkouts[date]) allWorkouts[date] = [];
      allWorkouts[date].push(workoutEmoji(type));
    });
  });

  row.innerHTML = labels.map((lbl, idx) => {
    const dateStr = new Date(y, m, idx+1).toISOString().slice(0,10);
    const emojis  = allWorkouts[dateStr];
    return `<div class="workout-day" title="${emojis ? emojis.join(' ') : ''}">
      ${emojis ? emojis.join('') : ''}
      <span>${idx+1}</span>
    </div>`;
  }).join('');
}

// ── History ──────────────────────────────────────────────
function renderFilterBtns() {
  const container = document.getElementById('filterUserBtns');
  if (!container) return;
  const btns = [{ phone: '', name: 'כולם' }, ...allUsers.map(u => ({ phone: u.phone, name: u.name }))];
  container.innerHTML = btns.map(u =>
    `<button class="filter-user-btn${historyFilter === u.phone ? ' active' : ''}" onclick="setHistoryFilter('${u.phone}')">${u.name}</button>`
  ).join('');
}

function setHistoryFilter(phone) {
  historyFilter = phone;
  renderFilterBtns();
  renderTable();
}

function renderTable() {
  const c       = document.getElementById('historyTable');
  const entries = historyFilter ? allEntries.filter(e=>e.user_phone===historyFilter) : allEntries;
  if (!entries.length) { c.innerHTML='<p class="empty-state">אין רשומות</p>'; return; }
  c.innerHTML = `<div class="table-wrapper"><table>
    <thead><tr><th>שם</th><th>משקל</th><th>תאריך</th><th>שעה</th><th>הערה</th><th></th></tr></thead>
    <tbody>${entries.map((e,i)=>{
      const dt   = new Date(e.recorded_at);
      const prev = entries[i+1];
      const diff = prev&&prev.user_phone===e.user_phone?(e.weight-prev.weight).toFixed(1):null;
      const idx  = allUsers.findIndex(u=>u.phone===e.user_phone);
      const dBit = diff!==null?`<span style="color:${diff>0?'#f43f5e':'#10b981'};font-size:.8rem"> (${diff>0?'+':''}${diff})</span>`:'';
      const noteEsc = (e.note||'').replace(/'/g, "\\'");
      return `<tr>
        <td><span class="badge badge-${idx}">${e.name}</span></td>
        <td><strong>${e.weight.toFixed(1)}</strong> ק"ג ${dBit}</td>
        <td>${dt.toLocaleDateString('he-IL')}</td>
        <td>${dt.toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit'})}</td>
        <td>${e.note||'—'}</td>
        <td style="white-space:nowrap">
          <button class="btn-edit" onclick="openWeightEdit(${e.id},${e.weight},'${noteEsc}')" title="ערוך">✏️</button>
          <button class="btn-delete" onclick="deleteEntry(${e.id})">🗑️</button>
        </td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
}

function populateSelects() {
  const opts = allUsers.map(u=>`<option value="${u.phone}">${u.name}</option>`).join('');
  document.getElementById('entryUser').innerHTML = opts;
  renderFilterBtns();
}

async function handleManualEntry(e) {
  e.preventDefault();
  const res = await fetch('/api/entries',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({user_phone:document.getElementById('entryUser').value,
      weight:document.getElementById('entryWeight').value,note:document.getElementById('entryNote').value})});
  if(!res.ok){showToast('❌ שגיאה');return;}
  document.getElementById('entryWeight').value='';
  document.getElementById('entryNote').value='';
  showToast('✅ נשמר!'); await loadAll();
}
async function deleteEntry(id){if(!confirm('למחוק?'))return;await fetch(`/api/entries/${id}`,{method:'DELETE'});showToast('🗑️ נמחק');await loadAll();}

// ══════════════════════════════════════════════════════════
// CALENDAR
// ══════════════════════════════════════════════════════════
async function loadCalendar() {
  if (!calPhone) return;
  document.getElementById('calTitle').textContent = `${HEBREW_MONTHS[calMonth-1]} ${calYear}`;
  calData = await fetch(`/api/calendar?phone=${calPhone}&year=${calYear}&month=${calMonth}`).then(r=>r.json());
  renderSummaryCards();
  renderCalGrid();
  renderWeeklySummary();
}

function renderSummaryCards() {
  const weights = calData.flatMap(d=>d.weights.map(w=>w.weight));
  const totalCal = calData.reduce((s,d)=>s+(d.totalCalories||0),0);
  const daysFood = calData.filter(d=>d.foods.length).length;
  const avgWeight = weights.length?(weights.reduce((a,b)=>a+b,0)/weights.length).toFixed(1):null;
  const wChange = weights.length>=2?(weights[weights.length-1]-weights[0]).toFixed(1):null;
  const daysWkt = calData.filter(d=>d.workouts.length>0).length;
  const fullDays = calData.filter(d=>d.weights.length&&d.workouts.length&&d.foods.length).length;

  document.getElementById('summaryCards').innerHTML = [
    {icon:'⚖️',label:'ממוצע משקל',value:avgWeight?`${avgWeight} ק"ג`:'—',sub:wChange!==null?`שינוי: ${wChange>0?'+':''}${wChange} ק"ג`:'',color:wChange<0?'var(--green)':wChange>0?'var(--accent2)':'var(--text)'},
    {icon:'🏃',label:'ימי אימון',value:daysWkt,sub:`מתוך ${new Date(calYear,calMonth,0).getDate()} ימים`,color:'var(--blue)'},
    {icon:'🔥',label:'ממוצע קלוריות',value:daysFood?Math.round(totalCal/daysFood).toLocaleString():'—',sub:totalCal?`סה"כ: ${totalCal.toLocaleString()} קל`:'',color:'var(--yellow)'},
    {icon:'✅',label:'ימים מלאים',value:fullDays,sub:'משקל + אימון + אכילה',color:'var(--green)'},
  ].map(s=>`<div class="summary-card"><div class="sc-label">${s.icon} ${s.label}</div><div class="sc-value" style="color:${s.color}">${s.value}</div><div class="sc-sub">${s.sub}</div></div>`).join('');
}

function renderCalGrid() {
  const firstDay = new Date(calYear,calMonth-1,1).getDay();
  const daysInMonth = new Date(calYear,calMonth,0).getDate();
  const todayStr = new Date().toISOString().slice(0,10);
  const byDate = {}; calData.forEach(d=>byDate[d.date]=d);
  let html = DAYS_HE.map(d=>`<div class="cal-day-header">${d}</div>`).join('');
  for(let i=0;i<firstDay;i++) html+=`<div class="cal-day empty"></div>`;
  for(let day=1;day<=daysInMonth;day++){
    const ds=`${calYear}-${String(calMonth).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const d=byDate[ds]; const isToday=ds===todayStr;
    const isFull=d&&d.weights.length&&d.workouts.length&&d.foods.length;
    let chips='';
    if(d){
      if(d.weights.length)  chips+=`<div class="day-chip chip-weight">⚖️ ${d.weights[0].weight.toFixed(1)}</div>`;
      if(d.workouts.length) chips+=`<div class="day-chip chip-workout">${workoutEmoji(d.workouts[0].type)} ${d.workouts[0].type}</div>`;
      if(d.totalCalories)   chips+=`<div class="day-chip chip-cal">🔥 ${d.totalCalories} קל</div>`;
    }
    const cls=['cal-day',d?'has-data':'',isFull?'full-day':'',isToday?'today':''].filter(Boolean).join(' ');
    html+=`<div class="${cls}" ${d?`onclick="showDayDetail('${ds}')"`:''}><div class="day-num${isToday?' today-num':''}">${day}</div>${chips}</div>`;
  }
  document.getElementById('calGrid').innerHTML=html;
}

function renderWeeklySummary() {
  const daysInMonth=new Date(calYear,calMonth,0).getDate();
  const byDate={}; calData.forEach(d=>byDate[d.date]=d);
  const weeks=[]; let week=[];
  const firstDow=new Date(calYear,calMonth-1,1).getDay();
  for(let p=0;p<firstDow;p++) week.push(null);
  for(let day=1;day<=daysInMonth;day++){
    const ds=`${calYear}-${String(calMonth).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    week.push(byDate[ds]||null);
    if(week.length===7){weeks.push(week);week=[];}
  }
  if(week.length) weeks.push(week);
  const old=document.getElementById('weeklySummary'); if(old) old.remove();
  const sec=document.createElement('div'); sec.id='weeklySummary';
  sec.innerHTML=`<h3 class="section-title">📊 סיכום שבועי</h3><div class="weekly-grid">${
    weeks.map((w,i)=>{
      const days=w.filter(Boolean); if(!days.length) return '';
      const wts=days.flatMap(d=>d.weights.map(x=>x.weight));
      const wkts=days.filter(d=>d.workouts.length).length;
      const cals=days.reduce((s,d)=>s+(d.totalCalories||0),0);
      const avgW=wts.length?(wts.reduce((a,b)=>a+b,0)/wts.length).toFixed(1):null;
      const chg=wts.length>=2?(wts[wts.length-1]-wts[0]).toFixed(1):null;
      const nums=days.map(d=>parseInt(d.date.slice(-2)));
      const range=nums.length?`${Math.min(...nums)}–${Math.max(...nums)} ${HEBREW_MONTHS[calMonth-1]}`:'';
      return `<div class="week-card"><div class="week-title">שבוע ${i+1} <span class="week-range">${range}</span></div>
        <div class="week-stats">
          ${avgW?`<div class="ws"><span class="ws-icon">⚖️</span><span class="ws-val">${avgW}</span><span class="ws-lbl">${chg!==null?(chg>0?'↑':'↓')+Math.abs(chg):''}</span></div>`:''}
          <div class="ws"><span class="ws-icon">🏃</span><span class="ws-val">${wkts}</span><span class="ws-lbl">אימונים</span></div>
          ${cals?`<div class="ws"><span class="ws-icon">🔥</span><span class="ws-val">${cals.toLocaleString()}</span><span class="ws-lbl">קל</span></div>`:''}
        </div></div>`;
    }).filter(Boolean).join('')
  }</div>`;
  document.getElementById('view-calendar').appendChild(sec);
}

// ── Day detail ────────────────────────────────────────────
function navigateDay(dir) {
  const daysInMonth=new Date(calYear,calMonth,0).getDate();
  const cur=parseInt(currentDetailDate.slice(-2));
  const next=cur+dir;
  if(next<1||next>daysInMonth) return;
  showDayDetail(`${calYear}-${String(calMonth).padStart(2,'0')}-${String(next).padStart(2,'0')}`);
}

function showDayDetail(dateStr) {
  currentDetailDate=dateStr;
  const daysInMonth=new Date(calYear,calMonth,0).getDate();
  const dayNum=parseInt(dateStr.slice(-2));
  document.getElementById('btnPrevDay').disabled=dayNum<=1;
  document.getElementById('btnNextDay').disabled=dayNum>=daysInMonth;
  const d=calData.find(x=>x.date===dateStr);
  const dt=new Date(dateStr+'T12:00:00');
  document.getElementById('dayDetailTitle').textContent=dt.toLocaleDateString('he-IL',{weekday:'long',day:'numeric',month:'long'});
  let html='';
  if(d){
    if(d.weights.length) html+=`<div class="detail-section"><h4>⚖️ משקל</h4>${
      d.weights.map(w=>`<div class="detail-item"><span class="di-label">${new Date(w.time).toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit'})}</span><span class="di-value">${w.weight.toFixed(1)} ק"ג</span></div>`).join('')}</div>`;
    if(d.workouts.length) html+=`<div class="detail-section"><h4>🏃 אימונים</h4>${
      d.workouts.map(w=>`<div class="detail-item"><span class="di-label">${workoutEmoji(w.type)} ${w.type}</span><span style="color:var(--muted);font-size:.85rem">${w.description||''}</span></div>`).join('')}</div>`;
    if(d.foods.length) html+=`<div class="detail-section"><h4>🍽️ אכילה</h4>${
      d.foods.map(f=>`<div class="detail-item">
        <span class="di-label">${f.description}</span>
        <span class="di-value">${f.calories?f.calories+' קל':''}</span>
        <div class="di-actions">
          <button class="btn-edit" onclick="openFoodEdit(${f.id},'${encodeURIComponent(f.description)}',${f.calories||0})" title="ערוך">✏️</button>
          <button class="btn-delete" onclick="deleteFoodEntry(${f.id},'${dateStr}')" title="מחק">🗑️</button>
        </div>
      </div>`).join('')}
      ${d.totalCalories?`<div class="food-total">🔥 סה"כ יום: ${d.totalCalories.toLocaleString()} קלוריות</div>`:''}
    </div>`;
  }
  if(!html) html='<p class="empty-state">אין נתונים ליום זה 📭</p>';
  document.getElementById('dayDetailBody').innerHTML=html;
  document.getElementById('dayDetail').classList.remove('hidden');
  document.getElementById('dayDetail').scrollIntoView({behavior:'smooth',block:'nearest'});
}

function closeDayDetail(){ document.getElementById('dayDetail').classList.add('hidden'); }

// ── Food edit modal ───────────────────────────────────────
function openFoodEdit(id, descEncoded, cal) {
  editingFoodId=id;
  document.getElementById('foodEditDesc').value=decodeURIComponent(descEncoded);
  document.getElementById('foodEditCal').value=cal;
  document.getElementById('foodModal').classList.remove('hidden');
}
function closeFoodModal(){ document.getElementById('foodModal').classList.add('hidden'); editingFoodId=null; }

async function saveFoodEdit() {
  if(!editingFoodId) return;
  const desc=document.getElementById('foodEditDesc').value.trim();
  const cal =parseInt(document.getElementById('foodEditCal').value)||0;
  await fetch(`/api/food/${editingFoodId}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({description:desc,calories:cal})});
  closeFoodModal(); showToast('✅ עודכן!');
  await loadCalendar();
  if(currentDetailDate) showDayDetail(currentDetailDate);
}

// ── Weight edit modal ─────────────────────────────────────
function openWeightEdit(id, weight, note) {
  editingWeightId = id;
  document.getElementById('weightEditVal').value = weight;
  document.getElementById('weightEditNote').value = note || '';
  document.getElementById('weightModal').classList.remove('hidden');
}
function closeWeightModal() { document.getElementById('weightModal').classList.add('hidden'); editingWeightId = null; }

async function saveWeightEdit() {
  if (!editingWeightId) return;
  const weight = parseFloat(document.getElementById('weightEditVal').value);
  const note   = document.getElementById('weightEditNote').value.trim();
  if (isNaN(weight)) { showToast('❌ משקל לא תקין'); return; }
  await fetch(`/api/entries/${editingWeightId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ weight, note }) });
  closeWeightModal();
  showToast('✅ עודכן!');
  await loadAll();
}

async function deleteFoodEntry(id, dateStr) {
  if(!confirm('למחוק?')) return;
  await fetch(`/api/food/${id}`,{method:'DELETE'});
  showToast('🗑️ נמחק'); await loadCalendar();
  if(currentDetailDate) showDayDetail(currentDetailDate);
}

// ── Toast ─────────────────────────────────────────────────
function showToast(msg){
  const t=document.getElementById('toast');
  t.textContent=msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),2800);
}
