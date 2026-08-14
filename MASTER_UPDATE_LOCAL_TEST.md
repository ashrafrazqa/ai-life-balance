
## V8 UI refinements
- Dashboard Balance Score restored to right alignment; removed header compensation for floating Coach button.
- Starting Point AI card title changed from "AI menjelaskan" to "Gambaran kondisimu" for softer, clearer wording.
# AI Life Balance — Master Update Local Test Candidate

## Tujuan
Versi ini dibuat untuk **testing lokal terlebih dahulu**. Jangan upload ke GitHub/Cloudflare sebelum seluruh regression test selesai.

## AI lokal
Saat aplikasi dibuka dari `localhost` atau `127.0.0.1`, `public/app.js` mengarahkan request AI ke:

`https://ai-life-balance.ashrafrazqa-39d.workers.dev/api/gemini`

API Key tetap berada di Cloudflare Worker Secret. Tidak ada API Key di frontend.

## Cara menjalankan
Jangan double-click `index.html` jika ingin menguji kamera/PWA/AI.

Gunakan local web server, contoh:

```bash
python -m http.server 5500 --directory public
```

Lalu buka:

`http://localhost:5500`

## Urutan test
1. Onboarding → isi profil → Starting Point → AI insight awal.
2. Beranda → Energy Balance, AI Insight, edukasi 1 kg, Progress 7 Hari.
3. Makanan → input manual/riwayat/AI Planner.
4. SCAN → kamera + input manual + Enter + hasil AI + simpan.
5. Aktivitas → input aktivitas + Enter + AI estimation + riwayat.
6. Coach → pertanyaan umum tentang makanan, aktivitas, kebiasaan, target, dan progress.
7. Pengaturan → tujuan, aktivitas, tema terang/gelap, simpan profil.
8. Check-in berat → bandingkan aktual dengan prediksi.
9. Contoh Perjalanan → pastikan data contoh diberi label jelas.
10. PWA → install/refresh dan pastikan service worker memakai cache versi Master Update.

## Catatan
- Data aplikasi disimpan di `localStorage` browser.
- Data contoh ditandai `demo: true` dan hanya untuk demonstrasi.
- Versi ini belum dimaksudkan sebagai deployment final.


## Master Update V5 — UI/UX Stabilization
- Coach dipindahkan dari bottom navigation menjadi ikon chat + badge AI di kanan atas.
- Bottom navigation: Beranda, Makanan, Aktivitas, SCAN, Progress, Pengaturan, Tentang.
- Tentang dikembalikan sebagai menu utama dan ditambahkan Pahami Tubuhmu (QnA) dengan 10 pertanyaan edukatif.
- Beranda dipadatkan menjadi dashboard satu layar: statistik utama, Progress 7 Hari, dan teaser Cerita Hari Ini.
- Chart 7 Hari di menu Progress dihapus agar tidak duplikat dengan Beranda; Progress difokuskan pada perjalanan berat, target vs aktual, dan storytelling.
- Data dummy perjalanan tetap tidak masuk ke history pengguna.
- AI/API belum menjadi fokus perubahan ini; tetap gunakan Worker TEST saat pengujian lokal.
