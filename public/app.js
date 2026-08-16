// ==========================================
// AI Life Balance - Core Logic
// ==========================================

// --- State Management ---
const STATE_KEY = 'nutri_coach_state';

const defaultState = {
    profile: null, // { name, age, gender, height, weight, targetWeight, goal, activity, bmr, tdee, targetCalorie }
    diary: [], // { id, date, name, cal, p, c, f }
    activities: [], // { id, date, name, cal }
    chatHistory: [],
    insightCache: {},
    mealPlanCache: {},
    weightHistory: [],
    dateLastOpened: new Date().toISOString().split('T')[0]
};

let state = JSON.parse(localStorage.getItem(STATE_KEY)) || defaultState;
state.insightCache = state.insightCache || {};
state.mealPlanCache = state.mealPlanCache || {};
state.weightHistory = state.weightHistory || [];

function saveState() {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

function getTodayString() {
    return new Date().toISOString().split('T')[0];
}

// Check for new day to reset daily stats (conceptually, we just filter by today)
if (state.dateLastOpened !== getTodayString()) {
    state.dateLastOpened = getTodayString();
    saveState();
}

// --- Utils & Calculations ---
function calculateHealthStats(profile) {
    // Mifflin-St Jeor BMR + activity multiplier.
    const weight = Number(profile.weight) || 0;
    const height = Number(profile.height) || 0;
    const age = Number(profile.age) || 0;
    let bmr = (10 * weight) + (6.25 * height) - (5 * age);
    bmr += (profile.gender === 'male') ? 5 : -161;

    const activityFactor = Number(profile.activity) || 1.2;
    const tdee = bmr * activityFactor;

    // Keep the goal explicit. A moderate 500 kcal/day deficit is an estimate,
    // not a promise; maintain has no automatic deficit.
    let targetCalorie = tdee;
    if (profile.goal === 'lose' || (!profile.goal && weight > Number(profile.targetWeight))) {
        targetCalorie = tdee - 500;
    } else if (profile.goal === 'fitness') {
        targetCalorie = tdee;
    }

    targetCalorie = Math.max(1200, targetCalorie);
    return {
        bmr: Math.round(bmr),
        tdee: Math.round(tdee),
        targetCalorie: Math.round(targetCalorie)
    };
}

function getGoalLabel(goal) {
    return ({
        lose: 'Menurunkan berat badan',
        maintain: 'Mempertahankan berat badan',
        fitness: 'Meningkatkan kebugaran'
    })[goal] || 'Menjaga kesehatan';
}

function getActivityLabel(factor) {
    const map = {
        '1.2': 'Jarang', '1.375': 'Ringan', '1.55': 'Sedang',
        '1.725': 'Tinggi', '1.9': 'Sangat tinggi'
    };
    return map[String(factor)] || 'Ringan';
}

function estimateActivityCalories(text, weightKg) {
    const lower = String(text).toLowerCase();
    let minutes = 30;
    const duration = lower.match(/(\d+(?:[.,]\d+)?)\s*(menit|mins?|jam|hours?)/i);
    if (duration) {
        const value = Number(duration[1].replace(',', '.'));
        minutes = /jam|hour/i.test(duration[2]) ? value * 60 : value;
    }

    let met = 3.5;
    let label = 'Aktivitas ringan';
    if (/lari|jogging|running/.test(lower)) { met = 8.3; label = 'Lari/jogging'; }
    else if (/jalan cepat|brisk/.test(lower)) { met = 4.3; label = 'Jalan cepat'; }
    else if (/jalan|walking/.test(lower)) { met = 3.5; label = 'Jalan kaki'; }
    else if (/sepeda|bersepeda|cycling|bike/.test(lower)) { met = 7.0; label = 'Bersepeda'; }
    else if (/renang|swim/.test(lower)) { met = 6.0; label = 'Berenang'; }
    else if (/gym|angkat beban|weight/.test(lower)) { met = 5.0; label = 'Latihan beban'; }
    else if (/basket/.test(lower)) { met = 7.5; label = 'Basket'; }
    else if (/badminton|bulu tangkis/.test(lower)) { met = 5.5; label = 'Bulu tangkis'; }
    else if (/futsal|sepak bola|football|soccer/.test(lower)) { met = 7.0; label = 'Sepak bola/futsal'; }

    // MET-based estimate: kcal ≈ MET × 3.5 × kg / 200 × minutes.
    const cal = Math.max(1, Math.round((met * 3.5 * Number(weightKg || 60) / 200) * minutes));
    return { cal, minutes, met, label };
}

function getTodayDiary() {
    const today = getTodayString();
    return state.diary.filter(d => d.date === today);
}

function getTodayActivity() {
    const today = getTodayString();
    return state.activities.filter(a => a.date === today);
}

function formatDateId(dateStr) {
    const d = new Date(`${dateStr}T00:00:00`);
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getDateGroups(items) {
    const groups = {};
    items.forEach(item => {
        if (!groups[item.date]) groups[item.date] = [];
        groups[item.date].push(item);
    });
    return Object.entries(groups).sort((a,b) => b[0].localeCompare(a[0]));
}

function getInsightCacheKey(summary, netCal) {
    const p = state.profile || {};
    return JSON.stringify({
        date: getTodayString(),
        name: p.name, age: p.age, gender: p.gender, weight: p.weight,
        targetWeight: p.targetWeight, goal: p.goal, activity: p.activity,
        tdee: p.tdee, targetCalorie: p.targetCalorie,
        calIn: summary.calIn, calOut: summary.calOut,
        p: summary.p, c: summary.c, f: summary.f, netCal
    });
}


function invalidateInsightCache() {
    state.insightCache = {};
    saveState();
}

function showAppAlert(type, title, message) {
    const wrap = document.getElementById('app-alert');
    if (!wrap) return;
    const icon = document.getElementById('app-alert-icon');
    document.getElementById('app-alert-title').innerText = title;
    document.getElementById('app-alert-message').innerText = message;
    icon.className = `app-alert-icon ${type || 'info'}`;
    icon.innerHTML = `<span class="material-symbols-rounded">${type === 'warning' ? 'warning' : type === 'success' ? 'check_circle' : 'info'}</span>`;
    wrap.style.display = 'flex';
}
function maybeShowDailyAlert(summary) {
    const today = getTodayString();
    const hour = new Date().getHours();
    const key = `aiLifeBalanceAlert:${today}`;
    if (localStorage.getItem(key)) return;
    let payload = null;
    if (hour >= 12 && summary.calIn === 0 && summary.calOut === 0) {
        payload = ['info', 'Belum ada catatan hari ini', 'AI Life Balance belum bisa membaca progress hari ini. Yuk catat makanan atau aktivitas pertamamu.'];
    } else if (hour >= 12 && summary.calIn > state.profile.targetCalorie) {
        payload = ['warning', 'Kalori harian sudah terlampaui', `Asupanmu sudah ${summary.calIn.toLocaleString('id-ID')} kkal, melewati target ${state.profile.targetCalorie.toLocaleString('id-ID')} kkal. Kamu masih bisa mencatat aktivitas dan memilih asupan berikutnya dengan lebih bijak.`];
    } else if (hour >= 12 && summary.calIn === 0 && summary.calOut > 0) {
        payload = ['info', 'Makanan belum dicatat', `Aktivitasmu sudah tercatat ${summary.calOut.toLocaleString('id-ID')} kkal, tetapi belum ada catatan makanan. Balance Score masih bersifat sementara.`];
    }
    if (payload) {
        showAppAlert(...payload);
        localStorage.setItem(key, 'shown');
    }
}

function renderProgressChart() {
    const el = document.getElementById('dashboard-progress-chart') || document.getElementById('progress-chart');
    if (!el || !state.profile) return;
    const days = [];
    const now = new Date();
    const demoFood=[1780,1650,1900,1720,1810,1690,1760], demoAct=[180,320,120,260,350,220,300];
    for (let i = 6; i >= 0; i--) {
        const d = new Date(now); d.setDate(now.getDate() - i);
        const date = d.toISOString().split('T')[0];
        const index = 6 - i;
        const food = state.demoMode ? demoFood[index] : state.diary.filter(x => x.date === date && !x.demo).reduce((s,x)=>s+Number(x.cal||0),0);
        const act = state.demoMode ? demoAct[index] : state.activities.filter(x => x.date === date && !x.demo).reduce((s,x)=>s+Number(x.cal||0),0);
        days.push({date, food, act, label:d.toLocaleDateString('id-ID',{weekday:'short'}).replace('.','')});
    }
    const max = Math.max(state.profile.targetCalorie || 1, ...days.flatMap(x=>[x.food,x.act]), 1);
    const W=560,H=155,left=42,right=12,top=18,bottom=28,plotW=W-left-right,plotH=H-top-bottom;
    const x=i=>days.length===1?left+plotW/2:left+(i/(days.length-1))*plotW;
    const y=v=>top+((max-v)/max)*plotH;
    const points=(key)=>days.map((d,i)=>`${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`).join(' ');
    const grid=[0,.5,1].map(t=>{const yy=top+t*plotH;const val=max*(1-t);return `<line x1="${left}" y1="${yy}" x2="${W-right}" y2="${yy}" class="dash-grid-line"/><text x="${left-7}" y="${yy+4}" text-anchor="end" class="dash-axis-label">${Math.round(val)}</text>`;}).join('');
    const labels=days.map((d,i)=>`<text x="${x(i)}" y="${H-8}" text-anchor="middle" class="dash-date-label">${d.label}</text>`).join('');
    const dots=(key,cls)=>days.map((d,i)=>`<circle cx="${x(i)}" cy="${y(d[key])}" r="${i===days.length-1?5:3.5}" class="${cls}${i===days.length-1?' current':''}"><title>${formatDateId(d.date)}: ${d[key].toLocaleString('id-ID')} kkal</title></circle>`).join('');
    el.innerHTML=`<div class="dashboard-line-chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Grafik makanan dan aktivitas 7 hari">${grid}<polyline points="${points('food')}" class="dash-line dash-line-in"/><polyline points="${points('act')}" class="dash-line dash-line-out"/>${dots('food','dash-dot-in')}${dots('act','dash-dot-out')}${labels}</svg></div>`;
}

function getTodaySummary() {
    const diary = getTodayDiary();
    const acts = getTodayActivity();
    
    let calIn = diary.reduce((sum, item) => sum + item.cal, 0);
    let p = diary.reduce((sum, item) => sum + item.p, 0);
    let c = diary.reduce((sum, item) => sum + item.c, 0);
    let f = diary.reduce((sum, item) => sum + item.f, 0);
    
    let calOut = acts.reduce((sum, item) => sum + item.cal, 0);
    
    return { calIn, calOut, p, c, f };
}

// --- Router (SPA Logic) ---
const viewContainer = document.getElementById('view-container');
const bottomNav = document.getElementById('bottom-nav');

// Stream reference
let currentStream = null;
function stopCamera() {
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
        currentStream = null;
    }
}

// AI service: the Gemini API Key is kept server-side.
// Production endpoint: Cloudflare Worker at /api/gemini.
const AI_API_ENDPOINT = (location.hostname === 'localhost' || location.hostname === '127.0.0.1') ? 'https://ai-life-balance-test.dny-setia.workers.dev/api/gemini' : '/api/gemini';

async function callGeminiAPI(payload) {
    let response, result;
    const startedAt = performance.now();
    try {
        response = await fetch(AI_API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    } catch (e) {
        throw new Error(`Tidak dapat terhubung ke layanan AI. Periksa koneksi internet. Detail: ${e.message}`);
    }
    try {
        result = await response.json();
    } catch {
        throw new Error(`Layanan AI mengembalikan respons tidak valid (HTTP ${response.status}).`);
    }
    if (!response.ok) throw new Error(result?.error || `Layanan AI gagal (HTTP ${response.status}).`);
    const elapsed = Math.round(performance.now() - startedAt);
    if (elapsed > 2500) console.info(`AI response time: ${elapsed} ms`);
    return result;
}

function navigate(hash) {
    if (!hash || hash === '') hash = '#dashboard';
    
    // Redirect to onboarding if no profile
    if (!state.profile && hash !== '#onboarding') {
        window.location.hash = '#onboarding';
        return;
    }
    
    // Stop camera if navigating away from scan
    if (hash !== '#scan') stopCamera();
    
    const viewName = hash.replace('#', '');
    const template = document.getElementById(`tpl-${viewName}`);
    
    if (template) {
        // Clear container and inject template
        viewContainer.innerHTML = '';
        viewContainer.appendChild(template.content.cloneNode(true));
        
        // Update Bottom Nav
        if (viewName === 'onboarding') {
            bottomNav.style.display = 'none';
        } else {
            bottomNav.style.display = 'flex';
            document.querySelectorAll('.nav-item').forEach(el => {
                el.classList.remove('active');
                if (el.dataset.target === viewName) el.classList.add('active');
            });
        }
        
        // Init view logic
        initView(viewName);
    }
}

// Listen to hash change
window.addEventListener('hashchange', () => navigate(window.location.hash));

// --- View Initializers ---

function initView(viewName) {
    if (viewName === 'onboarding') initOnboarding();
    else if (viewName === 'dashboard') initDashboard();
    else if (viewName === 'food') initFood();
    else if (viewName === 'scan') initScan();
    else if (viewName === 'activity') initActivity();
    else if (viewName === 'coach') initCoach();
    else if (viewName === 'settings') initSettings();
    else if (viewName === 'about') initAbout();
}

function initOnboarding() {
    const form = document.getElementById('profile-form');

    if (!form) return;

    form.addEventListener('submit', (e) => {
        e.preventDefault();

        const name = document.getElementById('prof-name')?.value.trim();
        const age = Number(document.getElementById('prof-age')?.value);
        const gender = document.getElementById('prof-gender')?.value;
        const height = Number(document.getElementById('prof-height')?.value);
        const weight = Number(document.getElementById('prof-weight')?.value);
        const targetWeight = Number(document.getElementById('prof-target')?.value);
        const goal = document.getElementById('prof-goal')?.value;
        const activity = document.getElementById('prof-activity')?.value;

        if (!name || !age || !gender || !height || !weight || !targetWeight || !goal || !activity) {
            showAppAlert(
                'warning',
                'Data belum lengkap',
                'Lengkapi semua data profil terlebih dahulu.'
            );
            return;
        }

        if (targetWeight <= 0 || weight <= 0 || height <= 0 || age <= 0) {
            showAppAlert(
                'warning',
                'Data tidak valid',
                'Pastikan umur, tinggi, berat badan, dan target berat sudah benar.'
            );
            return;
        }

        if (goal === 'lose' && targetWeight >= weight) {
            showAppAlert(
                'warning',
                'Target berat belum sesuai',
                'Untuk tujuan menurunkan berat badan, target berat harus lebih rendah dari berat saat ini.'
            );
            return;
        }

        const profile = {
            name,
            age,
            gender,
            height,
            weight,
            targetWeight,
            goal,
            activity
        };

        const stats = calculateHealthStats(profile);

        state.profile = {
            ...profile,
            ...stats
        };

        if (
            !state.weightHistory.length ||
            state.weightHistory[state.weightHistory.length - 1].weight !== profile.weight
        ) {
            state.weightHistory.push({
                date: getTodayString(),
                weight: profile.weight
            });
        }

        saveState();

        // Masuk ke Beranda setelah profil berhasil disimpan
        window.location.hash = '#dashboard';
    });
}


function renderWeightHistoryChart() {
    const el=document.getElementById('weight-history-chart'); if(!el||!state.weightHistory?.length)return;
    const data=state.weightHistory.slice(-10); const min=Math.min(...data.map(x=>Number(x.weight))), max=Math.max(...data.map(x=>Number(x.weight))); const range=Math.max(0.5,max-min);
    el.innerHTML=data.map((x,i)=>{const pct=20+((Number(x.weight)-min)/range)*70;return `<div class="weight-point" title="${formatDateId(x.date)}: ${x.weight} kg"><span style="bottom:${pct}%"></span><small>${new Date(x.date+'T00:00:00').toLocaleDateString('id-ID',{day:'numeric',month:'short'})}</small></div>`}).join('');
}
function addDemoJourney() {
    if (!state.profile) return;
    state.demoMode = !state.demoMode;
    const btn=document.getElementById('btn-demo-progress');
    const note=document.getElementById('demo-progress-note');
    if(btn) btn.innerHTML=state.demoMode ? '<span class="material-symbols-rounded">undo</span> Kembali ke Progress Saya' : '<span class="material-symbols-rounded">auto_graph</span> Lihat Contoh Perjalanan';
    if(note) note.style.display=state.demoMode ? 'block' : 'none';
    const story=document.getElementById('progress-journey-story'); if(story) story.textContent=state.demoMode?'Contoh cerita: perjalanan pengguna menunjukkan perubahan kebiasaan dan perbandingan target dengan kondisi aktual. Data ini hanya simulasi untuk demo.':`Saat ini kamu berada di ${state.profile.weight} kg dengan target ${state.profile.targetWeight} kg. Check-in secara berkala agar perjalanan nyata bisa dibandingkan dengan prediksi.`;
}

async function initDashboard() {
    if (!state.profile) return;

    document.getElementById('dash-name').innerText = state.profile.name;
    document.getElementById('dash-w-current').innerText = `${state.profile.weight} kg`;
    document.getElementById('dash-w-target').innerText = `${state.profile.targetWeight} kg`;

    const summary = getTodaySummary();
    const target = state.profile.targetCalorie;
    const netCal = summary.calIn - summary.calOut;
    const calLeft = Math.max(0, target - netCal);

    document.getElementById('dash-cal-in').innerText = summary.calIn;
    document.getElementById('dash-cal-out').innerText = summary.calOut;
    document.getElementById('dash-cal-left').innerText = calLeft;

    const targetP = Math.max(1, Math.round((target * 0.3) / 4));
    const targetC = Math.max(1, Math.round((target * 0.4) / 4));
    const targetF = Math.max(1, Math.round((target * 0.3) / 9));
    document.getElementById('txt-p').innerText = `${summary.p}/${targetP}g`;
    document.getElementById('txt-c').innerText = `${summary.c}/${targetC}g`;
    document.getElementById('txt-f').innerText = `${summary.f}/${targetF}g`;
    document.getElementById('bar-p').style.width = `${Math.min(100, (summary.p / targetP) * 100)}%`;
    document.getElementById('bar-c').style.width = `${Math.min(100, (summary.c / targetC) * 100)}%`;
    document.getElementById('bar-f').style.width = `${Math.min(100, (summary.f / targetF) * 100)}%`;

    let score = 100;
    if (summary.calIn === 0 && summary.calOut === 0) {
        score = 0;
    } else {
        if (summary.calIn === 0) score -= 35;
        if (netCal > target + Math.max(200, target * 0.10)) score -= 25;
        else if (netCal > target) score -= 12;
        if (summary.calOut > 0) score += 5;
        if (summary.calOut >= 250) score += 5;
    }
    score = Math.max(0, Math.min(100, Math.round(score)));
    document.getElementById('dash-score').innerText = score;
    const scoreNote = document.getElementById('balance-score-note');
    if (scoreNote) scoreNote.textContent = score === 0 ? 'Belum ada catatan hari ini' : 'Indikator keseimbangan harian';
    const scoreCircle = document.getElementById('score-circle');
    if (scoreCircle) scoreCircle.style.strokeDasharray = `${score}, 100`;

    // Transparent target projection based on the selected goal and estimated deficit.
    const diff = Math.abs(state.profile.weight - state.profile.targetWeight);
    const deficitPerDay = state.profile.goal === 'lose' ? Math.max(250, state.profile.tdee - state.profile.targetCalorie) : 0;
    if (state.profile.goal === 'lose' && deficitPerDay > 0 && diff > 0) {
        const days = Math.ceil((diff * 7700) / deficitPerDay);
        const predDate = new Date();
        predDate.setDate(predDate.getDate() + days);
        document.getElementById('dash-prediction').innerText = predDate.toLocaleDateString('id-ID', {day:'numeric', month:'short', year:'numeric'});
    } else {
        document.getElementById('dash-prediction').innerText = state.profile.goal === 'maintain' ? 'Menjaga target' : 'Belum cukup data';
    }

    renderProgressChart();
    maybeShowDailyAlert(summary);

    const insightEl = document.getElementById('dash-insight');
    const refreshBtn = document.getElementById('btn-refresh-insight');
    const cacheKey = getInsightCacheKey(summary, netCal);

    if (refreshBtn && !refreshBtn.dataset.bound) {
        refreshBtn.dataset.bound = '1';
        refreshBtn.addEventListener('click', async () => {
            const freshSummary = getTodaySummary();
            const freshNet = freshSummary.calIn - freshSummary.calOut;
            const freshKey = getInsightCacheKey(freshSummary, freshNet);
            delete state.insightCache[freshKey];
            saveState();
            await generateDashboardInsight({ force: true, cacheKey: freshKey, summary: freshSummary, netCal: freshNet, insightEl, refreshBtn });
        });
    }

    if (false) {
        insightEl.innerText = `Hari ini ${summary.calIn} kkal masuk dan ${summary.calOut} kkal terbakar. Catat makanan dan aktivitasmu agar AI bisa memberikan insight yang lebih personal.`;
        if (refreshBtn) refreshBtn.disabled = true;
        return;
    }

    if (state.insightCache[cacheKey]) {
        insightEl.innerText = state.insightCache[cacheKey].text;
        if (refreshBtn) {
            refreshBtn.disabled = false;
            refreshBtn.innerHTML = '<span class="material-symbols-rounded">refresh</span> Perbarui';
        }
        return;
    }

    await generateDashboardInsight({ force: false, cacheKey, summary, netCal, insightEl, refreshBtn });
}

async function generateDashboardInsight({ force=false, cacheKey, summary, netCal, insightEl, refreshBtn }) {
    if (!force && state.insightCache[cacheKey]) {
        insightEl.innerText = state.insightCache[cacheKey].text;
        return;
    }
    if (refreshBtn) {
        refreshBtn.disabled = true;
        refreshBtn.innerHTML = '<span class="material-symbols-rounded spin">sync</span> Memuat';
    }
    insightEl.innerText = 'AI sedang membaca keseimbangan hari ini...';
    try {
        const p = state.profile;
        const prompt = `Kamu adalah AI Life Balance, asisten keseimbangan energi harian. Gunakan Bahasa Indonesia yang natural, hangat, singkat (maksimal 3 kalimat), tanpa diagnosis medis. Profil: ${p.name}, usia ${p.age}, berat ${p.weight} kg, target ${p.targetWeight} kg, tujuan ${getGoalLabel(p.goal)}, aktivitas harian ${getActivityLabel(p.activity)}, TDEE ${p.tdee} kkal, target harian ${p.targetCalorie} kkal. Hari ini: kalori masuk ${summary.calIn} kkal, kalori aktivitas ${summary.calOut} kkal, net ${netCal} kkal. Berikan insight praktis berdasarkan data ini. Jangan mengarang data yang tidak tersedia.`;
        const result = await callGeminiAPI({ contents: [{ parts: [{ text: prompt }] }] });
        const text = result?.candidates?.[0]?.content?.parts?.map(x => x.text || '').join('').trim();
        const finalText = text || 'AI belum memberikan insight. Catat lebih banyak data hari ini.';
        state.insightCache[cacheKey] = { text: finalText, createdAt: Date.now() };
        // Keep cache small: maximum 20 snapshots.
        const entries = Object.entries(state.insightCache).sort((a,b) => (b[1]?.createdAt||0)-(a[1]?.createdAt||0));
        state.insightCache = Object.fromEntries(entries.slice(0,20));
        saveState();
        insightEl.innerText = finalText;
    } catch (err) {
        console.warn('AI Insight:', err);
        insightEl.innerText = `Balance hari ini: ${netCal} kkal net. ${summary.calIn === 0 ? 'Mulai dengan mencatat makanan pertama hari ini.' : 'Terus catat makanan dan aktivitas agar gambaran harianmu semakin akurat.'}`;
    } finally {
        if (refreshBtn) {
            refreshBtn.disabled = false;
            refreshBtn.innerHTML = '<span class="material-symbols-rounded">refresh</span> Perbarui';
        }
    }
}

function initFood() {
    // Tabs
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.style.display = 'none');
            
            btn.classList.add('active');
            document.getElementById(`tab-${btn.dataset.tab}`).style.display = 'block';
            
            if (btn.dataset.tab === 'planner') loadMealPlanner();
        });
    });
    
    // Render Diary
    const list = document.getElementById('food-list');
    const diary = getTodayDiary();
    if (diary.length > 0) {
        list.innerHTML = diary.map(item => `
            <div class="list-item">
                <div class="item-info">
                    <h4>${item.name}</h4>
                    <span class="text-sm">${item.p}g P • ${item.c}g C • ${item.f}g L</span>
                </div>
                <div class="item-cal">${item.cal} Kkal</div>
            </div>
        `).join('');
    }

    function renderFoodHistory() {
        const summaryEl = document.getElementById('food-history-summary');
        const historyEl = document.getElementById('food-history-list');
        const groups = getDateGroups(state.diary);
        const totalCal = state.diary.reduce((s,x)=>s+Number(x.cal||0),0);
        summaryEl.innerHTML = `<div class="history-stat"><strong>${state.diary.length}</strong><span>catatan</span></div><div class="history-stat"><strong>${totalCal.toLocaleString('id-ID')}</strong><span>kkal total</span></div><div class="history-stat"><strong>${groups.length}</strong><span>hari</span></div>`;
        historyEl.innerHTML = groups.length ? groups.slice(0,30).map(([date,items]) => {
            const dayCal = items.reduce((s,x)=>s+Number(x.cal||0),0);
            return `<div class="history-day"><div class="history-day-head"><strong>${formatDateId(date)}</strong><span>${dayCal.toLocaleString('id-ID')} Kkal</span></div>${items.map(item=>`<div class="history-row"><div><strong>${item.name}</strong><small>${item.p}g P • ${item.c}g C • ${item.f}g L</small></div><span>${item.cal} Kkal</span></div>`).join('')}</div>`;
        }).join('') : '<p class="empty-state">Belum ada riwayat makanan.</p>';
    }

    renderFoodHistory();
    document.querySelectorAll('.food-view .tab-btn').forEach(btn => {
        btn.addEventListener('click', () => { if (btn.dataset.tab === 'history') renderFoodHistory(); });
    });
}

async function loadMealPlanner() {
    const container = document.getElementById('meal-plan-container');
    if (!container || !state.profile) return;
    const target = state.profile.targetCalorie;
    const summary = getTodaySummary();
    container.innerHTML = '<div class="planner-loading"><span class="material-symbols-rounded spin">auto_awesome</span> AI sedang menyiapkan menu…</div>';

    const renderFallback = () => {
        const breakfast = Math.round(target * 0.25), lunch = Math.round(target * 0.4), dinner = Math.round(target * 0.35);
        container.innerHTML = `<div class="meal-slot"><h4>Sarapan (~${breakfast} kkal)</h4><p>Oatmeal, pisang, dan sumber protein seperti telur.</p></div><div class="meal-slot"><h4>Makan Siang (~${lunch} kkal)</h4><p>Nasi secukupnya, ayam/ikan, dan banyak sayuran.</p></div><div class="meal-slot"><h4>Makan Malam (~${dinner} kkal)</h4><p>Protein tanpa banyak lemak, sayuran, dan karbohidrat secukupnya.</p></div>`;
    };
    if (false) { renderFallback(); return; }
    try {
        const prompt = `Buat rencana makan sehari untuk pengguna AI Life Balance. Target ${target} kkal/hari. Sudah dikonsumsi hari ini ${summary.calIn} kkal. Tujuan: ${getGoalLabel(state.profile.goal)}. Berat ${state.profile.weight} kg, target ${state.profile.targetWeight} kg. Gunakan Bahasa Indonesia. Kembalikan JSON murni dengan struktur {"breakfast":{"name":"","cal":0,"detail":""},"lunch":{"name":"","cal":0,"detail":""},"dinner":{"name":"","cal":0,"detail":""},"snack":{"name":"","cal":0,"detail":""}}. Total jangan melebihi sisa target secara tidak realistis. Jangan gunakan markdown.`;
        const result=await callGeminiAPI({contents:[{parts:[{text:prompt}]}]});
        const text=result?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('').trim();
        const data=JSON.parse(text.replace(/^```json\s*/i,'').replace(/^```\s*/i,'').replace(/\s*```$/i,'').trim());
        const labels=[['breakfast','Sarapan'],['lunch','Makan Siang'],['dinner','Makan Malam'],['snack','Snack']];
        container.innerHTML=labels.map(([key,label])=>data[key]?`<div class="meal-slot"><h4>${label} (~${Math.round(Number(data[key].cal)||0)} kkal)</h4><p><strong>${data[key].name||''}</strong><br>${data[key].detail||''}</p></div>`:'').join('');
    } catch(err) { console.warn('Meal Planner AI fallback',err); renderFallback(); }

    const pantryInput = document.getElementById('pantry-input');
    pantryInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('btn-pantry').click(); } });
    document.getElementById('btn-pantry')?.addEventListener('click', async (event) => { event.preventDefault();
        const input=pantryInput?.value.trim(); if(!input){showAppAlert('warning','Bahan belum diisi','Ketik minimal satu bahan makanan terlebih dahulu sebelum memilih Buat Menu.');pantryInput?.focus();return;}
        const btn=document.getElementById('btn-pantry'); btn.disabled=true; btn.textContent='Menyusun...';
        try {
            const prompt=`Saya punya bahan makanan: ${input}. Buat 1 menu sehat yang cocok untuk tujuan ${getGoalLabel(state.profile.goal)} dengan target harian ${target} kkal. Kembalikan JSON murni {"name":"","cal":0,"detail":""}. Jangan markdown.`;
            const result=await callGeminiAPI({contents:[{parts:[{text:prompt}]}]});
            const text=result?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('').trim();
            const data=JSON.parse(text.replace(/^```json\s*/i,'').replace(/^```\s*/i,'').replace(/\s*```$/i,'').trim());
            container.innerHTML=`<div class="meal-slot"><h4>Smart Pantry</h4><p><strong>${data.name||input}</strong> (~${Math.round(Number(data.cal)||0)} kkal)<br>${data.detail||''}</p></div>`;
        } catch(err) {
            container.innerHTML=`<div class="meal-slot"><h4>Smart Pantry</h4><p><strong>${input}</strong><br>Gunakan bahan tersebut dengan porsi seimbang dan minim minyak. Tambahkan sayuran atau sumber protein bila belum ada.</p></div>`;
        } finally { btn.disabled=false; btn.textContent='Buat Menu'; }
    });
}

function initScan() {
    const wrapper = document.getElementById('camera-wrapper');
    const video = document.getElementById('camera-stream');
    const canvas = document.getElementById('camera-canvas');
    const errorMsg = document.getElementById('camera-error');
    
    const res = document.getElementById('scan-result');
    const load = document.getElementById('scan-loading');
    const det = document.getElementById('scan-details');
    const btnCapture = document.getElementById('btn-capture');
    
    // Start Camera
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
            .then(stream => {
                currentStream = stream;
                video.srcObject = stream;
            })
            .catch(err => {
                console.error("Camera access denied:", err);
                wrapper.style.display = 'none';
                errorMsg.style.display = 'block';
            });
    } else {
        wrapper.style.display = 'none';
        errorMsg.style.display = 'block';
    }
    
    btnCapture.addEventListener('click', async () => {
        // Draw to canvas
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Get Base64 image
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        const base64Image = dataUrl.split(',')[1];
        
        wrapper.style.display = 'none';
        res.style.display = 'block';
        
        // Call Gemini API
        try {
            const prompt = `Analisis foto makanan ini. Berikan perkiraan nama makanan, kalori, dan makronutrisi dalam format JSON murni TANPA markdown block. Gunakan persis format ini: {"name":"Nama Makanan","cal":0,"p":0,"c":0,"f":0}. Jika bukan makanan, kembalikan JSON dengan nilai 0 dan name "Bukan Makanan".`;
            const payload = {
                contents: [{
                    parts: [
                        { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
                        { text: prompt }
                    ]
                }],
            };

            const result = await callGeminiAPI(payload);
            const textResponse = result.candidates?.[0]?.content?.parts
                ?.map(part => part.text || '')
                .join('')
                .trim();

            if (!textResponse) {
                throw new Error('Gemini tidak mengembalikan hasil analisis makanan.');
            }

            // Tolerate accidental markdown fences or surrounding text.
            const cleanJson = textResponse
                .replace(/^```json\\s*/i, '')
                .replace(/^```\\s*/i, '')
                .replace(/\\s*```$/i, '')
                .trim();

            let foodData;
            try {
                foodData = JSON.parse(cleanJson);
            } catch {
                const jsonMatch = cleanJson.match(/\\{[\\s\\S]*\\}/);
                if (!jsonMatch) {
                    throw new Error(`Format respons Gemini bukan JSON yang valid: ${textResponse}`);
                }
                foodData = JSON.parse(jsonMatch[0]);
            }

            if (!foodData || typeof foodData !== 'object') {
                throw new Error('Data makanan dari Gemini tidak valid.');
            }
            
            load.style.display = 'none';
            det.style.display = 'block';
            
            document.getElementById('res-food-name').value = foodData.name;
            document.getElementById('res-food-cal').value = foodData.cal;
            document.getElementById('res-p').value = foodData.p;
            document.getElementById('res-c').value = foodData.c;
            document.getElementById('res-f').value = foodData.f;

        } catch (err) {
            console.error(err);
            alert(`Gagal menganalisis gambar.\\n\\n${err.message || 'Kesalahan tidak diketahui.'}`);
            wrapper.style.display = 'block';
            res.style.display = 'none';
            load.style.display = 'block';
            det.style.display = 'none';
        }
    });

    const manualFoodInput = document.getElementById('manual-food-input');
    manualFoodInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('btn-manual-food').click(); } });

    document.getElementById('btn-manual-food').addEventListener('click', () => {
        const val = document.getElementById('manual-food-input').value;
        if(!val) return;
        wrapper.style.display = 'none';
        res.style.display = 'block';
        det.style.display = 'none';
        load.style.display = 'block';

        setTimeout(() => {
            load.style.display = 'none';
            det.style.display = 'block';
            document.getElementById('res-food-name').value = val;
            document.getElementById('res-food-cal').value = 300;
            document.getElementById('res-p').value = 10;
            document.getElementById('res-c').value = 40;
            document.getElementById('res-f').value = 10;
        }, 1000);
    });
    
    document.getElementById('btn-save-food').addEventListener('click', () => {
        const item = {
            id: Date.now(),
            date: getTodayString(),
            name: document.getElementById('res-food-name').value,
            cal: parseInt(document.getElementById('res-food-cal').value),
            p: parseInt(document.getElementById('res-p').value),
            c: parseInt(document.getElementById('res-c').value),
            f: parseInt(document.getElementById('res-f').value)
        };
        state.diary.push(item);
        invalidateInsightCache();
        saveState();
        window.location.hash = '#dashboard';
    });

    document.getElementById('btn-cancel-food').addEventListener('click', () => {
        res.style.display = 'none';
        det.style.display = 'none';
        load.style.display = 'block';
        wrapper.style.display = 'block';
    });
}

function initActivity() {
    const renderList = () => {
        const list = document.getElementById('activity-list');
        const acts = getTodayActivity();
        if (!acts.length) {
            list.innerHTML = '<p class="empty-state">Belum ada aktivitas yang dicatat hari ini.</p>';
            return;
        }
        list.innerHTML = acts.map(item => `
            <div class="list-item">
                <div class="item-info"><h4>${item.name}</h4><span class="text-sm">${item.minutes || ''} menit${item.met ? ` • MET ${item.met}` : ''}</span></div>
                <div class="item-cal" style="color:var(--warning)">− ${item.cal} Kkal</div>
            </div>`).join('');
    };
    renderList();

    function renderActivityHistory() {
        const summaryEl = document.getElementById('activity-history-summary');
        const historyEl = document.getElementById('activity-history-list');
        const groups = getDateGroups(state.activities);
        const totalCal = state.activities.reduce((s,x)=>s+Number(x.cal||0),0);
        const totalMinutes = state.activities.reduce((s,x)=>s+Number(x.minutes||0),0);
        summaryEl.innerHTML = `<div class="history-stat"><strong>${state.activities.length}</strong><span>aktivitas</span></div><div class="history-stat"><strong>${totalCal.toLocaleString('id-ID')}</strong><span>kkal terbakar</span></div><div class="history-stat"><strong>${Math.round(totalMinutes)}</strong><span>menit</span></div>`;
        historyEl.innerHTML = groups.length ? groups.slice(0,30).map(([date,items]) => {
            const dayCal = items.reduce((s,x)=>s+Number(x.cal||0),0);
            const dayMin = items.reduce((s,x)=>s+Number(x.minutes||0),0);
            return `<div class="history-day"><div class="history-day-head"><strong>${formatDateId(date)}</strong><span>${dayCal.toLocaleString('id-ID')} Kkal • ${Math.round(dayMin)} mnt</span></div>${items.map(item=>`<div class="history-row"><div><strong>${item.name}</strong><small>${Math.round(item.minutes||0)} menit${item.met ? ` • MET ${item.met}` : ''}</small></div><span>− ${item.cal} Kkal</span></div>`).join('')}</div>`;
        }).join('') : '<p class="empty-state">Belum ada riwayat aktivitas.</p>';
    }
    renderActivityHistory();
    document.querySelectorAll('.activity-tabs .tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.activity-tabs .tab-btn').forEach(b=>b.classList.remove('active'));
            btn.classList.add('active');
            const today = document.getElementById('activity-today-panel');
            const history = document.getElementById('activity-history-panel');
            const isHistory = btn.dataset.activityTab === 'history';
            today.style.display = isHistory ? 'none' : 'block';
            history.style.display = isHistory ? 'block' : 'none';
            if (isHistory) renderActivityHistory();
        });
    });

    const actInput = document.getElementById('act-input');
    actInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('btn-save-act').click(); } });

    document.getElementById('btn-save-act').addEventListener('click', async () => {
        const inputEl = document.getElementById('act-input');
        const input = inputEl.value.trim();
        if (!input) { showAppAlert('warning','Aktivitas belum diisi','Ketik aktivitas dan durasinya terlebih dahulu sebelum dianalisis.'); inputEl.focus(); return; }

        const localEstimate = estimateActivityCalories(input, state.profile.weight);
        const button = document.getElementById('btn-save-act');
        button.disabled = true;
        button.innerHTML = '<span class="material-symbols-rounded spin">sync</span><span class="btn-label-loading">Menghitung</span>';

        let estimate = localEstimate;
        if (true) {
            try {
                const prompt = `Analisis aktivitas olahraga pengguna. Teks: "${input}". Berat pengguna ${state.profile.weight} kg. Kembalikan JSON murni: {"cal":number,"minutes":number,"met":number,"activity":"string"}. Estimasikan calories burned secara konservatif berdasarkan berat, jenis aktivitas, intensitas dan durasi. Jika durasi tidak disebutkan, gunakan 30 menit. Jangan gunakan markdown.`;
                const result = await callGeminiAPI({contents:[{parts:[{text:prompt}]}]});
                const text = result?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('').trim();
                const cleaned = text?.replace(/^```json\s*/i,'').replace(/^```\s*/i,'').replace(/\s*```$/i,'').trim();
                const ai = JSON.parse(cleaned);
                if (Number(ai.cal) > 0) estimate = {cal: Math.round(Number(ai.cal)), minutes: Number(ai.minutes)||localEstimate.minutes, met: Number(ai.met)||localEstimate.met, label: ai.activity || localEstimate.label};
            } catch (err) {
                console.warn('Activity AI fallback:', err);
            }
        }

        state.activities.push({id:Date.now(), date:getTodayString(), name:input, cal:estimate.cal, minutes:estimate.minutes, met:estimate.met, source: 'ai-or-fallback'});
        invalidateInsightCache();
        saveState();
        inputEl.value = '';
        button.disabled = false;
        button.innerHTML = '<span class="material-symbols-rounded">send</span>';
        renderList();
    });
}

function initCoach() {
    const chatContainer = document.getElementById('chat-container');
    const btnSend = document.getElementById('btn-send-chat');
    const input = document.getElementById('chat-input');

    const addMessage = (text, sender) => {
        const msgDiv = document.createElement('div');
        msgDiv.className = `chat-msg ${sender}-msg`;
        msgDiv.innerHTML = `<div class="msg-bubble">${text}</div>`;
        chatContainer.appendChild(msgDiv);
        chatContainer.parentElement.scrollTop = chatContainer.parentElement.scrollHeight;
    };

    // Render existing history
    if (state.chatHistory && state.chatHistory.length > 0) {
        chatContainer.innerHTML = '';
        state.chatHistory.forEach(msg => addMessage(msg.text, msg.role));
    }

    // Clear Chat
    document.getElementById('btn-clear-chat').addEventListener('click', () => {
        if (confirm('Hapus semua riwayat obrolan?')) {
            state.chatHistory = [];
            saveState();
            chatContainer.innerHTML = '';
            addMessage('Riwayat chat telah dihapus. Ada yang ingin ditanyakan?', 'coach');
        }
    });

    async function sendChat() {
        const val = input.value.trim();
        if (!val) return;

        addMessage(val, 'user');
        input.value = '';
        state.chatHistory.push({ role: 'user', text: val });
        saveState();

        // Loading indicator
        const loadingId = 'loading-' + Date.now();
        const loadDiv = document.createElement('div');
        loadDiv.className = 'chat-msg coach-msg';
        loadDiv.id = loadingId;
        loadDiv.innerHTML = `<div class="msg-bubble" style="color:var(--text-muted);"><span class="material-symbols-rounded spin" style="font-size:1rem;vertical-align:middle;">sync</span> Berpikir...</div>`;
        chatContainer.appendChild(loadDiv);
        chatContainer.parentElement.scrollTop = chatContainer.parentElement.scrollHeight;

        try {
            const summary = getTodaySummary();
            const sysPrompt = `Kamu adalah AI Life Balance. Profil pengguna: ${state.profile.name}, BB ${state.profile.weight}kg, Target ${state.profile.targetWeight}kg. TDEE: ${state.profile.tdee} kkal. Target Kalori Harian: ${state.profile.targetCalorie} kkal. Hari ini masuk: ${summary.calIn} kkal, terbakar: ${summary.calOut} kkal. Jawablah singkat, positif, dan berikan saran yang masuk akal tentang makanan, minuman, aktivitas, target, energi, kebiasaan sehat, dan keseimbangan harian dalam Bahasa Indonesia.`;

            const payload = {
                systemInstruction: { parts: [{ text: sysPrompt }] },
                contents: [],
            };

            // Build valid alternating contents (user/model), must end with user
            let validContents = [];
            let expectedRole = 'user';
            for (let i = state.chatHistory.length - 1; i >= 0; i--) {
                const msg = state.chatHistory[i];
                const gRole = msg.role === 'coach' ? 'model' : 'user';
                if (gRole === expectedRole) {
                    validContents.unshift({ role: gRole, parts: [{ text: msg.text }] });
                    expectedRole = expectedRole === 'user' ? 'model' : 'user';
                }
            }
            payload.contents = validContents;

            const result = await callGeminiAPI(payload);
            if (!result.candidates || !result.candidates[0]) {
                throw new Error('Respons AI tidak valid atau kosong.');
            }

            const reply = result.candidates[0].content.parts[0].text.trim();
            document.getElementById(loadingId).remove();
            addMessage(reply, 'coach');
            state.chatHistory.push({ role: 'coach', text: reply });
            saveState();

        } catch (err) {
            console.error(err);
            document.getElementById(loadingId).remove();
            let errMsg = err.message || 'Kesalahan tidak diketahui.';
            if (errMsg.includes('API key not valid')) errMsg = 'API Key tidak valid. Mohon periksa kembali.';
            else if (errMsg.includes('Failed to fetch')) errMsg = 'Gagal terhubung ke server. Periksa koneksi internet.';
            addMessage(`Maaf, terjadi kesalahan: ${errMsg}`, 'coach');
        }
    }

    btnSend.addEventListener('click', () => sendChat());
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendChat();
        }
    });
}

// Initial Boot
document.addEventListener('click', (e) => { if (e.target.closest('#app-alert-close')) document.getElementById('app-alert').style.display='none'; });

window.addEventListener('DOMContentLoaded', () => {
    navigate(window.location.hash);
    
    // Register Service Worker for PWA
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('SW registered:', reg.scope))
            .catch(err => console.log('SW registration failed:', err));
    }
});


// --- Settings ---
function initSettings() {
    const profile = state.profile || {};

    const setValue = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.value = value ?? '';
    };

    setValue('settings-name', profile.name);
    setValue('settings-age', profile.age);
    setValue('settings-gender', profile.gender);
    setValue('settings-height', profile.height);
    setValue('settings-weight', profile.weight);
    setValue('settings-goal', profile.goal || (Number(profile.weight) > Number(profile.targetWeight) ? 'lose' : 'maintain'));
    setValue('settings-target-weight', profile.targetWeight);
    setValue('settings-activity', profile.activity || '1.2');
    const save = document.getElementById('settings-save');
    if (save && !save.dataset.bound) {
        save.dataset.bound = '1';
        save.addEventListener('click', () => {
            state.profile = {
                ...(state.profile || {}),
                name: document.getElementById('settings-name')?.value.trim() || '',
                age: Number(document.getElementById('settings-age')?.value || 0),
                gender: document.getElementById('settings-gender')?.value || '',
                height: Number(document.getElementById('settings-height')?.value || 0),
                weight: Number(document.getElementById('settings-weight')?.value || 0),
                targetWeight: Number(document.getElementById('settings-target-weight')?.value || 0),
                goal: document.getElementById('settings-goal')?.value || 'maintain',
                activity: document.getElementById('settings-activity')?.value || '1.2'
            };
            Object.assign(state.profile, calculateHealthStats(state.profile));
            const latestWeight = state.profile.weight;
            if (latestWeight > 0 && (!state.weightHistory.length || state.weightHistory[state.weightHistory.length - 1].weight !== latestWeight)) {
                state.weightHistory.push({ date: getTodayString(), weight: latestWeight });
            }

            saveState();
            setApiStatus('Pengaturan berhasil disimpan.', true);
            showAppAlert('success','Pengaturan diperbarui','Data profil dan target harianmu berhasil disimpan.');
        });
    }

    
}

function setApiStatus(message, success) {
    const el = document.getElementById('settings-api-status');
    if (!el) return;
    el.textContent = message || '';
    el.className = 'api-status' + (success === true ? ' success' : success === false ? ' error' : '');
}


function initAbout() {}


/* v9 theme preference */
(function () {
    const savedTheme = localStorage.getItem('aiLifeBalanceTheme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);

    function updateThemeButtons() {
        document.querySelectorAll('#theme-selector .theme-option').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.theme === document.documentElement.getAttribute('data-theme'));
        });
    }

    document.addEventListener('click', function (e) {
        const btn = e.target.closest('#theme-selector .theme-option');
        if (!btn) return;
        const theme = btn.dataset.theme === 'dark' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('aiLifeBalanceTheme', theme);
        updateThemeButtons();
    });

    document.addEventListener('DOMContentLoaded', updateThemeButtons);
    updateThemeButtons();
})();


/* =========================================================
   MASTER UPDATE — AI LIFE BALANCE LOCAL CANDIDATE
   ========================================================= */
const MASTER_LOCAL_WORKER = 'https://ai-life-balance-test.dny-setia.workers.dev/api/gemini';
const AI_API_ENDPOINT_MASTER = (window.AI_API_ENDPOINT ||
    ((location.hostname === 'localhost' || location.hostname === '127.0.0.1') ? MASTER_LOCAL_WORKER : '/api/gemini'));

async function callGeminiAPI(payload) {
    let response;
    try {
        response = await fetch(AI_API_ENDPOINT_MASTER, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    } catch (e) {
        throw new Error(`Tidak dapat terhubung ke layanan AI. Periksa koneksi internet. Detail: ${e.message}`);
    }
    let result;
    try { result = await response.json(); }
    catch { throw new Error(`Layanan AI mengembalikan respons tidak valid (HTTP ${response.status}).`); }
    if (!response.ok) throw new Error(result?.error || `Layanan AI gagal (HTTP ${response.status}).`);
    return result;
}

function parseAIJson(text) {
    const raw = String(text || '').trim();
    const cleaned = raw.replace(/^```json\s*/i,'').replace(/^```\s*/i,'').replace(/\s*```$/i,'').trim();
    try { return JSON.parse(cleaned); } catch (_) {}
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Format respons AI bukan JSON yang valid.');
    return JSON.parse(match[0]);
}

function getTargetPrediction() {
    const p = state.profile;
    if (!p || p.goal !== 'lose' || Number(p.weight) <= Number(p.targetWeight)) return null;
    const deficit = Math.max(250, Number(p.tdee || 0) - Number(p.targetCalorie || 0));
    const diff = Number(p.weight) - Number(p.targetWeight);
    if (deficit <= 0 || diff <= 0) return null;
    const days = Math.ceil((diff * 7700) / deficit);
    const d = new Date(); d.setDate(d.getDate() + days);
    return { days, date: d };
}

function renderWeightStory() {
    const p = state.profile;
    const story = document.getElementById('weight-story');
    if (!p || !story) return;
    const hist = state.weightHistory || [];
    const actual = Number(p.weight);
    const target = Number(p.targetWeight);
    const pred = getTargetPrediction();
    let text = `Berat aktual ${actual.toLocaleString('id-ID')} kg dari target ${target.toLocaleString('id-ID')} kg.`;
    if (hist.length >= 2) {
        const first = Number(hist[0].weight);
        const delta = actual - first;
        text += delta < 0 ? ` Kamu sudah turun sekitar ${Math.abs(delta).toFixed(1)} kg dari catatan awal.` : delta > 0 ? ` Catatan aktual menunjukkan kenaikan sekitar ${delta.toFixed(1)} kg dari catatan awal.` : ' Berat aktualmu masih sama dengan catatan awal.';
    }
    if (pred) text += ` Prediksi saat ini sekitar ${pred.date.toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'})}, tetapi kenyataan dapat berubah mengikuti data aktualmu.`;
    story.textContent = text;
}

async function generateStartingInsight() {
    const p = state.profile;
    const el = document.getElementById('starting-insight');
    const btn = document.getElementById('btn-start-journey');
    if (!p || !el) return;
    document.getElementById('start-weight').textContent = `${p.weight} kg`;
    document.getElementById('start-tdee').textContent = `${p.tdee} kkal`;
    document.getElementById('start-target').textContent = `${p.targetCalorie} kkal`;
    document.getElementById('start-goal-weight').textContent = `${p.targetWeight} kg`;
    const loadingEl = document.getElementById('starting-ai-loading');
    if (loadingEl) loadingEl.style.display = 'flex';
    el.style.display = 'none';
    try {
        const prompt = `Kamu adalah AI Life Balance. Jelaskan kondisi awal pengguna secara edukatif dan ringan dalam Bahasa Indonesia, maksimal 4 kalimat. Jangan diagnosis medis dan jangan menakut-nakuti. Profil: usia ${p.age}, jenis kelamin ${p.gender}, tinggi ${p.height} cm, berat ${p.weight} kg, target ${p.targetWeight} kg, tujuan ${getGoalLabel(p.goal)}, aktivitas ${getActivityLabel(p.activity)}, TDEE ${p.tdee} kkal, target harian ${p.targetCalorie} kkal. Jelaskan apa arti kebutuhan energi dan mengapa keseimbangan makanan serta aktivitas penting. Jangan mengarang data yang tidak tersedia.`;
        const result = await callGeminiAPI({contents:[{parts:[{text:prompt}]}]});
        const text = result?.candidates?.[0]?.content?.parts?.map(x=>x.text||'').join('').trim();
        el.textContent = text || 'Kondisi awalmu sudah tercatat. Mulai dengan mencatat makanan dan aktivitas agar AI dapat membaca keseimbanganmu dari hari ke hari.';
        el.style.display = 'block';
    } catch (err) {
        console.warn('Starting point AI:', err);
        el.textContent = `Kebutuhan energi harianmu diperkirakan sekitar ${p.tdee} kkal. Target harian ${p.targetCalorie} kkal digunakan sebagai panduan sesuai tujuanmu. Catat makanan dan aktivitas secara konsisten agar AI dapat membantu membaca keseimbanganmu dengan lebih akurat.`;
        el.style.display = 'block';
    } finally {
        if (loadingEl) loadingEl.style.display = 'none';
        if (btn) btn.disabled = false;
    }
}

function initStartingPoint() {
    const btn = document.getElementById('btn-start-journey');
    if (btn && !btn.dataset.bound) {
        btn.dataset.bound = '1';
        btn.addEventListener('click', () => { window.location.hash = '#dashboard'; });
    }
    generateStartingInsight();
}

function initOnboarding() {
    const form = document.getElementById('profile-form');
    if (!form || form.dataset.bound) return;
    form.dataset.bound = '1';
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('prof-name')?.value.trim();
        const age = Number(document.getElementById('prof-age')?.value);
        const gender = document.getElementById('prof-gender')?.value;
        const height = Number(document.getElementById('prof-height')?.value);
        const weight = Number(document.getElementById('prof-weight')?.value);
        const targetWeight = Number(document.getElementById('prof-target')?.value);
        const goal = document.getElementById('prof-goal')?.value;
        const activity = document.getElementById('prof-activity')?.value;
        if (!name || !age || !gender || !height || !weight || !targetWeight || !goal || !activity) return showAppAlert('warning','Data belum lengkap','Lengkapi semua data profil terlebih dahulu.');
        if (goal === 'lose' && targetWeight >= weight) return showAppAlert('warning','Target berat belum sesuai','Untuk tujuan menurunkan berat badan, target berat harus lebih rendah dari berat saat ini.');
        const profile = {name,age,gender,height,weight,targetWeight,goal,activity};
        state.profile = {...profile,...calculateHealthStats(profile)};
        state.weightHistory = state.weightHistory || [];
        state.weightHistory.push({date:getTodayString(),weight});
        state.weightHistory = state.weightHistory.slice(-60);
        saveState();
        window.location.hash = '#starting-point';
    });
}

async function initDashboard() {
    if (!state.profile) return;
    const p=state.profile, summary=getTodaySummary(), target=Number(p.targetCalorie||0), netCal=summary.calIn-summary.calOut, calLeft=Math.max(0,target-netCal);
    const set=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=value;};
    set('dash-name',p.name); set('dash-w-current',`${p.weight} kg`); set('dash-w-target',`${p.targetWeight} kg`);
    set('dash-tdee',`${Math.round(p.tdee||0).toLocaleString('id-ID')} kkal`); set('dash-target-cal',`${Math.round(target).toLocaleString('id-ID')} kkal`);
    set('dash-cal-in',summary.calIn); set('dash-cal-out',summary.calOut); set('dash-cal-left',calLeft);
    const energyMax=Math.max(1,target);
    const inPct=target>0?(summary.calIn/target)*100:0;
    const outPct=target>0?(summary.calOut/target)*100:0;
    const ein=document.getElementById('energy-in-fill'), eout=document.getElementById('energy-out-fill');
    if(ein){ ein.style.width=`${Math.min(100,inPct)}%`; ein.classList.toggle('over-target-fill',inPct>100); }
    if(eout){ eout.style.width=`${Math.min(100,outPct)}%`; eout.classList.toggle('over-target-fill',outPct>100); }
    const inRatio=document.getElementById('energy-in-ratio'), outRatio=document.getElementById('energy-out-ratio');
    set('energy-in-ratio',`${Math.round(inPct)}%`); set('energy-out-ratio',`${Math.round(outPct)}%`);
    if(inRatio) inRatio.classList.toggle('over-target-ratio',inPct>100);
    if(outRatio) outRatio.classList.toggle('over-target-ratio',outPct>100);
    set('energy-net-value',`${Math.round(netCal).toLocaleString('id-ID')} kkal net`);
    const deficit=Math.max(0,Math.round((p.tdee||0)-(target||0)));
    set('formula-tdee',`${Math.round(p.tdee||0).toLocaleString('id-ID')} kkal`);
    set('formula-deficit',deficit>0?`${deficit.toLocaleString('id-ID')} kkal`:'0 kkal');
    set('formula-target',`${Math.round(target||0).toLocaleString('id-ID')} kkal`);
    set('formula-caption',deficit>0?`TDEE ${Math.round(p.tdee||0).toLocaleString('id-ID')} − defisit ${deficit.toLocaleString('id-ID')} = target ${Math.round(target||0).toLocaleString('id-ID')} kkal/hari.`:'Untuk mempertahankan kondisi saat ini, target harian mengikuti kebutuhan energi (TDEE).');
    const formulaOrigin=document.getElementById('formula-origin');
    if(formulaOrigin) formulaOrigin.textContent=deficit>0?`💡 Defisit ${deficit.toLocaleString('id-ID')} kkal/hari digunakan sebagai asumsi awal. Secara teori ${deficit.toLocaleString('id-ID')} × 7 = ${(deficit*7).toLocaleString('id-ID')} kkal/minggu; perubahan nyata dapat berbeda.`:'💡 Karena tujuanmu mempertahankan kondisi, tidak ada pengurangan defisit otomatis dari TDEE.';
    const targetP=Math.max(1,Math.round((target*.30)/4)),targetC=Math.max(1,Math.round((target*.40)/4)),targetF=Math.max(1,Math.round((target*.30)/9));
    set('txt-p',`${summary.p}/${targetP}g`); set('txt-c',`${summary.c}/${targetC}g`); set('txt-f',`${summary.f}/${targetF}g`);
    const bp=document.getElementById('bar-p'),bc=document.getElementById('bar-c'),bf=document.getElementById('bar-f');
    if(bp)bp.style.width=`${Math.min(100,(summary.p/targetP)*100)}%`; if(bc)bc.style.width=`${Math.min(100,(summary.c/targetC)*100)}%`; if(bf)bf.style.width=`${Math.min(100,(summary.f/targetF)*100)}%`;
    let score=0, scoreNote='Belum ada catatan hari ini', scoreState='empty';
    if(summary.calIn>0 && summary.calOut>0){
        const deviation=Math.abs(netCal-target)/Math.max(target,1);
        score=Math.max(0,Math.min(100,Math.round(100-(deviation*100*1.25))));
        scoreNote=netCal>target?'Perlu penyesuaian':'Cukup seimbang';
        scoreState=netCal>target?'warning':'good';
    } else if(summary.calIn>0){
        const intakeRatio=summary.calIn/Math.max(target,1);
        score=Math.max(35,Math.min(85,Math.round(80-Math.max(0,intakeRatio-1)*50)));
        scoreNote=summary.calIn>target?'Asupan melewati target':'Aktivitas belum dicatat';
        scoreState=summary.calIn>target?'warning':'partial';
    } else if(summary.calOut>0){
        const activityRatio=summary.calOut/Math.max(target,1);
        score=Math.max(30,Math.min(80,Math.round(55+Math.min(activityRatio,.5)*30)));
        scoreNote='Makanan belum dicatat';
        scoreState='partial';
    }
    set('dash-score',score);set('balance-score-note',scoreNote);
    const circle=document.getElementById('score-circle');if(circle){circle.style.strokeDasharray=`${score},100`;circle.classList.remove('score-good','score-warning','score-partial');if(scoreState!=='empty')circle.classList.add(`score-${scoreState}`);}
    renderProgressChart();
    const story=document.getElementById('dashboard-story-text');
    if(story){
        if(!summary.calIn && !summary.calOut) story.textContent='Hari ini baru dimulai. Catat makanan atau aktivitas pertamamu agar AI bisa mulai membaca keseimbanganmu.';
        else if(netCal<=target) story.textContent=`Hari ini kamu sudah menjaga keseimbangan dengan cukup baik. Energi bersihmu ${Math.round(netCal).toLocaleString('id-ID')} kkal dari target ${Math.round(target).toLocaleString('id-ID')} kkal.`;
        else story.textContent=`Hari ini energi masukmu sedikit lebih tinggi dari target. Jangan khawatir—lihat pola harianmu dan lanjutkan dengan pilihan yang lebih seimbang.`;
    }
    maybeShowDailyAlert(summary);
}

async function initProgress(){
    if(!state.profile)return;
    const p=state.profile;
    const set=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=value;};
    set('progress-w-current',`${p.weight} kg`);set('progress-w-target',`${p.targetWeight} kg`);
    const pred=getTargetPrediction();set('progress-prediction',pred?pred.date.toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'}):(p.goal==='maintain'?'Menjaga target':'Belum cukup data'));
    renderWeightHistoryChartForProgress();renderWeightStoryForProgress();
    const journey=document.getElementById('progress-journey-story');
    if(journey){
        if(state.demoMode) journey.textContent='Contoh cerita: pengguna mulai dari berat awal, membangun kebiasaan, lalu membandingkan berat aktual dengan target. Data ini hanya simulasi untuk demo.';
        else if(p.goal==='maintain') journey.textContent=`Berat aktualmu ${p.weight} kg. Fokus perjalananmu adalah menjaga pola yang konsisten dan memantau perubahan dari waktu ke waktu.`;
        else journey.textContent=`Saat ini kamu berada di ${p.weight} kg dengan target ${p.targetWeight} kg. Check-in secara berkala agar perjalanan nyata bisa dibandingkan dengan prediksi.`;
    }
    
    const input=document.getElementById('progress-weight-checkin'),save=document.getElementById('progress-weight-checkin-btn');if(input)input.value=p.weight;
    if(save&&!save.dataset.bound){save.dataset.bound='1';save.addEventListener('click',()=>{const w=Number(input?.value);if(!w||w<10||w>300)return showAppAlert('warning','Berat belum valid','Masukkan berat aktual yang valid.');p.weight=w;Object.assign(p,calculateHealthStats(p));state.weightHistory=state.weightHistory||[];state.weightHistory.push({date:getTodayString(),weight:w});state.weightHistory=state.weightHistory.slice(-60);invalidateInsightCache();saveState();showAppAlert('success','Check-in tersimpan','Berat aktualmu sudah diperbarui dan akan digunakan untuk membaca perjalananmu.');initProgress();});}
}
function renderWeightHistoryChartForProgress(){
    const el=document.getElementById('progress-weight-history-chart');
    if(!el) return;
    const data=(state.weightHistory||[]).slice(-10).map(x=>({date:x.date,weight:Number(x.weight)})).filter(x=>Number.isFinite(x.weight));
    if(!data.length){el.innerHTML='<div class="weight-chart-empty">Belum ada check-in berat aktual.</div>';return;}
    const values=data.map(x=>x.weight), min=Math.min(...values), max=Math.max(...values), pad=Math.max(.5,(max-min)*.18), lo=min-pad, hi=max+pad;
    const W=560,H=210,left=46,right=18,top=24,bottom=42,plotW=W-left-right,plotH=H-top-bottom;
    const x=i=>data.length===1?left+plotW/2:left+(i/(data.length-1))*plotW;
    const y=v=>top+((hi-v)/(hi-lo))*plotH;
    const points=data.map((d,i)=>`${x(i).toFixed(1)},${y(d.weight).toFixed(1)}`).join(' ');
    const grid=[0,.5,1].map(t=>{const yy=top+t*plotH;const val=hi-t*(hi-lo);return `<line x1="${left}" y1="${yy.toFixed(1)}" x2="${W-right}" y2="${yy.toFixed(1)}" class="weight-grid-line"/><text x="${left-8}" y="${(yy+4).toFixed(1)}" text-anchor="end" class="weight-axis-label">${val.toFixed(1)}</text>`;}).join('');
    const labels=data.map((d,i)=>{const label=new Date(d.date+'T00:00:00').toLocaleDateString('id-ID',{day:'numeric',month:'short'});return `<text x="${x(i).toFixed(1)}" y="${H-12}" text-anchor="middle" class="weight-date-label">${label}</text>`;}).join('');
    const dots=data.map((d,i)=>{const current=i===data.length-1;return `<g class="weight-point-group"><circle cx="${x(i).toFixed(1)}" cy="${y(d.weight).toFixed(1)}" r="${current?7:5}" class="${current?'weight-point-current':'weight-point-dot'}"/><title>${formatDateId(d.date)}: ${d.weight} kg${current?' — posisi terakhir':''}</title>${current?`<text x="${x(i).toFixed(1)}" y="${Math.max(13,y(d.weight)-12).toFixed(1)}" text-anchor="middle" class="weight-current-label">Saat ini • ${d.weight} kg</text>`:''}</g>`;}).join('');
    el.innerHTML=`<div class="weight-chart-wrap"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Grafik berat aktual dari waktu ke waktu">${grid}<polyline points="${points}" class="weight-line"/>${dots}${labels}</svg></div><div class="weight-chart-caption"><span><i class="weight-current-key"></i> Check-in terakhir</span><span>${data.length} check-in</span></div>`;
}
function renderWeightStoryForProgress(){const el=document.getElementById('progress-weight-story');if(!el||!state.profile)return;const p=state.profile;const target=Number(p.targetWeight),current=Number(p.weight);if(p.goal==='maintain'){el.textContent=`Berat aktualmu ${current} kg. Fokus utama adalah menjaga pola yang konsisten dan memantau perubahan dari waktu ke waktu.`;return;}const diff=current-target;el.textContent=diff>0?`Saat ini kamu ${diff.toFixed(1)} kg dari target. Check-in secara berkala agar prediksi dapat dibandingkan dengan kondisi nyata.`:`Berat aktualmu sudah mencapai atau melewati target. Tetap pantau perubahan secara berkala agar perjalanan tetap sehat.`;}

async function generateDashboardInsight({force=false,cacheKey,summary,netCal,insightEl,refreshBtn}) {
    if(!insightEl || !state.profile) return;
    if(!force && state.insightCache[cacheKey]) { insightEl.textContent=state.insightCache[cacheKey].text; return; }
    if(refreshBtn){refreshBtn.disabled=true;refreshBtn.innerHTML='<span class="material-symbols-rounded spin">sync</span> Membaca';}
    insightEl.textContent='AI sedang membaca cerita keseimbanganmu...';
    try{
        const p=state.profile;
        const prompt=`Kamu adalah AI Life Balance. Ceritakan kondisi hari ini dalam Bahasa Indonesia natural, hangat, maksimal 3 kalimat. Data pengguna: ${p.name}, berat ${p.weight} kg, target ${p.targetWeight} kg, tujuan ${getGoalLabel(p.goal)}, TDEE ${p.tdee} kkal, target harian ${p.targetCalorie} kkal. Hari ini: makanan ${summary.calIn} kkal, aktivitas ${summary.calOut} kkal, net ${netCal} kkal. Jelaskan hubungan makanan, aktivitas dan keseimbangan hari ini. Jangan diagnosis dan jangan mengarang data.`;
        const result=await callGeminiAPI({contents:[{parts:[{text:prompt}]}]});
        const text=result?.candidates?.[0]?.content?.parts?.map(x=>x.text||'').join('').trim();
        const finalText=text||'Catat makanan dan aktivitas agar cerita keseimbangan harianmu semakin lengkap.';
        state.insightCache[cacheKey]={text:finalText,createdAt:Date.now()};
        state.insightCache=Object.fromEntries(Object.entries(state.insightCache).sort((a,b)=>(b[1]?.createdAt||0)-(a[1]?.createdAt||0)).slice(0,20)); saveState(); insightEl.textContent=finalText;
    }catch(err){ console.warn('AI Insight:',err); insightEl.textContent=`Hari ini kamu mencatat ${summary.calIn} kkal dari makanan dan ${summary.calOut} kkal dari aktivitas. Terus catat agar AI bisa melihat pola harianmu dengan lebih akurat.`; }
    finally{if(refreshBtn){refreshBtn.disabled=false;refreshBtn.innerHTML='<span class="material-symbols-rounded">refresh</span> Perbarui';}}
}

async function loadMealPlanner(force=false){
    const container=document.getElementById('meal-plan-container'); if(!container||!state.profile)return;
    const target=Number(state.profile.targetCalorie||0), summary=getTodaySummary(), remaining=Math.max(0,target-(summary.calIn-summary.calOut));
    const cacheKey=`${getTodayString()}|${Math.round(target)}|${summary.calIn}|${summary.calOut}|${state.profile.goal}|${state.profile.weight}|${state.profile.targetWeight}`;
    state.mealPlanCache=state.mealPlanCache||{};
    const cached=state.mealPlanCache[cacheKey];
    const renderData=(data,fromCache=false)=>{
        const labels=[['breakfast','Sarapan'],['lunch','Makan Siang'],['dinner','Makan Malam'],['snack','Snack']];
        container.innerHTML=`<div class="ai-result-badge"><span class="material-symbols-rounded">${fromCache?'inventory_2':'auto_awesome'}</span> ${fromCache?'Tersimpan di perangkat':'Dibuat AI'}</div>`+labels.map(([k,l])=>data[k]?`<div class="meal-slot"><h4>${l} (~${Math.round(Number(data[k].cal)||0)} kkal)</h4><p><strong>${data[k].name||''}</strong><br>${data[k].detail||''}</p></div>`:'').join('');
    };
    if(cached && !force){ renderData(cached.data,true); return; }
    container.innerHTML='<div class="planner-loading"><span class="material-symbols-rounded spin">auto_awesome</span><span>AI sedang menyiapkan menu…</span></div>';
    try{
        const prompt=`Buat rencana makan sehari personal untuk AI Life Balance. Target ${target} kkal. Sudah masuk ${summary.calIn} kkal dan aktivitas ${summary.calOut} kkal, sehingga sisa panduan energi sekitar ${remaining} kkal. Tujuan ${getGoalLabel(state.profile.goal)}. Berat ${state.profile.weight} kg, target ${state.profile.targetWeight} kg. Berikan 4 bagian breakfast,lunch,dinner,snack. Kembalikan JSON murni dengan cal angka yang masuk akal dan berbeda sesuai jenis makanan, name, detail. Total seluruh cal tidak boleh melebihi ${Math.max(target,remaining)} kkal dan jangan membuat semua menu sama. Gunakan Bahasa Indonesia. Jangan markdown.`;
        const result=await callGeminiAPI({contents:[{parts:[{text:prompt}]}]});
        const data=parseAIJson(result?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join(''));
        state.mealPlanCache[cacheKey]={data,createdAt:Date.now()};
        const entries=Object.entries(state.mealPlanCache).sort((a,b)=>(b[1]?.createdAt||0)-(a[1]?.createdAt||0)); state.mealPlanCache=Object.fromEntries(entries.slice(0,10));
        saveState(); renderData(data,false);
    }catch(err){
        console.warn('Meal Planner AI fallback',err);
        const b=Math.max(250,Math.round(remaining*.25)),l=Math.max(300,Math.round(remaining*.35)),d=Math.max(250,Math.round(remaining*.30)),s=Math.max(100,remaining-b-l-d);
        renderData({breakfast:{name:'Oatmeal, buah, dan telur',cal:b,detail:'Contoh kombinasi seimbang.'},lunch:{name:'Nasi, ayam/ikan, dan sayuran',cal:l,detail:'Porsi secukupnya.'},dinner:{name:'Protein dan sayuran',cal:d,detail:'Pilih cara masak rendah minyak.'},snack:{name:'Yogurt atau buah',cal:s,detail:'Sesuaikan dengan sisa energi.'}},false);
    }
}

function initScan(){
    const wrapper=document.getElementById('camera-wrapper'), video=document.getElementById('camera-stream'), canvas=document.getElementById('camera-canvas'), errorMsg=document.getElementById('camera-error'), res=document.getElementById('scan-result'), load=document.getElementById('scan-loading'), det=document.getElementById('scan-details'), btnCapture=document.getElementById('btn-capture');
    if(!wrapper||!res||!load||!det)return;
    if(navigator.mediaDevices?.getUserMedia){navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}}).then(stream=>{currentStream=stream;video.srcObject=stream;}).catch(()=>{wrapper.style.display='none';if(errorMsg)errorMsg.style.display='block';});}else{wrapper.style.display='none';if(errorMsg)errorMsg.style.display='block';}
    const showResult=(data)=>{load.style.display='none';det.style.display='block';document.getElementById('res-food-name').value=data.name||'Makanan';document.getElementById('res-food-cal').value=Number(data.cal)||0;document.getElementById('res-p').value=Number(data.p)||0;document.getElementById('res-c').value=Number(data.c)||0;document.getElementById('res-f').value=Number(data.f)||0;};
    const analyzeImage=async(base64)=>{const prompt=`Analisis foto makanan. Identifikasi makanan dan perkiraan porsinya dari gambar. Kembalikan JSON murni persis: {"name":"","cal":0,"p":0,"c":0,"f":0}. Kalori dan makro harus berupa estimasi yang masuk akal berdasarkan makanan dan porsi yang terlihat, jangan gunakan angka default yang sama untuk semua makanan. Jika bukan makanan, gunakan name "Bukan Makanan" dan semua angka 0. Jangan markdown.`;const result=await callGeminiAPI({contents:[{parts:[{inlineData:{mimeType:'image/jpeg',data:base64}},{text:prompt}]}]});return parseAIJson(result?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join(''));};
    btnCapture?.addEventListener('click',async()=>{if(!video.videoWidth)return;canvas.width=Math.min(video.videoWidth,1280);canvas.height=Math.round(video.videoHeight*(canvas.width/video.videoWidth));canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);const dataUrl=canvas.toDataURL('image/jpeg',0.72),base64=dataUrl.split(',')[1];wrapper.style.display='none';res.style.display='block';det.style.display='none';load.style.display='block';try{showResult(await analyzeImage(base64));}catch(err){alert(`Gagal menganalisis gambar.\n\n${err.message||'Kesalahan tidak diketahui.'}`);wrapper.style.display='block';res.style.display='none';}});
    const manual=document.getElementById('manual-food-input'), manualBtn=document.getElementById('btn-manual-food');
    const analyzeManual=async()=>{const val=manual?.value.trim();if(!val){showAppAlert('warning','Makanan belum diisi','Ketik nama makanan atau minuman terlebih dahulu sebelum dianalisis.');manual?.focus();return;}manualBtn.disabled=true;manualBtn.innerHTML='<span class="material-symbols-rounded spin">sync</span>';wrapper.style.display='none';res.style.display='block';det.style.display='none';load.style.display='block';try{const prompt=`Kamu adalah AI Food Scanner. Analisis makanan yang diketik pengguna: "${val}". Jika porsi disebutkan, gunakan porsi tersebut. Jika porsi tidak disebutkan, nyatakan estimasi berdasarkan porsi standar dan tetap beri angka. Kembalikan JSON murni: {"name":"","cal":0,"p":0,"c":0,"f":0,"portion":""}. Estimasikan kalori dan makro berdasarkan jenis makanan, bahan, cara masak, dan porsi. Jangan gunakan angka default yang sama untuk semua makanan. Jangan markdown.`;const result=await callGeminiAPI({contents:[{parts:[{text:prompt}]}]});showResult(parseAIJson(result?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('')));manual.value='';}catch(err){wrapper.style.display='block';res.style.display='none';alert(`Gagal menganalisis makanan.\n\n${err.message||'Kesalahan tidak diketahui.'}`);}finally{manualBtn.disabled=false;manualBtn.innerHTML='<span class="material-symbols-rounded">auto_awesome</span> Analisis dengan AI';}};
    manual?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();analyzeManual();}}); manualBtn?.addEventListener('click',analyzeManual);
    document.getElementById('btn-save-food')?.addEventListener('click',()=>{const item={id:Date.now(),date:getTodayString(),name:document.getElementById('res-food-name').value,cal:Number(document.getElementById('res-food-cal').value)||0,p:Number(document.getElementById('res-p').value)||0,c:Number(document.getElementById('res-c').value)||0,f:Number(document.getElementById('res-f').value)||0};state.diary.push(item);invalidateInsightCache();saveState();manual.value='';window.location.hash='#dashboard';});
    document.getElementById('btn-cancel-food')?.addEventListener('click',()=>{res.style.display='none';det.style.display='none';load.style.display='block';wrapper.style.display='block';manual.value='';});
}


function initFood(){
    const tabBtns=document.querySelectorAll('.food-view .tab-btn'), contents=document.querySelectorAll('.food-view .tab-content');
    tabBtns.forEach(btn=>{btn.addEventListener('click',()=>{tabBtns.forEach(b=>b.classList.remove('active'));contents.forEach(c=>c.style.display='none');btn.classList.add('active');const target=document.getElementById(`tab-${btn.dataset.tab}`);if(target)target.style.display='block';if(btn.dataset.tab==='planner')loadMealPlanner();if(btn.dataset.tab==='history')renderFoodHistoryMaster();});});
    document.getElementById('btn-refresh-meal-plan')?.addEventListener('click',()=>loadMealPlanner(true));
    const pantryInput=document.getElementById('pantry-input'), pantryBtn=document.getElementById('btn-pantry');
    const makePantryMenu=async()=>{const input=pantryInput?.value.trim();if(!input){showAppAlert('warning','Bahan belum diisi','Ketik minimal satu bahan makanan terlebih dahulu.');pantryInput?.focus();return;}pantryBtn.disabled=true;pantryBtn.innerHTML='<span class="material-symbols-rounded spin">sync</span>';try{const target=Number(state.profile.targetCalorie||0);const prompt=`Saya punya bahan makanan: ${input}. Buat 1 menu sehat yang cocok untuk tujuan ${getGoalLabel(state.profile.goal)} dengan target harian ${target} kkal. Kembalikan JSON murni {"name":"","cal":0,"detail":""}. Jangan markdown.`;const result=await callGeminiAPI({contents:[{parts:[{text:prompt}]}]});const data=parseAIJson(result?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join(''));const container=document.getElementById('meal-plan-container');if(container)container.innerHTML=`<div class="ai-result-badge"><span class="material-symbols-rounded">kitchen</span> Smart Pantry</div><div class="meal-slot"><h4>${data.name||input} (~${Math.round(Number(data.cal)||0)} kkal)</h4><p>${data.detail||'Gunakan bahan dengan porsi seimbang dan cara masak secukupnya.'}</p></div>`;}catch(err){const container=document.getElementById('meal-plan-container');if(container)container.innerHTML=`<div class="meal-slot"><h4>Smart Pantry</h4><p><strong>${input}</strong><br>Gunakan bahan tersebut dengan porsi seimbang dan tambahkan sayuran atau sumber protein bila belum ada.</p></div>`;}finally{pantryBtn.disabled=false;pantryBtn.innerHTML='<span class="material-symbols-rounded">auto_awesome</span> Buat Menu';}};
    pantryInput?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();makePantryMenu();}});pantryBtn?.addEventListener('click',makePantryMenu);
    const list=document.getElementById('food-list'); const diary=getTodayDiary(); if(list)list.innerHTML=diary.length?diary.map(x=>`<div class="list-item"><div class="item-info"><h4>${x.name}</h4><span class="text-sm">${x.p||0}g P • ${x.c||0}g C • ${x.f||0}g L</span></div><div class="item-cal">${x.cal} Kkal</div></div>`).join(''):'<p class="empty-state">Belum ada makanan yang dicatat hari ini.</p>';
}
function renderFoodHistoryMaster(){const s=document.getElementById('food-history-summary'),h=document.getElementById('food-history-list');if(!s||!h)return;const groups=getDateGroups(state.diary),total=state.diary.reduce((a,x)=>a+Number(x.cal||0),0);s.innerHTML=`<div class="history-stat"><strong>${state.diary.length}</strong><span>catatan</span></div><div class="history-stat"><strong>${total.toLocaleString('id-ID')}</strong><span>kkal total</span></div><div class="history-stat"><strong>${groups.length}</strong><span>hari</span></div>`;h.innerHTML=groups.length?groups.slice(0,30).map(([date,items])=>`<div class="history-day"><div class="history-day-head"><strong>${formatDateId(date)}</strong><span>${items.reduce((a,x)=>a+Number(x.cal||0),0).toLocaleString('id-ID')} Kkal</span></div>${items.map(x=>`<div class="history-row"><div><strong>${x.name}</strong><small>${x.p||0}g P • ${x.c||0}g C • ${x.f||0}g L</small></div><span>${x.cal} Kkal</span></div>`).join('')}</div>`).join(''):'<p class="empty-state">Belum ada riwayat makanan.</p>';}

function initActivity(){
    const renderList=()=>{const list=document.getElementById('activity-list');const acts=getTodayActivity();if(!acts.length){list.innerHTML='<p class="empty-state">Belum ada aktivitas yang dicatat hari ini.</p>';return;}list.innerHTML=acts.map(x=>`<div class="list-item"><div class="item-info"><h4>${x.name}</h4><span class="text-sm">${Math.round(x.minutes||0)} menit • MET ${x.met||'-'}</span></div><div class="item-cal" style="color:var(--warning)">− ${x.cal} Kkal</div></div>`).join('');};
    const renderHistory=()=>{const se=document.getElementById('activity-history-summary'),he=document.getElementById('activity-history-list'),groups=getDateGroups(state.activities);const total=state.activities.reduce((s,x)=>s+Number(x.cal||0),0);const mins=state.activities.reduce((s,x)=>s+Number(x.minutes||0),0);if(se)se.innerHTML=`<div class="history-stat"><strong>${state.activities.length}</strong><span>aktivitas</span></div><div class="history-stat"><strong>${total.toLocaleString('id-ID')}</strong><span>kkal terbakar</span></div><div class="history-stat"><strong>${Math.round(mins)}</strong><span>menit</span></div>`;if(he)he.innerHTML=groups.length?groups.slice(0,30).map(([date,items])=>`<div class="history-day"><div class="history-day-head"><strong>${formatDateId(date)}</strong><span>${items.reduce((s,x)=>s+Number(x.cal||0),0).toLocaleString('id-ID')} Kkal</span></div>${items.map(x=>`<div class="history-row"><div><strong>${x.name}</strong><small>${Math.round(x.minutes||0)} menit • MET ${x.met||'-'}</small></div><span>− ${x.cal} Kkal</span></div>`).join('')}</div>`).join(''):'<p class="empty-state">Belum ada riwayat aktivitas.</p>';};
    renderList();renderHistory();
    document.querySelectorAll('.activity-tabs .tab-btn').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.activity-tabs .tab-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');const h=btn.dataset.activityTab==='history';document.getElementById('activity-today-panel').style.display=h?'none':'block';document.getElementById('activity-history-panel').style.display=h?'block':'none';if(h)renderHistory();}));
    const input=document.getElementById('act-input'),button=document.getElementById('btn-save-act');
    const saveActivity=async()=>{const text=input?.value.trim();if(!text){showAppAlert('warning','Aktivitas belum diisi','Ketik aktivitas dan durasinya terlebih dahulu sebelum dianalisis.');input?.focus();return;}button.disabled=true;button.innerHTML='<span class="material-symbols-rounded spin">sync</span>';const local=estimateActivityCalories(text,state.profile.weight);let est=local;try{const prompt=`Kamu adalah AI Activity Tracker. Analisis aktivitas: "${text}". Berat pengguna ${state.profile.weight} kg. Kembalikan JSON murni {"cal":number,"minutes":number,"met":number,"activity":"string"}. Gunakan jenis aktivitas, durasi, intensitas yang disebutkan. Jika durasi tidak disebutkan gunakan 30 menit. Hitung secara konservatif dan realistis; jangan gunakan angka 200 sebagai default. Kalori harus berbeda sesuai aktivitas/durasi/berat. Jangan markdown.`;const result=await callGeminiAPI({contents:[{parts:[{text:prompt}]}]});const ai=parseAIJson(result?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join(''));if(Number(ai.cal)>0)est={cal:Math.round(Number(ai.cal)),minutes:Number(ai.minutes)||local.minutes,met:Number(ai.met)||local.met,label:ai.activity||local.label};}catch(err){console.warn('Activity AI fallback:',err);}state.activities.push({id:Date.now(),date:getTodayString(),name:text,cal:est.cal,minutes:est.minutes,met:est.met,source:'ai-or-fallback'});invalidateInsightCache();saveState();input.value='';button.disabled=false;button.innerHTML='<span class="material-symbols-rounded">send</span>';renderList();renderHistory();};
    input?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();saveActivity();}});button?.addEventListener('click',saveActivity);
}

function initCoach(){
    const chat=document.getElementById('chat-container'),button=document.getElementById('btn-send-chat'),input=document.getElementById('chat-input');if(!chat||!button||!input)return;
    const add=(text,role)=>{const d=document.createElement('div');d.className=`chat-msg ${role}-msg`;const b=document.createElement('div');b.className='msg-bubble';b.textContent=text;d.appendChild(b);chat.appendChild(d);chat.parentElement.scrollTop=chat.parentElement.scrollHeight;};
    chat.innerHTML=''; if(state.chatHistory?.length)state.chatHistory.forEach(m=>add(m.text,m.role)); else add('Halo! Saya AI Life Coach. Kita bisa membahas makanan, aktivitas, kebiasaan, target, energi, dan progress harianmu.','coach');
    document.getElementById('btn-clear-chat')?.addEventListener('click',()=>{if(confirm('Hapus semua riwayat obrolan?')){state.chatHistory=[];saveState();chat.innerHTML='';add('Riwayat chat telah dihapus. Ada yang ingin ditanyakan?','coach');}});
    const send=async()=>{const val=input.value.trim();if(!val)return;add(val,'user');input.value='';state.chatHistory.push({role:'user',text:val});saveState();const id='load-'+Date.now(),d=document.createElement('div');d.className='chat-msg coach-msg';d.id=id;d.innerHTML='<div class="msg-bubble loading-bubble"><span class="material-symbols-rounded spin">sync</span> AI sedang menyiapkan jawaban…</div>';chat.appendChild(d);try{const s=getTodaySummary(),p=state.profile;const sys=`Kamu adalah AI Life Coach dalam aplikasi AI Life Balance. Jawab Bahasa Indonesia natural, hangat, singkat, praktis. Topik boleh makanan, minuman, aktivitas, kebiasaan, energi, target berat, progress, tidur, atau keseimbangan harian. Jangan diagnosis medis. Profil: ${p.name}, usia ${p.age}, berat ${p.weight} kg, target ${p.targetWeight} kg, TDEE ${p.tdee} kkal, target harian ${p.targetCalorie} kkal. Hari ini masuk ${s.calIn} kkal, aktivitas ${s.calOut} kkal.`;const valid=[...state.chatHistory].slice(-12).map(m=>({role:m.role==='coach'?'model':'user',parts:[{text:m.text}]}));const payload={systemInstruction:{parts:[{text:sys}]},contents:valid};const result=await callGeminiAPI(payload);const reply=result?.candidates?.[0]?.content?.parts?.map(x=>x.text||'').join('').trim();if(!reply)throw new Error('Respons AI kosong.');document.getElementById(id)?.remove();add(reply,'coach');state.chatHistory.push({role:'coach',text:reply});state.chatHistory=state.chatHistory.slice(-30);saveState();}catch(err){document.getElementById(id)?.remove();add(`Maaf, AI belum dapat menjawab saat ini. ${err.message||'Silakan coba lagi.'}`,'coach');}};
    button.addEventListener('click',send);input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}});
}

function navigate(hash){
    if(!hash)hash='#dashboard';
    if(!state.profile && hash!=='#onboarding'){window.location.hash='#onboarding';return;}
    if(hash!=='#scan')stopCamera();
    const viewName=hash.replace('#','');
    if(viewName!=='progress') state.demoMode=false;
    const template=document.getElementById(`tpl-${viewName}`);if(!template)return;
    viewContainer.innerHTML='';viewContainer.appendChild(template.content.cloneNode(true));
    const isOnboarding=viewName==='onboarding';
    const hideBottomNav=isOnboarding||viewName==='starting-point'; bottomNav.classList.toggle('nav-hidden',hideBottomNav); bottomNav.style.display=hideBottomNav?'none':'flex';
    const coachFab=document.getElementById('coach-fab'); if(coachFab){ const hideCoach=hideBottomNav || viewName==='about' || viewName==='coach'; coachFab.classList.toggle('hidden',hideCoach); if(!hideCoach) document.getElementById('app')?.appendChild(coachFab); }
    document.querySelectorAll('.nav-item').forEach(el=>{el.classList.toggle('active',el.dataset.target===viewName);});
    if(viewName==='onboarding')initOnboarding(); else if(viewName==='starting-point')initStartingPoint(); else if(viewName==='dashboard')initDashboard(); else if(viewName==='food')initFood(); else if(viewName==='scan')initScan(); else if(viewName==='activity')initActivity(); else if(viewName==='coach')initCoach(); else if(viewName==='settings')initSettings(); else if(viewName==='progress')initProgress(); else if(viewName==='about')initAbout();
}

// Refresh dashboard when returning to foreground after a longer pause.
document.addEventListener('visibilitychange',()=>{if(!document.hidden && state.profile && window.location.hash==='#dashboard')navigate('#dashboard');});
