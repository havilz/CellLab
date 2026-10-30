# CellLab

CellLab adalah prototipe aplikasi desktop untuk membuat model sel sederhana,
menjalankan simulasi konsentrasi terhadap waktu, dan membandingkan hasil kontrol
dengan skenario pemberian obat. Aplikasi dibuat dengan React dan TypeScript,
Tauri/Rust, serta engine Python.

> **Status ilmiah:** hasil simulasi saat ini menggunakan baseline komputasi
> ilustratif yang dikembangkan dari prototipe. Parity terhadap prototipe bukan
> validasi biologis independen. CellLab belum ditujukan untuk keputusan klinis,
> prediksi terapi, atau penggunaan riset kuantitatif tanpa validasi dan
> kalibrasi tambahan.

## Fitur saat ini

- Workbench desktop untuk melihat dan mengubah profil sel, konfigurasi obat,
  serta task simulasi.
- Simulasi waktu selama 300 detik dengan solver Runge–Kutta orde 4 (RK4):
  langkah integrasi 0,1 detik dan keluaran setiap 0,5 detik.
- Satu task dapat membandingkan kontrol tanpa obat dengan skenario terpisah
  untuk setiap dosis yang dikonfigurasi. Dosis dijalankan sebagai simulasi
  independen, bukan sebagai kombinasi obat dalam satu run.
- Visualisasi hasil berupa grafik konsentrasi, tabel numerik, dan diagram sel
  animasi.
- Penyimpanan proyek portabel ke folder `.celllab`. Folder ini menyimpan
  manifest proyek, data sel/obat/task, dan bundle hasil dalam file JSON.
- Membuka kembali folder proyek untuk memulihkan model dan hasil yang
  tersimpan. Identitas entitas menggunakan ID stabil sehingga rename tidak
  mengubah referensi task.
- Jalur solver TypeScript lokal tersedia sebagai fallback ketika pemanggilan
  engine melalui Tauri gagal. Fallback ini menjalankan baseline yang sama; ini
  bukan validasi tambahan terhadap model.

Menu **Pindai dosis** dan **Steady-state** masih ditandai “segera” di UI dan
belum merupakan fitur simulasi yang tersedia.

## Batasan yang diketahui

- Persamaan dan parameter baseline masih bersifat ilustratif. Model belum
  dikalibrasi atau divalidasi secara independen terhadap data biologis.
- Cakupan ilmiah produksi, sumber parameter, rentang validitas, analisis
  sensitivitas, dan propagasi ketidakpastian masih perlu dikembangkan. Lihat
  [status proyek](./docs/PROJECT_STATUS.md) dan ADR ilmiah di
  [docs/decisions](./docs/decisions/).
- Engine Python dijalankan sebagai script lokal melalui `python`/`python3`
  (atau executable yang ditetapkan lewat `CELLLAB_PYTHON`). Python belum
  dipaketkan sebagai sidecar aplikasi, sehingga aplikasi hasil bundling belum
  mandiri dari instalasi Python dan file engine yang tersedia.
- Menyimpan atau memperbarui proyek memerlukan tindakan **Simpan**. Hasil
  simulasi ditampilkan sebelum penyimpanan project file selesai; periksa pesan
  status aplikasi untuk mengetahui apakah penyimpanan berhasil.
- Perubahan data dalam sesi yang belum disimpan tidak dijamin tersedia setelah
  aplikasi ditutup.
- Build frontend dan tes Rust tidak menggantikan uji manual desktop end-to-end.

## Prasyarat pengembangan

Petunjuk berikut ditujukan untuk Windows:

- Node.js versi LTS dan npm.
- Rust stable melalui [rustup](https://rustup.rs/).
- Microsoft C++ Build Tools dengan workload **Desktop development with C++**.
- Microsoft Edge WebView2 Runtime.
- Python 3 yang dapat dijalankan dari terminal.

Prasyarat Windows Tauri dijelaskan lebih lengkap di
[dokumentasi resmi Tauri](https://v2.tauri.app/start/prerequisites/).
Engine saat ini menggunakan standard library Python; tidak ada paket Python
tambahan yang perlu dipasang untuk menjalankan baseline tersebut.

## Menyiapkan dan menjalankan

Dari root repository:

```powershell
npm ci
npm run tauri dev
```

Jika Python tidak ditemukan otomatis, set `CELLLAB_PYTHON` ke executable Python
sebelum menjalankan aplikasi:

```powershell
$env:CELLLAB_PYTHON = "C:\Path\To\Python\python.exe"
npm run tauri dev
```

Untuk memeriksa build frontend:

```powershell
npm run build
```

Untuk menjalankan tes backend Rust:

```powershell
cargo test --manifest-path src-tauri\Cargo.toml
```

Perintah bundling yang dikonfigurasi oleh Tauri:

```powershell
npm run tauri build
```

Perintah bundling tersedia, tetapi belum berarti Python engine ikut terpaket.
Lihat batasan di atas sebelum mengandalkan hasil build sebagai installer
mandiri.

## Alur penggunaan

1. Jalankan aplikasi dan pilih **Baru** untuk membuat proyek, atau **Buka**
   untuk memilih folder proyek `.celllab` yang sudah ada.
2. Tambah atau ubah profil sel, obat, dan task dari Workbench. Task merujuk sel
   melalui ID, sedangkan dosis obat merujuk obat melalui ID.
3. Simpan proyek menggunakan tombol **Simpan**. Untuk proyek baru, aplikasi
   meminta nama dan lokasi folder; folder `<NamaProyek>.celllab` akan dibuat di
   lokasi yang dipilih.
4. Pilih task dan jalankan simulasi. Kontrol serta setiap dosis dijalankan
   terpisah, lalu ditampilkan bersama untuk perbandingan.
5. Simpan perubahan proyek setelah mengeditnya. Jika proyek sudah memiliki
   folder aktif, bundle hasil ditulis sebagai file JSON di subfolder `results`.
   Untuk proyek yang belum pernah disimpan, simpan proyek setelah simulasi
   agar model dan hasil run ikut masuk ke folder `.celllab`.

Contoh struktur folder proyek:

```text
NamaProyek.celllab
  project.json
  model
    cells
    drugs
  tasks
  functions
  units
  results
```

`functions` dan `units` menyediakan lokasi penyimpanan definisi kustom pada
format proyek; keberadaan file tersebut tidak berarti semua definisi kustom
sudah terhubung ke solver simulasi.

## Teknologi dan struktur kode

- **UI:** React 19, TypeScript, Vite.
- **Desktop host:** Tauri 2 dan Rust.
- **Engine:** Python dengan protokol JSON-RPC melalui stdin/stdout.
- **Penyimpanan proyek:** folder `.celllab` berisi file JSON; runtime aktif
  tidak menggunakan SQLite sebagai penyimpanan proyek.

Pembagian lapisan frontend:

```text
src/domain/       Entitas dan data bawaan
src/usecases/     Alur proyek dan simulasi
src/adapters/     Adapter IPC untuk komunikasi dengan Tauri
src/presentation/ Komponen Workbench dan visualisasi
src-tauri/        Host desktop, command Tauri, dan file project
engine/           Engine komputasi Python
docs/             Status, keputusan, data sumber, dan prototipe referensi
```

Panggilan backend dari UI dilakukan melalui `src/adapters/`, bukan dengan
memanggil command Tauri langsung dari komponen React.

## Referensi dan kredit

CellLab menggunakan **COPASI** sebagai referensi fitur dan desain alur untuk
perangkat lunak pemodelan/simulasi biokimia—termasuk pemisahan identitas
internal dari nama entitas dan pengelolaan project. Referensi tersebut menjadi
inspirasi tingkat konsep; implementasi CellLab dibuat tersendiri dan tidak
menyiratkan kesetaraan fitur, afiliasi, dukungan, atau endorsement dari tim
COPASI.

- COPASI — *Biochemical System Simulator*: <https://copasi.org/>
