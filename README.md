# ULmovi

<p align="center">
  <strong>O‘zbek tilidagi kino katalogi va video tomosha qilish platformasi</strong><br>
  Filmlarni kashf etish, tomosha qilish va hamjamiyat bilan fikr almashish uchun web-ilova.
</p>

<p align="center">
  <a href="https://github.com/ulugbek3337/ULmovi">GitHub repository</a> ·
  <a href="https://ulmovi.alwaysdata.net/">Jonli sayt</a> ·
  <a href="https://github.com/ulugbek3337/ULmovi/issues">Xatolik va takliflar</a>
</p>

---

## Loyiha haqida

**ULmovi** — PHP, SQLite, HTML, CSS va JavaScript asosida yaratilgan, o‘zbek tilidagi kino platformasi. Loyiha yengil hosting muhitida ishlashni hisobga oladi va frontend uchun Node.js build jarayonini talab qilmaydi.

## Imkoniyatlar

- Mehmonlar uchun ochiq kino katalogi, qidiruv va janr bo‘yicha filtrlash.
- Video pleer, mavjud sifat variantlarini tanlash va HTTP Range orqali videoda oldinga-orqaga o‘tish.
- Foydalanuvchi ro‘yxatdan o‘tishi, tizimga kirishi va profilini boshqarishi.
- Sevimlilar, baholash va izohlar.
- Admin va Super Admin uchun alohida vakolatlar bilan boshqaruv paneli.
- Video va posterlarni administrator tomonidan yuklash; katta videolarni 8 MiB qismlarda yuborish va davom ettirish.
- Reklama va ijtimoiy havolalarni boshqarish.
- Parolni email orqali tiklash (SMTP sozlanganda).
- SQLite migratsiyalari va web-root tashqarisida fayl saqlash.

> **Eslatma:** obuna va to‘lov modullari hozircha faol emas. Tariflar mavjudligi to‘lov qabul qilinayotganini anglatmaydi.

## Texnologiyalar

| Qism | Texnologiya |
|---|---|
| Backend | PHP 8.1+ |
| Ma’lumotlar bazasi | SQLite / PDO |
| Frontend | HTML5, CSS3, Vanilla JavaScript |
| Web-server | Apache |
| Email | PHPMailer (ixtiyoriy, Composer orqali) |
| Media tekshiruvi | FFprobe; FFmpeg ixtiyoriy |

## Loyiha tuzilishi

```text
ULmovi/
├── backend/          # PHP API, bootstrap, migratsiyalar va CLI skriptlar
├── public/           # Web-root: HTML, CSS, JavaScript va public assetlar
├── tests/            # Avtomatlashtirilgan smoke-testlar
├── docs/             # Texnik hujjatlar va audit rejalari
├── .github/          # GitHub Actions va contribution shablonlari
├── composer.json     # PHP bog‘liqliklari
└── README.md
```

Maxfiy konfiguratsiya, SQLite bazasi, loglar va yuklangan media fayllar Git orqali tarqatilmasligi kerak. Production muhitida database va media storage web-root tashqarisida saqlanishi lozim.

## Tezkor ishga tushirish (Windows + XAMPP)

### Talablar

- PHP 8.1 yoki yangiroq.
- PHP kengaytmalari: `PDO`, `pdo_sqlite`, `fileinfo`, `mbstring`, `session`.
- Apache va yozish huquqiga ega storage papkasi.
- FFprobe — video fayllarni tekshirish uchun.
- Composer — SMTP/PHPMailer ishlatilsa.

### O‘rnatish

1. Repositoriyani `C:\\xampp\\htdocs\\ULmovi` ichiga klonlang.
2. XAMPP Control Panel orqali Apache’ni ishga tushiring.
3. Brauzerda `http://localhost/ULmovi/public/` manzilini oching.
4. PHP kengaytmalari yoqilganini va backend hamda storage papkalariga kerakli ruxsatlar berilganini tekshiring.
5. Birinchi API murojaatida SQLite migratsiyalari bajariladi.

Frontend uchun `npm install` talab qilinmaydi.

### Birinchi Super Admin

Standart login yoki parol mavjud emas. Birinchi Super Admin faqat CLI orqali yaratiladi:

```powershell
$env:ULMOVI_ADMIN_NAME = Read-Host "Ism"
$env:ULMOVI_ADMIN_EMAIL = Read-Host "Email"
$securePassword = Read-Host "Kamida 12 belgili parol" -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try {
    $env:ULMOVI_ADMIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    & C:\\xampp\\php\\php.exe C:\\xampp\\htdocs\\ULmovi\\backend\\setup_admin.php
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
    Remove-Item Env:\\ULMOVI_ADMIN_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:\\ULMOVI_ADMIN_NAME -ErrorAction SilentlyContinue
    Remove-Item Env:\\ULMOVI_ADMIN_EMAIL -ErrorAction SilentlyContinue
}
```

Skriptni loyiha ildizidagi `backend/setup_admin.php` fayliga mos PHP CLI bilan ishga tushiring. Production’da `ULMOVI_DB_PATH` ishlatilsa, skriptga ham ayni muhit qiymatini bering.

## Konfiguratsiya va media storage

Muhim production sozlamalari muhit o‘zgaruvchilari orqali beriladi:

- `ULMOVI_DB_PATH` — SQLite faylining web-root tashqarisidagi yo‘li.
- `ULMOVI_STORAGE_PATH` — video, poster, vaqtinchalik upload va private loglar uchun web-root tashqarisidagi papka.
- `ULMOVI_FFPROBE` — FFprobe executable yo‘li.
- `ULMOVI_FFMPEG` — FFmpeg executable yo‘li (ixtiyoriy).
- `ULMOVI_PUBLIC_URL` va `ULMOVI_SMTP_*` — parol tiklash email xizmati uchun.

**Hech qachon** maxfiy qiymatlarni GitHub’ga, frontend JavaScript’ga yoki ommaviy loglarga joylamang.

Katta video yuklash brauzerda 8 MiB qismlarga bo‘linadi. Faylning amaldagi maksimal hajmi server va klient tekshiruvlari bilan belgilanadi; hosting/proxy limitlari ham hisobga olinishi kerak.

## Xavfsizlik

- Parollar xavfsiz hash ko‘rinishida saqlanadi.
- Backend sessiya, rol va CSRF tekshiruvlarini bajaradi.
- Login va ayrim autentifikatsiya so‘rovlari rate limit bilan cheklanadi.
- Video va boshqa foydalanuvchi fayllari web-root tashqarisida saqlanishi kerak.
- Production faqat HTTPS orqali ishlashi lozim.

Xavfsizlik zaifligini ommaviy issue sifatida emas, GitHub’ning **Private vulnerability reporting / Security Advisories** mexanizmi orqali xabar qiling. Batafsil: [SECURITY.md](SECURITY.md).

## Test va sifat nazorati

Loyiha ichidagi mavjud testlar:

- PHP sintaksis tekshiruvlari: `php -l`
- PHP smoke-testlar: `tests/`
- Frontend smoke-testlar: `tests/`
- GitHub Actions workflow’lari: `.github/workflows/`

O‘zgartirish yuborishdan oldin tegishli testlarni ishga tushiring va `git diff --check` bilan whitespace xatolarini tekshiring. Faqat lokal testdan o‘tganlik production muhitida to‘liq ishlashini kafolatlamaydi.

## Hissa qo‘shish

Taklif, xatolik tuzatishi va yangi imkoniyatlar uchun issue yoki pull request ochishingiz mumkin. Katta o‘zgarishdan oldin issue orqali muhokama qilish tavsiya etiladi.

1. Alohida branch yarating.
2. O‘zgarishni kichik va aniq commitlarga ajrating.
3. Mavjud API, database va role tekshiruvlarini buzmasligiga ishonch hosil qiling.
4. Tegishli testlarni bajaring.
5. PR’da o‘zgarish, test natijasi va deployment xavfini yozing.

Batafsil: [CONTRIBUTING.md](CONTRIBUTING.md).

## Deployment bo‘yicha muhim qoida

GitHub’dagi branch yoki pull request production serverga avtomatik ravishda deploy qilinmaydi, agar alohida deployment workflow sozlanmagan bo‘lsa. Alwaysdata kabi shared hostingga chiqarishdan oldin storage/DB backup oling, migratsiyalarni tekshiring va staging sinovini bajaring.

## Litsenziya

Ushbu repository uchun litsenziya alohida belgilanmaguncha, koddan foydalanish, nusxalash yoki tarqatish huquqi avtomatik ravishda berilgan deb hisoblanmaydi.
