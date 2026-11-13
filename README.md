# ULmovi

ULmovi — PHP, SQLite, HTML, CSS va oddiy JavaScript asosida ishlaydigan, o‘zbek tilidagi kino katalogi va video tomosha qilish ilovasi.

## Talablar

- PHP 8.1 yoki yangiroq.
- PHP kengaytmalari: `PDO`, `pdo_sqlite`, `fileinfo`, `mbstring`, `session`.
- Apache va PHP uchun XAMPP tavsiya qilinadi.
- FFprobe video faylini tekshirish uchun kerak; FFmpeg ixtiyoriy va mavjud bo‘lsa qo‘shimcha sifat variantlarini yaratadi.
- Video va posterlarni saqlash uchun yozish huquqi bor disk joyi.

Frontend npm paketlarini talab qilmaydi. SMTP orqali parol tiklash uchun Composer va PHPMailer ishlatiladi.

## O‘rnatish (Windows 11 / XAMPP)

1. XAMPP o‘rnating va Apache xizmatini ishga tushiring.
2. Loyihani `C:\xampp\htdocs\ULmovi` ichiga joylashtiring.
3. Apache hujjat kökü `htdocs` bo‘lib qolsin, so‘ng `http://localhost/ULmovi/public/` manzilini oching. `public/index.html` API uchun `../backend/index.php` manzilidan foydalanadi.
4. `C:\xampp\php\php.ini` faylida yuqoridagi kengaytmalar yoqilganini tekshiring. Video 8 MiB qismlarda yuboriladi; PHP’da 6 GB limit o‘rnatmang. `upload_max_filesize=16M` va `post_max_size=32M` yetarli. Sifat variantlari yoqilgan bo‘lsa `max_execution_time=3600` kabi 255 soniyadan katta qiymat kerak. O‘zgarishdan so‘ng Apache’ni qayta ishga tushiring.
5. Sayt birinchi marta API'ga murojaat qilganda SQLite jadvallari migratsiyalar orqali yaratiladi.

Tavsiya etilgan production sozlamasi: `ULMOVI_DB_PATH` ni web-root tashqarisidagi SQLite fayliga, `ULMOVI_STORAGE_PATH` ni web-root tashqarisidagi yoziladigan papkaga o‘rnating. Standart video saqlash joyi ham loyiha papkasidan tashqarida (`ULmovi-storage`) yaratiladi. `public/` ichidagi yo‘l saqlash joyi sifatida qabul qilinmaydi.

## Birinchi super adminni yaratish

Standart admin hisobi yoki paroli yo‘q. Avval sayt orqali oddiy foydalanuvchi hisobini yarating yoki alohida yangi hisob uchun terminalda kerakli muhit qiymatlarini bering. Quyidagi PowerShell misoli parolni yashirin so‘raydi:

```powershell
$env:ULMOVI_ADMIN_NAME = Read-Host "Ism"
$env:ULMOVI_ADMIN_EMAIL = Read-Host "Email"
$securePassword = Read-Host "Kamida 12 belgili parol" -AsSecureString
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try {
    $env:ULMOVI_ADMIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
    & C:\xampp\php\php.exe C:\xampp\htdocs\ULmovi\backend\setup_admin.php
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
    Remove-Item Env:\ULMOVI_ADMIN_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:\ULMOVI_ADMIN_NAME -ErrorAction SilentlyContinue
    Remove-Item Env:\ULMOVI_ADMIN_EMAIL -ErrorAction SilentlyContinue
}
```

Skript faqat PHP CLI orqali ishlaydi, faol super admin mavjud bo‘lsa hech narsani o‘zgartirmaydi. Oldindan ro‘yxatdan o‘tgan emailni super admin qilish uchun kiritilgan parol mavjud hisob paroliga mos bo‘lishi shart. `ULMOVI_DB_PATH` sozlangan bo‘lsa, skriptni ham ayni shu muhit sozlamasi bilan ishga tushiring.

## Parolni tiklash va SMTP

Parolni unutish so‘rovi email mavjudligini oshkor qilmaydi. Token tasodifiy yaratiladi, bazada faqat SHA-256 hash saqlanadi, havola 30 daqiqa amal qiladi va bir marta ishlatiladi. So‘rovlar har bir email uchun 15 daqiqada 5 taga, IP manzil uchun 30 taga cheklanadi. Parol yangilanganda avvalgi sessiyalar bekor qilinadi.

SMTP paketini loyiha papkasida o‘rnating:

```powershell
composer install
```

Apache ishlaydigan Windows hisobiga quyidagi muhit o‘zgaruvchilarini bering. `Machine` scope uchun PowerShell’ni Administrator sifatida ochish kerak; Apache’ni keyin qayta ishga tushiring. SMTP parolini buyruqqa yozmang, yashirin prompt orqali kiriting:

```powershell
[Environment]::SetEnvironmentVariable('ULMOVI_MAIL_MODE', 'smtp', 'Machine')
[Environment]::SetEnvironmentVariable('ULMOVI_PUBLIC_URL', 'https://your-domain.example', 'Machine')
[Environment]::SetEnvironmentVariable('ULMOVI_SMTP_HOST', 'smtp.your-provider.example', 'Machine')
[Environment]::SetEnvironmentVariable('ULMOVI_SMTP_PORT', '587', 'Machine')
[Environment]::SetEnvironmentVariable('ULMOVI_SMTP_ENCRYPTION', 'tls', 'Machine')
[Environment]::SetEnvironmentVariable('ULMOVI_SMTP_USERNAME', 'no-reply@your-domain.example', 'Machine')
[Environment]::SetEnvironmentVariable('ULMOVI_MAIL_FROM', 'no-reply@your-domain.example', 'Machine')
[Environment]::SetEnvironmentVariable('ULMOVI_MAIL_FROM_NAME', 'ULmovi', 'Machine')
$securePassword = Read-Host 'SMTP paroli' -AsSecureString
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try {
    $smtpPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
    [Environment]::SetEnvironmentVariable('ULMOVI_SMTP_PASSWORD', $smtpPassword, 'Machine')
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
    Remove-Variable smtpPassword -ErrorAction SilentlyContinue
}
```

Email provayderingiz bergan host/user/password’dan foydalaning; port `587` odatda STARTTLS (`tls`), port `465` esa implicit TLS (`ssl`). `ULMOVI_PUBLIC_URL` faqat domenning HTTPS asosiy manzili bo‘lsin. SMTP sozlamasa ham tiklash so‘rovi email mavjudligini bildirmaydigan javob qaytaradi, ammo email yuborilmaydi.

Faqat lokal sinov uchun `ULMOVI_MAIL_MODE=development_file` va `ULMOVI_PUBLIC_URL=http://localhost/ULmovi/public` belgilang. Tiklash linki `ULMOVI_STORAGE_PATH\private_mail` ichida private faylga yoziladi; bu rejimni internetga ochiq saytda ishlatmang va linkni hech qachon ommaviy kanalga joylamang.

## FFmpeg sozlamasi

FFprobe yangi yuklangan MP4/WebM faylida video oqimi, davomiylik, o‘lcham va codec’ni tekshiradi; tekshiruvdan o‘tmagan fayl katalogga chiqarilmaydi. FFmpeg qo‘shimcha sifat variantlari uchun ixtiyoriy. Yo‘llarini backend ishlaydigan muhitda `ULMOVI_FFMPEG` va `ULMOVI_FFPROBE` orqali belgilang. Standart Windows yo‘li `C:\ffmpeg\bin` bo‘lsa, alohida o‘zgaruvchi shart emas. XAMPP Apache jarayoniga muhit o‘zgaruvchilari ko‘rinmasa, Super Admin sozlamalarida to‘liq yo‘lni kiriting:

```powershell
$env:ULMOVI_FFMPEG = 'C:\ffmpeg\bin\ffmpeg.exe'
$env:ULMOVI_FFPROBE = 'C:\ffmpeg\bin\ffprobe.exe'
```

Yuklash vaqtida server source’dan baland bo‘lmagan 360p, 480p, 720p va 1080p variantlarini yaratishga urinadi; ayni source balandligidagi ortiqcha variant yaratilmaydi. FFprobe 45 soniya, barcha FFmpeg variantlari jami 210 soniya bilan cheklangan; bu Apache `Timeout 300` chegarasidan past. Konvertatsiya muvaffaqiyatsiz bo‘lsa asl video qoladi; xato tafsilotlari web-root tashqarisidagi storage logida va PHP error logida yoziladi. Katta kutubxona uchun alohida navbat/worker yoki media server ma’qul.

## Katta video yuklash

- Har bir fayl uchun server chegarasi 6 GiB (6 × 1024³ bayt); brauzer va backend bir xil chegarani tekshiradi.
- Brauzer 8 MiB qismlarni ketma-ket yuboradi; har qism SHA-256 bilan tekshiriladi. Sessiya ID’si admin hisobiga bog‘langan, 7 kun amal qiladi. Sahifa yopilib qolsa, admin qayta kiradi, ayni faylni qayta tanlaydi va yuklashni davom ettiradi.
- Yuklashni vaqtincha to‘xtatish va davom ettirish mumkin. Yakuniy yig‘ish uchun server bo‘sh joyi video hajmining taxminan ikki baravaridan va qo‘shimcha 128 MiB’dan kam bo‘lmasligi kerak.
- `upload_tmp/` vaqtinchalik qismlari storage ichida, `public/` tashqarisida saqlanadi. Muddati tugagan sessiyalar keyingi upload sessiyasi yaratilganda tozalanadi.
- 6 GiB bitta HTTP so‘rovi emas: proxy/tunnel har bir 8 MiB so‘rovga ruxsat berishi kerak. Cloudflare Quick Tunnel’da upload limiti tarmoq/Cloudflare konfiguratsiyasiga bog‘liq; lokal muvaffaqiyat tunnel orqali ham xuddi shunday ishlashini kafolatlamaydi.
- Apache konfiguratsiyasida aniq `LimitRequestBody` qiymati berilmagan bo‘lsa ham, `<Directory .../backend>` yoki VirtualHost’dagi boshqa global limitni tekshiring. 32 MiB limit chunk va poster so‘rovlariga joy qoldiradi. `Timeout 300` qolishi mumkin; har bir chunk alohida so‘rov.

## Ma’lumotlar bazasi va migratsiyalar

- SQLite fayli odatda `backend/ulmovi.db` ichida yaratiladi; `.htaccess` to‘g‘ridan-to‘g‘ri DB va jurnal fayllarini yopadi.
- Migratsiyalar mavjud `users` va `movies` jadvallarini o‘chirmaydi; yangi ustunlar `PRAGMA user_version` va idempotent `CREATE/ALTER TABLE` amallari bilan qo‘shiladi.
- Joriy migratsiya `user_version=5`ga ko‘taradi; upload sessiya/chunk va parol tiklash jadvallarini hamda `session_version` ustunini qo‘shadi. Birinchi API so‘rovi migratsiyani avtomatik bajaradi. Yangilashdan keyin barcha foydalanuvchilar qayta login qilishi mumkin.
- Yangi baza jadvallari: video variantlari, upload sessiyalari/chunklar, layklar, reytinglar, izohlar, reklamalar, tariflar, obunalar, yuklab olishlar, faollik va kirish urinishlari.
- Yangilashdan oldin SQLite faylini va `ULMOVI_STORAGE_PATH` papkasini zaxiralang. Migratsiyalar API ishga tushganda avtomatik tekshiriladi.

## Lokal va Cloudflare sinovi

Apache konfiguratsiyasini tekshiring:

```powershell
& 'C:\xampp\apache\bin\httpd.exe' -t
```

Apache’ni XAMPP Control Panel’dan ishga tushiring. XAMPP Apache servisi o‘rnatilmagan lokal muhitda uni PowerShell’dan vaqtinchalik foreground server sifatida ishga tushirish mumkin; Apache allaqachon ishlayotgan bo‘lsa bu buyruqni takrorlamang:

```powershell
& 'C:\xampp\apache\bin\httpd.exe' -f 'C:\xampp\apache\conf\httpd.conf'
```

Brauzerda `http://127.0.0.1/` ni oching. `ulmovi.local` ishlatilsa, Windows hosts faylida `127.0.0.1 ulmovi.local` qatori bo‘lishi kerak. Web himoyasini tekshirish:

```powershell
curl.exe -sS -o NUL -w '%{http_code}' http://127.0.0.1/phpcheck.php
curl.exe -sS -o NUL -w '%{http_code}' http://127.0.0.1/backend/ulmovi.db
```

Ikkala javob ham `403` bo‘lishi kerak. Cloudflare Quick Tunnel ishlatilsa, Apache lokalda ishlayotgan paytda boshqa PowerShell oynasida:

```powershell
cloudflared tunnel --url http://127.0.0.1:80
```

Tunnel bergan vaqtinchalik HTTPS manzilini oching. Avval kichik video bilan sinang; har bir upload so‘rovi 8 MiB bo‘lsa ham Cloudflare account/tunnel cheklovlari va tarmoq sababli katta uploadning to‘liq ishlashiga kafolat yo‘q.

## Ishlatish

- `public/index.html` — barcha tashrif buyuruvchilar, foydalanuvchilar, Admin va Super Admin uchun yagona boshlang‘ich sahifa va kirish nuqtasi.
- Mehmonlar hisob ochmasdan kinolarni ko‘rishi, qidirishi, janr bo‘yicha filtrlashi, tafsilot va izohlarni ko‘rishi hamda ommaviy videolarni tomosha qilishi mumkin.
- Kirish va oddiy foydalanuvchi hisobini yaratish homepage’dagi modal oynada amalga oshadi. Eski `public/login.html` manzili ham shu oynaga yo‘naltiradi. Umumiy ro‘yxatdan o‘tish faqat oddiy foydalanuvchi hisobini yaratadi.
- Admin va Super Admin homepage’dagi ayni kirish formasidan foydalanadi; haqiqiy rol sessiya orqali serverdagi hisobdan aniqlanadi va tizim ularni tegishli boshqaruv paneliga yo‘naltiradi.
- Admin paneli: faol `admin` yoki `super_admin` hisobi bilan `public/admin.html`.
- Kino yuklash uchun sarlavha, janr, yil va 6 GB gacha MP4/WebM faylni tanlang; poster ixtiyoriy. Admin panelida progress, tezlik, taxminiy qolgan vaqt, pause/resume va bekor qilish mavjud. Fayl nomlari tasodifiy yaratiladi va saqlash yo‘li API orqali tekshiriladi.
- Reklama boshqaruvida banner rasmini yuklash yoki HTTPS manzil berish mumkin; faqat JPG, PNG va WebP qabul qilinadi.
- Ommaviy video mehmonlarga ham uzatiladi; yuklab olish uchun tizimga kirish talab qilinadi. HTTP Range orqali seek ishlaydi; sifat ro‘yxatida faqat bazadagi haqiqiy variantlar chiqadi.
- Profil sahifasida email/ismni yangilash va joriy parolni tasdiqlab parolni almashtirish mumkin.
- Reklama boshqaruvida faqat HTTPS rasm va manzillari qabul qilinadi. Saytga JavaScript kiritish imkoniyati yo‘q.

## Admin va Super Admin vakolatlari

- `admin` kinolar, izohlar, reklamalar va oddiy foydalanuvchilar holatini boshqaradi; u administrator yaratolmaydi, rol o‘zgartira olmaydi yoki global sozlamalarga kira olmaydi.
- `super_admin` alohida bo‘limlarda foydalanuvchi rollari, administrator hisoblari, tizim sozlamalari va ma’muriy faollik jurnalini boshqaradi. Yangi hisob yaratish faqat `admin` rolini beradi; Super Admin roli alohida rol boshqaruvi orqali beriladi.
- Rol va hisob holati o‘zgarishlari, administrator boshqaruvi va global sozlamalar serverda alohida tekshiriladi; boshqaruv panelidagi yashirishlar ruxsat nazorati o‘rnini bosmaydi.
- Oxirgi faol Super Adminni lavozimidan olish yoki to‘xtatish mumkin emas. Har bir POST amal CSRF token bilan himoyalangan.
- Super Admin global sozlamalarda ro‘yxatdan o‘tish, texnik xizmat rejimi, kirish urinishlari limiti va FFmpeg/FFprobe sozlamalarini o‘zgartirishi mumkin. Ma’lumotlar bazasi ulanishi va web-server sozlamalari paneldan o‘zgartirilmaydi.
- Obuna va to‘lov amallari o‘chirilgan; rol tizimi ularni faollashtirmaydi.
- Mehmonlar like, baholash, izoh yozish, profil yoki boshqaruv panelidan foydalana olmaydi. Like/baho/izoh va barcha ma’muriy amallar backend’da sessiya/rol bilan tekshiriladi; mehmonning to‘g‘ridan-to‘g‘ri API so‘rovlari rad etiladi.
- Kirish, ro‘yxatdan o‘tish va chiqish homepage’dagi yagona auth interfeysidan foydalanadi. Chiqish server sessiyasini tugatib, foydalanuvchi menyusini mehmon navigatsiyasiga qaytaradi. “Parolni unutdingizmi?” email orqali 30 daqiqalik bir martalik tiklash havolasini yuboradi.

## Xavfsizlik va mavjud cheklovlar

- Parollar `password_hash` bilan saqlanadi; login urinishlari email va IP bo‘yicha cheklanadi.
- POST amallari CSRF token bilan himoyalangan; ruxsatlar backendda tekshiriladi.
- Video/poster MIME turi serverda aniqlanadi, nomlar xavfsiz tasodifiy qiymatga almashtiriladi, fayllar web-root tashqarisida saqlanadi.
- Yuklab olish uchun tizimga kirish talab qilinadi. Hozirgi tariflar kelajak tuzilmasi xolos: to‘lovlar yoqilmagan va karta ma’lumoti yig‘ilmaydi.
- Xavfsiz cookie uchun production muhitida HTTPS ishlating. Boshqa web-server ishlatilsa, `.htaccess` o‘rniga SQLite/storage uchun unga mos kirish taqiqlarini sozlang.

## Muammolarni aniqlash

- DB ulanish xatosi: PHP `pdo_sqlite` kengaytmasi yoqilganini va DB papkasiga yozish huquqini tekshiring.
- Video yuklash xatosi: PHP `upload_max_filesize` 16M va `post_max_size` 32M ekanini, storage’da video hajmining 2x + 128 MiB joy borligini, papka ruxsatlarini va PHP error logini tekshiring. 413 javobida PHP/Apache/tunnel so‘rov limitini aniqlang.
- Video tekshiruvi xatosi: FFprobe to‘liq yo‘li va PHP/Apache foydalanuvchisining executable’ni ishga tushira olishini tekshiring. Ichki yo‘llar foydalanuvchiga ko‘rsatilmaydi; texnik tafsilotlar private logda qoladi.
- FFmpeg variantlari yo‘q: `ULMOVI_FFMPEG` yo‘li, codec imkoniyatlari va private FFmpeg logini tekshiring. Asl video mavjud sifat sifatida saqlanadi.
- Video oqimi/seek ishlamasa: Apache/PHP Range so‘rovlarini uzatishi, session cookie va fayl ruxsatlarini tekshiring.


### Alwaysdata HTTPS xavfsizlik sozlamasi

Sayt HTTPS orqali ishlayotgan production serverda `ULMOVI_FORCE_SECURE_COOKIES=1` muhit o‘zgaruvchisini sozlang. Bu reverse-proxy ortida PHP `HTTPS` qiymatini ko‘rmasa ham sessiya cookie’lariga `Secure` atributini majburiy qo‘llaydi. O‘zgaruvchini faqat HTTPS to‘liq yoqilgan production domenida ishlating.
