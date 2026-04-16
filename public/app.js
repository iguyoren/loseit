// ── State ──────────────────────────────────────────────
let allEntries = [], allUsers = [], allFoodEntries = [], chart = null;
let activePeriod = 0; // 0 = this month
let calYear, calMonth, calPhone = '', calData = [];
let currentDetailDate = null;
let editingFoodId = null;
let editingWeightId = null;
let historyFilter = '';
let historyType = 'weight'; // 'weight' | 'food'

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
    if (view === 'logs') loadLogs();
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
  // Load food for all users
  const foodPromises = users.map(u => fetch(`/api/food?phone=${u.phone}&limit=500`).then(r=>r.json()).then(foods=>foods.map(f=>({...f,name:u.name}))));
  const foodArrays = await Promise.all(foodPromises);
  allFoodEntries = foodArrays.flat().sort((a,b)=>b.recorded_at.localeCompare(a.recorded_at));
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
    const avatarHtml = `<div class="ub-avatar" style="background:${USER_COLORS[i]}">
      <img src="/images/${u.phone}.png" class="ub-photo"
        onerror="this.style.display='none'"
        onload="this.parentElement.querySelector('.ub-initials').style.display='none'" />
      <span class="ub-initials">${initials}</span>
    </div>`;
    return `<button class="user-btn" data-phone="${u.phone}" onclick="switchUser('${u.phone}')" style="--uc:${USER_COLORS[i]}">
      ${avatarHtml}
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
  document.querySelectorAll('.stat-card[data-phone]').forEach(c => {
    c.classList.toggle('active', c.dataset.phone === phone);
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
    const idx2 = allUsers.findIndex(u => u.phone === s.phone);
    const color2 = USER_COLORS[idx2] || USER_COLORS[0];
    const initials2 = s.name.slice(0, 1);
    return `<div class="stat-card" data-phone="${s.phone}" onclick="switchUser('${s.phone}')" style="--uc:${color2}">
      <div class="name">
        <div class="sc-avatar" style="background:${color2}">
          <img src="/images/${s.phone}.png" class="sc-photo"
            onerror="this.style.display='none'"
            onload="this.parentElement.querySelector('.sc-initials').style.display='none'" />
          <span class="sc-initials">${initials2}</span>
        </div>
        ${s.name}
      </div>
      <div class="current-weight">${latest?latest.weight.toFixed(1):'—'} <small>ק"ג</small></div>
      <div class="meta"><span class="change ${cls}">${diff!==null?arrow:''} ${diffTxt}</span>
        <span>עודכן: ${lastDate} · ${s.total_entries||0} מדידות</span></div>
      ${prog}</div>`;
  }).join('');
  // Sync active state after rendering
  setActiveUserBtn(calPhone);
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
    // labels = "1/4", "2/4", ...
    labels = Array.from({length: daysInMonth}, (_,i) => `${i+1}/${m+1}`);
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
      // allEntries מסודר מהחדש לישן — לוקחים רק את הראשון (=הכי עדכני) לכל יום
      userEntries.forEach(e => {
        const d = e.recorded_at.slice(0,10);
        if (entryByDate[d] === undefined) entryByDate[d] = e.weight;
      });
      const data = Array.from({length: labels.length}, (_,idx) => {
        const d = `${y}-${String(m+1).padStart(2,'0')}-${String(idx+1).padStart(2,'0')}`;
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

  // חישוב טווח ציר Y אוטומטי לפי הנתונים
  const allWeights = datasets.flatMap(ds =>
    Array.isArray(ds.data)
      ? ds.data.filter(v => v !== null && typeof v === 'number')
      : ds.data.map(p => p.y).filter(v => v != null)
  );
  const yMin = allWeights.length ? Math.floor(Math.min(...allWeights) - 2) : 40;
  const yMax = allWeights.length ? Math.ceil(Math.max(...allWeights)  + 2) : 120;

  chart = new Chart(ctx, {
    type: 'line',
    data: { labels: labels||undefined, datasets },
    options: {
      indexAxis: 'y',
      responsive: true,
      interaction: { mode:'index', intersect:false },
      plugins: {
        legend: { labels: { color:'#1e293b', font:{size:13} } },
        tooltip: { callbacks: {
          label: c => `${c.dataset.label}: ${(c.parsed.x ?? c.parsed.y)?.toFixed(1) || '—'} ק"ג`
        }},
      },
      scales: {
        x: {
          min: yMin, max: yMax,
          ticks:{ color:'#64748b', callback: v=>`${v} ק"ג` },
          grid:{ color:'#e2e8f0' },
        },
        y: {
          reverse: true,
          ticks:{
            color:'#64748b', font:{size:11},
            callback: (val, idx) => activePeriod === 0 ? labels[idx] : val,
          },
          grid:{ color:'#e2e8f0' },
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
    const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(idx+1).padStart(2,'0')}`;
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
  const c = document.getElementById('historyTable');

  // Merge weight + food entries sorted by date desc
  const weights = (historyFilter ? allEntries.filter(e=>e.user_phone===historyFilter) : allEntries)
    .map(e => ({ ...e, _type: 'weight' }));
  const foods = (historyFilter ? allFoodEntries.filter(e=>e.user_phone===historyFilter) : allFoodEntries)
    .map(e => ({ ...e, _type: 'food' }));

  const merged = [...weights, ...foods].sort((a,b) => b.recorded_at.localeCompare(a.recorded_at));

  if (!merged.length) { c.innerHTML='<p class="empty-state">אין רשומות</p>'; return; }

  // For weight diff calculation
  const weightByUser = {};

  c.innerHTML = `<div class="table-wrapper"><table>
    <thead><tr><th>שם</th><th>סוג</th><th>פרטים</th><th>תאריך</th><th>שעה</th><th>מקור</th><th></th></tr></thead>
    <tbody>${merged.map(e => {
      const dt  = new Date(e.recorded_at);
      const idx = allUsers.findIndex(u=>u.phone===e.user_phone);
      const srcLabel = e.raw_message
        ? `<span class="src-badge src-bot">📱 בוט</span>`
        : `<span class="src-badge src-manual">🖥️ ידני</span>`;

      if (e._type === 'weight') {
        const prev = weightByUser[e.user_phone];
        const diff = prev !== undefined ? (e.weight - prev).toFixed(1) : null;
        weightByUser[e.user_phone] = e.weight;
        const dBit = diff !== null
          ? `<span style="color:${diff>0?'#f43f5e':'#10b981'};font-size:.8rem"> (${diff>0?'+':''}${diff})</span>` : '';
        return `<tr>
          <td><span class="badge badge-${idx}">${e.name}</span></td>
          <td><span class="type-badge type-weight">⚖️ משקל</span></td>
          <td><strong>${e.weight.toFixed(1)}</strong> ק"ג ${dBit}</td>
          <td>${dt.toLocaleDateString('he-IL')}</td>
          <td>${dt.toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit'})}</td>
          <td>${srcLabel}</td>
          <td style="white-space:nowrap">
            <button class="btn-edit" onclick="openWeightEditById(${e.id})" title="ערוך">✏️</button>
            <button class="btn-delete" onclick="deleteEntry(${e.id})">🗑️</button>
          </td>
        </tr>`;
      } else {
        return `<tr>
          <td><span class="badge badge-${idx}">${e.name}</span></td>
          <td><span class="type-badge type-food">🍽️ אכילה</span></td>
          <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${displayDesc(e.description)}">${displayDesc(e.description)}${e.calories?` <span style="color:var(--muted);font-size:.8rem">(${e.calories} קל)</span>`:''}</td>
          <td>${dt.toLocaleDateString('he-IL')}</td>
          <td>${dt.toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit'})}</td>
          <td>${srcLabel}</td>
          <td style="white-space:nowrap">
            <button class="btn-edit" onclick="openFoodEdit(${e.id},'${encodeURIComponent(e.description)}',${e.calories||0})" title="ערוך">✏️</button>
            <button class="btn-delete" onclick="deleteFoodFromHistory(${e.id})">🗑️</button>
          </td>
        </tr>`;
      }
    }).join('')}</tbody></table></div>`;
}

async function deleteFoodFromHistory(id) {
  await fetch(`/api/food/${id}`, {method:'DELETE'});
  allFoodEntries = allFoodEntries.filter(e=>e.id!==id);
  renderFoodTable(document.getElementById('historyTable'));
  showToast('🗑️ נמחק');
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
    const cls=['cal-day',d?'has-data':'clickable-day',isFull?'full-day':'',isToday?'today':''].filter(Boolean).join(' ');
    html+=`<div class="${cls}" onclick="showDayDetail('${ds}')"><div class="day-num${isToday?' today-num':''}">${day}</div>${chips}</div>`;
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
      d.weights.map(w=>`<div class="detail-item"><span class="di-label">${new Date(w.time).toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit'})}</span><span class="di-value">${w.weight.toFixed(1)} ק"ג</span></div>
        ${w.note?`<div class="weight-note">📝 ${w.note.replace(/\n/g,' · ')}</div>`:''}`).join('')}</div>`;
    if(d.workouts.length) html+=`<div class="detail-section"><h4>🏃 אימונים</h4>${
      d.workouts.map(w=>`<div class="detail-item"><span class="di-label">${workoutEmoji(w.type)} ${w.type}</span><span style="color:var(--muted);font-size:.85rem">${w.description||''}</span></div>`).join('')}</div>`;
    html+=`<div class="detail-section"><h4>🍽️ אכילה</h4>${buildInlineFoodPanel(dateStr, d.foods)}</div>`;
  } else {
    html=`<div class="detail-section"><h4>🍽️ אכילה</h4>${buildInlineFoodPanel(dateStr, [])}</div>`;
  }
  document.getElementById('dayDetailBody').innerHTML=html;
  document.getElementById('dayDetail').classList.remove('hidden');
  document.getElementById('dayDetail').scrollIntoView({behavior:'smooth',block:'nearest'});
}

function closeDayDetail(){ document.getElementById('dayDetail').classList.add('hidden'); }

// ── Inline food editing in day detail ────────────────────
let dayFoodRows = [];   // [{ desc, cal, foodId|null }]
let dayFoodPhone = '';
let dayFoodDate  = '';

function buildInlineFoodPanel(dateStr, foods) {
  dayFoodDate  = dateStr;
  dayFoodPhone = calPhone;

  // Flatten all food entries into rows
  dayFoodRows = [];
  foods.forEach(f => {
    const items = parseFoodDesc(f.description);
    if (items.length === 0) items.push({ desc: f.description, cal: f.calories || 0 });
    items.forEach(it => dayFoodRows.push({ desc: it.desc, cal: it.cal, foodId: f.id }));
  });

  return renderInlineFoodHTML();
}

function renderInlineFoodHTML() {
  const total = dayFoodRows.reduce((s, r) => s + (parseInt(r.cal) || 0), 0);
  const rows  = dayFoodRows.map((r, i) => `
    <div class="ifl-row" id="ifl-row-${i}">
      <input class="ifl-desc" type="text" value="${r.desc.replace(/"/g,'&quot;')}"
        oninput="dayFoodRows[${i}].desc=this.value; refreshFoodTotal()"
        placeholder="תיאור" />
      <div class="ifl-cal-wrap">
        <input class="ifl-cal" type="number" value="${r.cal||''}" min="0" max="9999"
          oninput="dayFoodRows[${i}].cal=parseInt(this.value)||0; refreshFoodTotal()"
          placeholder="קל׳" id="ifl-cal-${i}" />
        <button class="btn-calc-cal" onclick="estimateOneRow(${i})" title="חשב קלוריות">🔍</button>
      </div>
      <button class="btn-remove-item" onclick="removeDayFoodRow(${i})">✕</button>
    </div>`).join('');

  return `<div id="inlineFoodPanel">
    <div class="ifl-header"><span>פריט</span><span>קל׳</span><span></span></div>
    <div id="iflRows">${rows}</div>
    <div class="ifl-actions-row">
      <button class="btn-add-item" onclick="addDayFoodRow()">+ הוסף שורה</button>
      <button class="btn-calc-all" onclick="estimateAllRows()">🔍 חשב קלוריות לכולם</button>
    </div>
    <div class="food-total" style="margin-top:10px">🔥 סה"כ יום: <span id="dayFoodTotal">${total}</span> קלוריות</div>
    <div style="text-align:left;margin-top:10px">
      <button class="btn-primary" style="font-size:.85rem;padding:8px 24px" onclick="saveDayFood()">שמור</button>
    </div>
  </div>`;
}

function refreshFoodTotal() {
  const total = dayFoodRows.reduce((s, r) => s + (parseInt(r.cal) || 0), 0);
  const el = document.getElementById('dayFoodTotal');
  if (el) el.textContent = total;
}

async function estimateOneRow(i) {
  const desc = dayFoodRows[i].desc.trim();
  if (!desc) return;
  const btn = document.querySelector(`#ifl-row-${i} .btn-calc-cal`);
  if (btn) { btn.textContent = '⏳'; btn.disabled = true; }
  try {
    const r = await fetch('/api/estimate', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ text: desc })
    });
    const data = await r.json();
    const cal = data.total || 0;
    const b = data.breakdown?.[0];
    const notFound = !data.total && data.breakdown?.every(b => b.cal === 0);
    const fromOnline = b?.source === 'online';
    dayFoodRows[i].cal = cal;
    const input = document.getElementById(`ifl-cal-${i}`);
    if (input) {
      input.value = cal;
      if (notFound) {
        input.classList.add('ifl-cal-unknown');
        input.title = 'לא זוהה — הכנס ידנית';
        setTimeout(() => { input.classList.remove('ifl-cal-unknown'); input.title=''; }, 2500);
        showToast(`❓ "${desc}" לא זוהה — הכנס ידנית`);
      } else if (fromOnline) {
        input.classList.add('ifl-cal-online');
        input.title = `מקור: foodsdictionary.co.il (${b.note})`;
        setTimeout(() => { input.classList.remove('ifl-cal-online'); input.title=''; }, 1200);
      } else {
        input.classList.add('ifl-cal-updated');
        setTimeout(() => input.classList.remove('ifl-cal-updated'), 800);
      }
    }
    refreshFoodTotal();
  } catch(e) { showToast('❌ שגיאה בחישוב'); }
  if (btn) { btn.textContent = '🔍'; btn.disabled = false; }
}

async function estimateAllRows() {
  const btn = document.querySelector('.btn-calc-all');
  if (btn) { btn.textContent = '⏳ מחשב...'; btn.disabled = true; }
  for (let i = 0; i < dayFoodRows.length; i++) {
    if (dayFoodRows[i].desc.trim()) await estimateOneRow(i);
  }
  if (btn) { btn.textContent = '🔍 חשב קלוריות לכולם'; btn.disabled = false; }
  showToast('✅ חישוב הושלם');
}

function addDayFoodRow() {
  dayFoodRows.push({ desc: '', cal: 0, foodId: null });
  const panel = document.getElementById('inlineFoodPanel');
  if (!panel) return;
  const i = dayFoodRows.length - 1;
  const div = document.createElement('div');
  div.className = 'ifl-row';
  div.id = `ifl-row-${i}`;
  div.innerHTML = `
    <input class="ifl-desc" type="text" value=""
      oninput="dayFoodRows[${i}].desc=this.value; refreshFoodTotal()"
      placeholder="תיאור" />
    <input class="ifl-cal" type="number" value="" min="0" max="9999"
      oninput="dayFoodRows[${i}].cal=parseInt(this.value)||0; refreshFoodTotal()"
      placeholder="קל׳" />
    <button class="btn-remove-item" onclick="removeDayFoodRow(${i})">✕</button>`;
  document.getElementById('iflRows').appendChild(div);
  div.querySelector('.ifl-desc').focus();
}

function removeDayFoodRow(i) {
  dayFoodRows.splice(i, 1);
  // Re-render the rows section
  const panel = document.getElementById('inlineFoodPanel');
  if (panel) {
    const container = document.getElementById('dayDetail');
    // Re-render the whole food section by refreshing showDayDetail
    showDayDetail(dayFoodDate);
  }
}

async function saveDayFood() {
  const validRows = dayFoodRows.filter(r => r.desc.trim());
  // Group by foodId (null = new)
  const existingIds = [...new Set(dayFoodRows.map(r => r.foodId).filter(Boolean))];

  if (validRows.length === 0) {
    // Delete all existing food entries for the day
    for (const id of existingIds) {
      await fetch(`/api/food/${id}`, { method: 'DELETE' });
    }
  } else {
    const desc = buildFoodDesc(validRows);
    const cal  = validRows.reduce((s, r) => s + (parseInt(r.cal) || 0), 0);
    if (existingIds.length > 0) {
      // Update first entry, delete the rest
      await fetch(`/api/food/${existingIds[0]}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: desc, calories: cal })
      });
      for (const id of existingIds.slice(1)) {
        await fetch(`/api/food/${id}`, { method: 'DELETE' });
      }
    } else {
      // Create new entry
      await fetch('/api/food', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_phone: dayFoodPhone, description: desc, calories: cal, date: dayFoodDate })
      });
    }
  }

  showToast('✅ נשמר!');
  // Reload calendar data and refresh
  const newData = await fetch(`/api/calendar?phone=${calPhone}&year=${calYear}&month=${calMonth}`).then(r=>r.json());
  calData = newData;
  renderCalGrid();
  showDayDetail(dayFoodDate);

  // Update food history cache
  const foodArrays = await Promise.all(allUsers.map(u =>
    fetch(`/api/food?phone=${u.phone}&limit=500`).then(r=>r.json()).then(foods=>foods.map(f=>({...f,name:u.name})))
  ));
  allFoodEntries = foodArrays.flat().sort((a,b)=>b.recorded_at.localeCompare(a.recorded_at));
  renderTable();
}

// ── Add food for specific date (modal — kept for backward compat) ────
let addFoodDate = null, addFoodPhone = null;
let addFoodItems = [];

function openAddFoodForDate(dateStr, phone) {
  addFoodDate = dateStr;
  addFoodPhone = phone;
  addFoodItems = [{ desc: '', cal: 0 }];
  renderAddFoodItems();
  document.getElementById('addFoodDateTitle').textContent =
    new Date(dateStr+'T12:00:00').toLocaleDateString('he-IL',{day:'numeric',month:'long'});
  document.getElementById('addFoodModal').classList.remove('hidden');
}

function renderAddFoodItems() {
  const list = document.getElementById('addFoodItemsList');
  list.innerHTML = addFoodItems.map((item, i) => `
    <div class="food-item-row">
      <input class="food-item-desc" type="text" value="${item.desc.replace(/"/g,'&quot;')}"
        oninput="addFoodItems[${i}].desc=this.value"
        placeholder="תיאור פריט" />
      <input class="food-item-cal" type="number" value="${item.cal||''}" min="0" max="9999"
        oninput="addFoodItems[${i}].cal=parseInt(this.value)||0; updateAddFoodTotal()"
        placeholder="קל׳" />
      <button class="btn-remove-item" onclick="removeAddFoodItem(${i})" title="הסר">✕</button>
    </div>`).join('');
  updateAddFoodTotal();
}

function updateAddFoodTotal() {
  const total = addFoodItems.reduce((s, it) => s + (parseInt(it.cal)||0), 0);
  document.getElementById('addFoodTotalCalc').textContent = total;
}

function addFoodItem() {
  // work out which modal is open and add to the right list
  const editOpen = !document.getElementById('foodModal').classList.contains('hidden');
  if (editOpen) {
    foodItems.push({ desc: '', cal: 0 });
    renderFoodItems();
    const inputs = document.querySelectorAll('#foodItemsList .food-item-desc');
    if (inputs.length) inputs[inputs.length-1].focus();
  } else {
    addFoodItems.push({ desc: '', cal: 0 });
    renderAddFoodItems();
    const inputs = document.querySelectorAll('#addFoodItemsList .food-item-desc');
    if (inputs.length) inputs[inputs.length-1].focus();
  }
}

function removeAddFoodItem(i) {
  addFoodItems.splice(i, 1);
  if (!addFoodItems.length) addFoodItems = [{ desc: '', cal: 0 }];
  renderAddFoodItems();
}

function closeAddFoodModal() {
  document.getElementById('addFoodModal').classList.add('hidden');
  addFoodDate = null; addFoodPhone = null; addFoodItems = [];
}

async function saveAddFood() {
  const desc = buildFoodDesc(addFoodItems);
  const cal  = addFoodItems.reduce((s, it) => s + (parseInt(it.cal)||0), 0);
  if (!desc) return;
  await fetch('/api/food', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ user_phone: addFoodPhone, description: desc, calories: cal, date: addFoodDate })
  });
  closeAddFoodModal(); showToast('✅ ארוחה נוספה!');
  await loadCalendar();
  if (currentDetailDate) showDayDetail(currentDetailDate);
}

// ── Food edit modal ───────────────────────────────────────
let foodItems = []; // [{ desc, cal }]

// Strip embedded [cal] tags for display
function displayDesc(desc) {
  return (desc||'').replace(/\s*\[\d+\]/g, '');
}

// Parse saved description — supports "item [cal]" format or plain text
function parseFoodDesc(desc) {
  const items = desc.split(/,\s*/).map(s => s.trim()).filter(Boolean);
  return items.map(s => {
    const m = s.match(/^(.*?)\s*\[(\d+)\]$/);
    if (m) return { desc: m[1].trim(), cal: parseInt(m[2]) };
    return { desc: s, cal: 0 };
  });
}

// Build description string with embedded calories
function buildFoodDesc(items) {
  return items.filter(it=>it.desc).map(it => `${it.desc} [${parseInt(it.cal)||0}]`).join(', ');
}

async function openFoodEdit(id, descEncoded, totalCal) {
  editingFoodId = id;
  const desc = decodeURIComponent(descEncoded);

  // Try to parse embedded [cal] format first
  const parsed = parseFoodDesc(desc);
  const hasEmbedded = parsed.some(p => p.cal > 0);

  if (hasEmbedded) {
    foodItems = parsed;
  } else {
    // Fallback: estimate from server
    let breakdown = [];
    try {
      const r = await fetch('/api/estimate', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ text: desc })
      });
      const data = await r.json();
      breakdown = data.breakdown || [];
    } catch(e) {}

    if (breakdown.length > 0) {
      foodItems = breakdown.map(b => ({ desc: b.item, cal: b.cal }));
    } else {
      foodItems = parsed.length ? parsed : [{ desc: '', cal: 0 }];
    }
  }
  if (!foodItems.length) foodItems = [{ desc: '', cal: 0 }];

  renderFoodItems();
  document.getElementById('foodModal').classList.remove('hidden');
}

function renderFoodItems() {
  const list = document.getElementById('foodItemsList');
  list.innerHTML = foodItems.map((item, i) => `
    <div class="food-item-row">
      <input class="food-item-desc" type="text" value="${item.desc.replace(/"/g,'&quot;')}"
        oninput="foodItems[${i}].desc=this.value"
        placeholder="תיאור פריט" />
      <input class="food-item-cal" type="number" value="${item.cal}" min="0" max="9999"
        oninput="foodItems[${i}].cal=parseInt(this.value)||0; updateFoodTotal()"
        placeholder="קל׳" />
      <button class="btn-remove-item" onclick="removeFoodItem(${i})" title="הסר">✕</button>
    </div>`).join('');
  updateFoodTotal();
}

function updateFoodTotal() {
  const total = foodItems.reduce((s, it) => s + (parseInt(it.cal)||0), 0);
  document.getElementById('foodTotalCalc').textContent = total;
}

function addFoodItem() {
  foodItems.push({ desc: '', cal: 0 });
  renderFoodItems();
  const inputs = document.querySelectorAll('.food-item-desc');
  if (inputs.length) inputs[inputs.length-1].focus();
}

function removeFoodItem(i) {
  foodItems.splice(i, 1);
  if (!foodItems.length) foodItems = [{ desc: '', cal: 0 }];
  renderFoodItems();
}

function closeFoodModal() {
  document.getElementById('foodModal').classList.add('hidden');
  editingFoodId = null;
  foodItems = [];
}

async function saveFoodEdit() {
  if (!editingFoodId) return;
  const desc = buildFoodDesc(foodItems);
  const cal  = foodItems.reduce((s, it) => s + (parseInt(it.cal)||0), 0);
  await fetch(`/api/food/${editingFoodId}`, {
    method: 'PUT', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ description: desc, calories: cal })
  });
  // Update local cache
  const fe = allFoodEntries.find(e=>e.id===editingFoodId);
  if (fe) { fe.description = desc; fe.calories = cal; }
  closeFoodModal(); showToast('✅ עודכן!');
  renderTable();
  await loadCalendar();
  if (currentDetailDate) showDayDetail(currentDetailDate);
}

// ── Weight edit modal ─────────────────────────────────────
function openWeightEditById(id) {
  const e = allEntries.find(e=>e.id===id);
  if (!e) return;
  openWeightEdit(id, e.weight, e.note||'');
}

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

// ── Logs ──────────────────────────────────────────────
function parseUA(ua) {
  if (!ua) return '—';
  if (/iPhone|iPad/.test(ua)) return '📱 iOS';
  if (/Android/.test(ua)) return '📱 Android';
  if (/Windows/.test(ua)) return '🖥️ Windows';
  if (/Mac/.test(ua)) return '🍎 Mac';
  if (/Linux/.test(ua)) return '🐧 Linux';
  return '🌐 אחר';
}

function parseBrowser(ua) {
  if (!ua) return '—';
  if (/Edg\//.test(ua)) return 'Edge';
  if (/Chrome\//.test(ua)) return 'Chrome';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Safari\//.test(ua) && !/Chrome/.test(ua)) return 'Safari';
  return 'אחר';
}

async function loadLogs() {
  const logs = await fetch('/api/logs?limit=200').then(r => r.json());
  const c = document.getElementById('logsTable');
  if (!logs.length) { c.innerHTML = '<p class="empty-state">אין לוגים עדיין</p>'; return; }

  // Group consecutive same-IP entries within 30 min as one session
  const sessions = [];
  let cur = null;
  for (const log of logs) {
    const t = new Date(log.created_at);
    if (!cur || cur.ip !== log.ip || (cur.lastTime - t) > 30*60*1000) {
      cur = { ip: log.ip, ua: log.user_agent, firstTime: t, lastTime: t, hits: 1 };
      sessions.push(cur);
    } else {
      cur.hits++;
      if (t < cur.lastTime) cur.lastTime = t;
    }
  }

  c.innerHTML = `<div class="table-wrapper"><table>
    <thead><tr><th>זמן כניסה</th><th>מכשיר</th><th>דפדפן</th><th>IP</th><th>צפיות</th></tr></thead>
    <tbody>${sessions.map(s => `<tr>
      <td>${s.firstTime.toLocaleDateString('he-IL')} ${s.firstTime.toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit'})}</td>
      <td>${parseUA(s.ua)}</td>
      <td>${parseBrowser(s.ua)}</td>
      <td style="font-family:monospace;font-size:.8rem;color:var(--muted)">${s.ip || '—'}</td>
      <td><span class="src-badge src-manual">${s.hits}</span></td>
    </tr>`).join('')}</tbody>
  </table></div>
  <p style="color:var(--muted);font-size:.8rem;margin-top:10px;text-align:center">${logs.length} אירועים סה"כ · ${sessions.length} כניסות</p>`;
}

async function clearLogs() {
  if (!confirm('למחוק את כל הלוגים?')) return;
  await fetch('/api/logs', { method: 'DELETE' });
  showToast('🗑️ לוגים נמחקו');
  loadLogs();
}

// ── Toast ─────────────────────────────────────────────────
function showToast(msg){
  const t=document.getElementById('toast');
  t.textContent=msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),2800);
}
