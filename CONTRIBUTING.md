# Hissa qo‘shish bo‘yicha qo‘llanma

ULmovi’ga hissa qo‘shayotganingiz uchun rahmat. Quyidagi qoidalar kodni ko‘rib chiqish va xavfsiz chiqarishni osonlashtiradi.

## Ish jarayoni

1. Mavjud issue’larni tekshiring yoki yangi issue ochib, taklifni muhokama qiling.
2. `main` dan alohida, maqsadni bildiruvchi branch yarating (masalan, `fix/login-rate-limit` yoki `feat/movie-filters`).
3. Bitta PR’da imkon qadar bitta mantiqiy vazifani bajaring.
4. Commit xabarlarini qisqa va mazmunli yozing.
5. PR ochishdan oldin testlar va `git diff --check` ni bajaring.

## Kodga qo‘yiladigan talablar

- Mavjud PHP/JavaScript uslubi va arxitekturasiga mos yozing.
- Frontend’da foydalanuvchi kiritgan matnni HTML sifatida bevosita joylamang; xavfsiz DOM API’lardan foydalaning.
- Har bir himoyalangan API amali backend’da sessiya, rol va CSRF bo‘yicha tekshirilsin.
- DB o‘zgarishlari mavjud ma’lumotlarni yo‘qotmaydigan, qayta bajarishga chidamli migratsiya bilan kiritilsin.
- Fayl yuklashda MIME, hajm, nom va storage yo‘li serverda tekshirilsin.
- Yangi bog‘liqlik qo‘shish zarur bo‘lmasa, mavjud yengil arxitekturani saqlang.
- Maxfiy kalitlar, parollar, tokenlar va haqiqiy foydalanuvchi ma’lumotlarini commit qilmang.

## Testlar

O‘zgarish turiga qarab quyidagilarni bajaring:

```bash
php -l backend/index.php
php -l backend/bootstrap.php
git diff --check
```

Tegishli `tests/` smoke-testlarini va GitHub Actions tekshiruvlarini ham ishga tushiring. Test mavjud bo‘lmasa, PR’da qo‘lda tekshirgan holatlaringizni yozing.

## Pull request tavsifi

PR’da quyidagilar bo‘lsin:

- Nima o‘zgardi va nima uchun?
- Qaysi fayllar yoki modullar ta’sirlandi?
- Qanday testlar bajarildi va natijasi qanday?
- Database migratsiyasi, muhit o‘zgaruvchisi yoki server sozlamasi kerakmi?
- Production deployment yoki rollback uchun alohida qadam bormi?

## Muhim

- `main` ga to‘g‘ridan-to‘g‘ri commit qilmang.
- Ishlayotgan backend, admin panel, Google Drive integratsiyasi yoki production storage’ni tasdiqlanmagan o‘zgarish bilan almashtirmang.
- Production deployment alohida backup, staging tekshiruvi va tasdiqdan keyin bajariladi.
