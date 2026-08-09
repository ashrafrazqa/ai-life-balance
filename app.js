// ==========================================
// AI Life Balance - Core Logic
// ==========================================

// --- State Management ---
const STATE_KEY = 'nutri_coach_state';

const defaultState = {
    profile: null, // { name, age, gender, height, weight, targetWeight, goal, activity, bmr, tdee, targetCalorie, apikey }
    diary: [], // { id, date, name, cal, p, c, f }
    activities: [], // { id, date, name, cal }
    chatHistory: [],
    insightCache: {},
    weightHistory: [],
    dateLastOpened: new Date().toISOString().split('T')[0]
};

let state = JSON.parse(localStorage.getItem(STATE_KEY)) || defaultState;
state.insightCache = state.insightCache || {};
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
    }
    if (payload) {
        showAppAlert(...payload);
        localStorage.setItem(key, 'shown');
    }
}

function renderProgressChart() {
    const el = document.getElementById('progress-chart');
    if (!el || !state.profile) return;
    const days = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
        const d = new Date(now); d.setDate(now.getDate() - i);
        const date = d.toISOString().split('T')[0];
        const food = state.diary.filter(x => x.date === date).reduce((s,x)=>s+Number(x.cal||0),0);
        const act = state.activities.filter(x => x.date === date).reduce((s,x)=>s+Number(x.cal||0),0);
        days.push({date, food, act, label:d.toLocaleDateString('id-ID',{weekday:'short'}).replace('.','')});
    }
    const max = Math.max(state.profile.targetCalorie || 1, ...days.flatMap(x=>[x.food,x.act]), 1);
    el.innerHTML = days.map(x => {
        const inH = x.food ? Math.max(6, Math.round((x.food/max)*100)) : 2;
        const outH = x.act ? Math.max(6, Math.round((x.act/max)*100)) : 2;
        const balance = x.food - x.act;
        return `<div class="chart-day" title="${x.date}: ${x.food} masuk, ${x.act} aktivitas, balance ${balance} kkal"><div class="chart-bars"><span class="bar-in" style="height:${inH}%"></span><span class="bar-out" style="height:${outH}%"></span></div><small>${x.label}</small></div>`;
    }).join('');
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
// Production endpoint: Cloudflare Pages Function at /api/gemini.
const AI_API_ENDPOINT = '/api/gemini';

async function callGeminiAPI(payload) {
    let response, result;
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
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const profile = {
            name: document.getElementById('prof-name').value.trim(),
            age: Number(document.getElementById('prof-age').value),
            gender: document.getElementById('prof-gender').value,
            height: Number(document.getElementById('prof-height').value),
            weight: Number(document.getElementById('prof-weight').value),
            targetWeight: Number(document.getElementById('prof-target').value),
            goal: document.getElementById('prof-goal').value,
            activity: document.getElementById('prof-activity').value
        };
        const stats = calculateHealthStats(profile);
        state.profile = { ...profile, ...stats };
        if (!state.weightHistory.length || state.weightHistory[state.weightHistory.length - 1].weight !== profile.weight) {
            state.weightHistory.push({ date: getTodayString(), weight: profile.weight });
        }
        saveState();
        window.location.hash = '#dashboard';
    });
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
    document.querySelectorAll('#tpl-food .tab-btn').forEach(btn => {
        btn.addEventListener('click', () => { if (btn.dataset.tab === 'history') renderFoodHistory(); });
    });
}

async function loadMealPlanner() {
    const container = document.getElementById('meal-plan-container');
    if (!container || !state.profile) return;
    const target = state.profile.targetCalorie;
    const summary = getTodaySummary();
    container.innerHTML = '<div class="planner-loading"><span class="material-symbols-rounded spin">auto_awesome</span> AI sedang menyusun menu personal...</div>';

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
    document.getElementById('btn-pantry')?.addEventListener('click', async () => {
        const input=pantryInput?.value.trim(); if(!input) return;
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
        if (false) {
            alert('API Key Gemini belum disetel!');
            wrapper.style.display = 'block';
            res.style.display = 'none';
            return;
        }

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
        if (!input) return;

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
