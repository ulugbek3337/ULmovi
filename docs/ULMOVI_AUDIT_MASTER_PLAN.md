# ULmovi — yagona audit va ishlar reyestri

**Loyiha:** https://github.com/ulugbek3337/ULmovi  
**Audit branch:** `security-audit-fixes-2026-11`  
**Bog‘langan PR:** https://github.com/ulugbek3337/ULmovi/pull/1  
**Holat:** davom etmoqda; bu hujjat ish reyestri, xavfsizlik kafolati emas.

**Yangi o‘zgarish:** video transkodlashni upload HTTP so‘rovidan ajratish uchun schema v7 va CLI job worker tayyorlanmoqda; Alwaysdata scheduled task sozlanishi staging sinovidan keyin bajariladi.

> Muhim: bu hujjatda faqat loyiha auditi, topilmalar, qarorlar va bajariladigan ishlar saqlanadi. Parollar, API kalitlari, hosting maxfiy sozlamalari, foydalanuvchilarning shaxsiy ma’lumotlari yoki haqiqiy video fayllarini GitHub’ga joylamang.

## 1. Ishlash qoidalari

- Barcha audit va tuzatishlar `security-audit-fixes-2026-11` branchida bajariladi.
- `main` branchga merge qilish va Alwaysdata production saytiga chiqarish faqat alohida aniq ruxsatdan keyin.
- Production bazasi yoki foydalanuvchi ma’lumotlari bilan tajriba qilinmaydi.
- Sinovlar alohida test/staging bazasi va sun’iy ma’lumotlar bilan bajariladi.
- “100% xavfsiz” degan kafolat berilmaydi; har bir tekshiruv natijasi dalil va test bilan qayd qilinadi.
- Pullik obuna/to‘lov tizimi hali ishlab chiqilmagan; mavjud tarif jadvali to‘liq to‘lov jarayoni borligini anglatmaydi.

## 2. Bajarilgan ishlar

### Birinchi xavfsizlik tuzatishlari
PR #1 da quyidagi o‘zgarishlar kiritilgan:
- `public/.htaccess`: xavfsizlik direktivalari tartibga solingan, CSP’da `object-src 'none'`, HSTS qo‘shilgan.
- `backend/bootstrap.php`: HTTPS reverse-proxy holati uchun `ULMOVI_FORCE_SECURE_COOKIES=1` sozlamasi, SQLite schema v6 va ro‘yxatdan o‘tish urinishlari jadvali.
- `backend/index.php`: IP bo‘yicha ro‘yxatdan o‘tish urinishlarini cheklash.
- `public/js/api.js`: oddiy fetch so‘rovlarida ham abort signal uzatiladi.
- `README.md`: Alwaysdata HTTPS sozlamasi hujjatlashtirilgan.
- `tests/bootstrap_smoke.php`: yangi baza va v5 dan v6 ga migratsiya smoke-testi.
- `.github/workflows/ci.yml`: PHP sintaksisi, SQLite migratsiyasi, JS sintaksisi va Composer manifest tekshiruvi.

### CI
- GitHub Actions PR tekshiruvi muvaffaqiyatli yakunlangan (avvalgi tekshiruv qaydi: run 43479703579).
- Bu natija sintaksis va migratsiya smoke-testlarini bildiradi; staging yoki production integratsion testlari bajarilganini bildirmaydi.

### Kod ko‘rigida tekshirilgan himoyalar
- Parollar `password_hash()` / `password_verify()` bilan ishlanadi.
- POST so‘rovlarida CSRF tekshiruvi mavjud.
- Izohni tahrirlash/o‘chirishda egalik yoki admin huquqi tekshiriladi.
- Video yuklab olish autentifikatsiyani talab qiladi.
- Media yo‘llari storage ichida ekanligi realpath orqali tekshiriladi.
- Upload’lar MIME tekshiruvi va tasodifiy nomlardan foydalanadi; bo‘laklar SHA-256 bilan tekshiriladi.
- FFmpeg/FFprobe argumentlari shell satri sifatida birlashtirilmaydi, argumentlar ro‘yxati bilan ishga tushiriladi.
- `setup_admin.php` CLI-only.
- Frontend JS ko‘rigida xavfli HTML kiritish API’lari (`innerHTML`, `outerHTML`, `eval`, `document.write`) topilmagan.

## 3. Hozirgi aniqlangan ehtimoliy muammo

- `admin_add_movie` va `admin_save_ad` amallarida fayl storage’ga yozilgandan keyin keyingi DB amali muvaffaqiyatsiz bo‘lsa, orphan (bazaga bog‘lanmagan) fayl qolishi mumkin.
- Buni xavfsiz kompensatsion tozalash va testlar bilan mustahkamlash kerak. Fayl o‘chirishda faqat server tomonidan tasdiqlangan storage-relative yo‘llardan foydalanish shart.

## 4. Qolgan ishlar — nazorat ro‘yxati

### A. Fayl yuklash va storage
- [ ] `admin_add_movie` jarayonida DB rollback bo‘lsa yangi video/poster fayllarini tozalash.
- [ ] `admin_save_ad` jarayonida DB update/insert muvaffaqiyatsiz bo‘lsa yangi rasmni tozalash.
- [ ] Eski rasmni faqat DB yangilanishi muvaffaqiyatli commit bo‘lgandan keyin o‘chirish.
- [ ] Upload finalize xatolarida vaqtinchalik fayl va DB statusi mosligini tekshirish.
- [ ] Parallel chunk/finalize/cancel holatlarini testlash.
- [ ] Muddati tugagan upload sessiyalari va orphan fayllar uchun xavfsiz cleanup testlari.

### B. Autentifikatsiya va hisoblar
- [ ] Login, register, forgot/reset password rate limitlarini tekshirish.
- [ ] Reset tokenning bir martalik ishlatilishi, muddati, hash saqlanishi va qayta yuborish holatlarini testlash.
- [ ] Login va parol tiklash javoblarida email enumeration bor-yo‘qligini tekshirish.
- [ ] Session ID rotation, session_version, logout va parol almashish holatlarini testlash.
- [ ] Email o‘zgartirish va administrator hisobini boshqarish qoidalarini tekshirish.

### C. Ruxsatlar va API
- [ ] Har bir admin endpoint uchun oddiy user/guest/admin/super_admin test matritsasi.
- [ ] Foydalanuvchi ID, kino ID, reklama ID va upload ID orqali IDOR sinovlari.
- [ ] HTTP method, CSRF, input validation va javob kodlari.
- [ ] Faol super_adminni tasodifan yo‘qotish yoki huquqni oshirish holatlari.

### D. Video va media
- [ ] `stream_video` Range so‘rovlari: 200/206/416, Content-Length va Content-Range.
- [ ] Ruxsatsiz fayl yo‘li, noto‘g‘ri quality va mavjud bo‘lmagan media ID sinovlari.
- [ ] Mehmonlar uchun ochiq ko‘rish siyosati va kelajakdagi pullik kontent qoidalarini aniq belgilash.
- [ ] 6 GB upload chegarasini faqat staging muhitida tekshirish; PHP, web server, disk va hosting limitlarini hisobga olish.
- [ ] FFmpeg/FFprobe Alwaysdata’da mavjudligi va ruxsatlarini tekshirish.
- [ ] Video transkodlash job queue workerini Alwaysdata scheduled task’da sozlash va loglarini tekshirish.
- [ ] Original video upload javobi va fon konvertatsiyasi staging’da alohida test qilinishi.

### E. Obunalar va to‘lovlar
- [ ] Hozirgi `subscription_plans` endpointi faqat tariflarni qaytarishini hujjatlashtirish.
- [ ] To‘lov provayderi, webhook imzosi, idempotency, bekor qilish/qaytarish va obuna muddati uchun alohida texnik loyiha.
- [ ] To‘lov tasdiqlanmaguncha pullik huquq berilmasligini kafolatlaydigan server-side entitlement tekshiruvi.
- [ ] Foydalanuvchi va admin uchun obuna holati/API testlari.

### F. Hosting va HTTP xavfsizligi
- [ ] Alwaysdata HTTPS faol ekanini tasdiqlash.
- [ ] Hosting environment’da `ULMOVI_FORCE_SECURE_COOKIES=1` o‘rnatish (faqat HTTPS to‘liq faol bo‘lgach).
- [ ] Session cookie Secure, HttpOnly, SameSite parametrlarini real response’da tekshirish.
- [ ] CSP, HSTS, nosniff, Referrer-Policy va frame protection headerlarini tekshirish.
- [ ] PHP error display o‘chiq, loglar web’dan tashqarida ekanini tekshirish.
- [ ] Storage va SQLite DB public webroot tashqarisida ekanini tekshirish.

### G. Frontend va UX
- [ ] Auth, profil, parol tiklash, admin panel va guest flow’larni brauzerda sinash.
- [ ] API xatolarida foydalanuvchiga xavfsiz va tushunarli xabar ko‘rsatish.
- [ ] Mobil ekran, klaviatura navigatsiyasi va forma validatsiyasi.
- [ ] Eski `Desktop/ULmovi/` nusxasi faol build/deploy jarayoniga aralashmasligini tekshirish; o‘chirishdan oldin egasining ruxsati kerak.

### H. Yakuniy tekshiruv
- [ ] CI to‘liq yashil.
- [ ] Staging integratsion testlari o‘tgan.
- [ ] Backup/restore sinovi bajarilgan.
- [ ] PR o‘zgarishlari ko‘rib chiqilgan.
- [ ] Faqat shundan keyin foydalanuvchidan merge/deploy uchun alohida ruxsat so‘rash.

## 5. Staging uchun kerak bo‘ladigan ma’lumotlar

Production maxfiy ma’lumotlarini chatga yoki GitHub’ga yubormang. Staging sinovi uchun alohida test muhitida:
- alohida test SQLite bazasi;
- test admin va oddiy foydalanuvchi;
- test email yoki SMTP sandbox;
- storage’da kichik sinov video/rasmlar;
- FFmpeg va FFprobe yo‘llari;
- HTTPS va PHP/web-server limitlari.

Agar saytning production bazasida hali kino, foydalanuvchi yoki obuna ma’lumotlari bo‘lmasa, testlar sun’iy ma’lumotlar bilan bajariladi. Bu production ma’lumotlarini yaratish yoki o‘zgartirishga ruxsat degani emas.

## 6. Hozirgi cheklovlar

- Alwaysdata production muhitida test bajarilgani tasdiqlanmagan.
- Katta hajmli video yuklash va real streaming hali staging’da sinovdan o‘tmagan.
- To‘lov integratsiyasi mavjud deb hisoblanmaydi.
- Bu audit avtomatik skan va ko‘rib chiqish natijalariga tayangan; mustaqil penetration test o‘rnini bosmaydi.

## 7. Ish yuritish

Har bir yangi topilma uchun quyidagilarni qayd et:
1. Sana va branch/commit.
2. Fayl va funksiya.
3. Muammo va ta’siri.
4. Tuzatish.
5. Qo‘shilgan test.
6. CI natijasi.
7. Staging natijasi.
8. Qolgan xavf yoki cheklov.

**Keyingi ish:** A bo‘limidan — upload/storage xatolarida orphan fayllarni oldini olishdan boshlash.
