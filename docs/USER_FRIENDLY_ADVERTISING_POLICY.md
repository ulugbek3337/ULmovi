# ULmovi — foydalanuvchiga qulay reklama siyosati

**Holat:** Taklif etilgan mahsulot siyosati  
**Maqsad:** Reklama daromadini oshirish bilan birga tomosha tajribasini buzmaslik.

## 1. Asosiy tamoyil

Foydalanuvchi tajribasi reklama daromadidan ustun. Reklama kontentni topish, kino tafsilotlarini ko'rish yoki video tomosha qilishga xalaqit bermasligi kerak.

## 2. Tasdiqlangan sozlamalar

- **Chastota:** O'rtacha (medium).
- **Video reklama:** Faqat foydalanuvchi aniq rozilik bildirsa (optional); rozilik keyingi tashriflarda ham eslab qolinadi va foydalanuvchi sozlamadan bekor qila olishi kerak.
- **Reklamani yashirish:** Ha. Har bir reklama kartasida ko'rinadigan "Yashirish" amali bo'ladi.

## 3. Joylashuv va chastota

| Joy | Siyosat |
| --- | --- |
| Bosh sahifa | Sahifa yuqorisida ko'pi bilan bitta asosiy banner |
| Kino katalogi | Har 12 ta kino kartasidan keyin ko'pi bilan bitta reklama bloki |
| Kino tafsilotlari | Tafsilotlar tarkibining pastida bitta ixcham banner |
| Video pleer | Roziliksiz reklama yo'q; avtomatik interstitial yo'q |
| Pop-up | Yo'q |
| Avtomatik ovozli/video ijro | Yo'q |

Bir sahifa ko'rinishida bir xil reklama qayta-qayta ko'rsatilmasin. Reklama bloklari kontent joylashuvini keskin siljitmasin; banner o'lchami oldindan ajratilsin.

## 4. Video reklama roziligi

- Video reklama sukut bo'yicha o'chirilgan.
- Faqat foydalanuvchi aniq ravishda "Video reklamani ko'rishga roziman" amalini bajarganidan keyin ishga tushishi mumkin.
- Rozilik bir martalik va aniq bo'ladi; uni bekor qilish oson bo'lishi kerak.
- Rozilik bo'lmasa, pleer odatdagidek ishlaydi.
- Reklama pleer boshqaruvlarini yashirmasligi va avtomatik ovoz chiqarmasligi kerak.

## 5. Reklamani yashirish

- Har bir reklama uchun "Reklamani yashirish" boshqaruvi ko'rinadigan bo'ladi.
- Yashirish darhol joriy foydalanuvchi interfeysida qo'llanadi.
- Yashirish sababi ixtiyoriy fikr-mulohaza sifatida so'ralishi mumkin, lekin majburiy emas.
- Yashirilgan reklama shu sessiyada qayta ko'rsatilmaydi; keyingi bosqichda hisobga bog'langan uzoq muddatli afzallik qo'shilishi mumkin.

## 6. Reklama sifati va xavfsizlik

- Har bir tijoriy blok "Reklama" yoki "Homiylik" deb aniq belgilanadi.
- Faqat HTTPS manzillar va ruxsat etilgan rasm formatlari ishlatiladi.
- Yolg'on, zararli, aldovchi yoki ULmovi auditoriyasiga mos bo'lmagan reklamalar rad etiladi.
- Yangi tab ochish faqat aniq foydalanuvchi bosishidan keyin; avtomatik yo'naltirish taqiqlanadi.
- Bannerlar mobil va desktop ekranlariga mos bo'ladi; alohida mobil rasm ixtiyoriy.

## 7. O'lchash va nazorat

Quyidagi ko'rsatkichlar reklama samaradorligini va foydalanuvchi bezovtaligini kuzatish uchun kerak:

- ko'rsatishlar (impressions);
- bosishlar (clicks);
- CTR;
- yashirishlar va yashirish sabablari;
- har bir joylashuv bo'yicha natijalar.

Statistika imkon qadar agregat ko'rinishda saqlansin. Keraksiz shaxsiy kuzatuv, fingerprinting yoki maxfiy profil yaratish qo'llanilmasin.

## 8. Ishga tushirish mezonlari

- Reklama pleerda roziliksiz ko'rinmaydi.
- Pop-up va avtomatik ijro mavjud emas.
- "Yashirish" amali ishlaydi.
- Mobil va desktop bannerlar buzilmaydi.
- Admin reklama joyi, faol holati va jadvalini boshqara oladi.
- API ruxsatlari, URL tekshiruvi va migratsiya testlari o'tadi.
- O'zgarishlar staging muhitida tekshirilmaguncha production'ga chiqarilmaydi.

## 9. Amalga oshirish bosqichlari

1. Reklama joylashuvi va chastotasini boshqarish.
2. "Reklamani yashirish" va ko'rsatish chastotasi cheklovlari.
3. Admin panelida muddat, prioritet, mobil banner boshqaruvi.
4. Ko'rsatish/bosish/yashirish statistikasi.
5. Foydalanuvchi roziligi bilan video reklama — alohida, keyingi bosqich.
6. Staging sinovlari va asta-sekin ishga tushirish.

**Muhim:** Bu hujjat siyosatni belgilaydi. Video reklama roziligi, statistika va yangi banner joylari amaliy kodda bosqichma-bosqich amalga oshirilishi va testdan o'tishi shart.
