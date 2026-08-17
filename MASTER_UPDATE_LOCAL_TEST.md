# AI Life Balance — V10.2 Local Test

## Tujuan
V10.2 memfokuskan Beranda agar lebih sederhana tanpa menghilangkan konsep **aplikasi yang bisa bercerita**. V10.1 tetap menjadi baseline/versi rollback.

## Perubahan V10.2
- Beranda tidak lagi menampilkan kartu detail Berat saat ini, Target berat, Kebutuhan energi, dan Target harian. Detail tersebut tetap tersedia di menu Progress/fitur terkait.
- Makronutrisi Protein, Karbo, dan Lemak dihapus dari Beranda agar tidak terjadi kepadatan informasi dan duplikasi dengan menu Makanan.
- **Progress 7 Hari** tetap dipertahankan di Beranda.
- **Cerita Hari Ini** tetap dipertahankan sebagai elemen storytelling, termasuk CTA **Baca perjalananmu**.
- Greeting Beranda dibuat lebih compact.
- AI Coach dipindahkan menjadi icon chat di header Beranda agar tidak menutupi chart/konten. Floating AI Coach tidak tampil di Beranda.
- Kartu **Rumus Target Harian** diubah menjadi **Bagaimana Targetmu Dihitung?**.
- Rumus ditampilkan sebagai alur visual: Kebutuhan energi → Defisit untuk tujuanmu → Target makan harian.
- Label A/B/C dihapus agar lebih mudah dipahami pengguna umum.
- Penjelasan asal defisit ditampilkan secara ringkas, termasuk konteks defisit mingguan secara teoritis dan catatan bahwa perubahan nyata dapat berbeda.
- Service Worker cache dinaikkan ke V10.2 agar browser tidak mempertahankan asset lama saat testing.

## Validasi teknis
- `public/app.js` lolos `node --check`.
- `public/index.html` berhasil diparse oleh HTML parser Python.

## Testing
Paket ini untuk **local testing terlebih dahulu**. Jangan upload ke GitHub/Cloudflare sebelum UI V10.2 dibandingkan dengan V10.1.
