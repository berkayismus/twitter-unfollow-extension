# Twitter/X Auto Unfollow - Chrome Extension

Seni takip etmeyen kullanıcıları otomatik tespit edip takipten çıkaran Chrome eklentisi.

## 🎯 Özellikler

### Temel Özellikler
- ✅ Otomatik scroll ve kullanıcı taraması
- ✅ "Follows you" badge'i olmayan kullanıcıları tespit eder
- ✅ 2-5 saniye rastgele gecikmelerle güvenli çalışma
- ✅ Oturum başına 100 kişi limiti (50+50 batch system)
- ✅ 24 saatte otomatik counter sıfırlama
- ✅ Batch modu: İlk 50 kişide durup onay ister
- ✅ Toplam istatistik saklama
- ✅ Akıllı rate limit koruması ve otomatik devam

### Gelişmiş Özellikler
- 🔍 **Keywords Filter**: Bio'da belirli kelimeleri içeren kullanıcıları atla
- 🛡️ **Whitelist**: Belirli kullanıcıları koruma altına al
- 📊 **30 Günlük Chart**: Chartist.js ile görsel istatistikler
- 📥 **CSV Export**: İşlem geçmişini CSV olarak indir
- 🌙 **Dark Mode**: Karanlık tema desteği
- 📈 **Progress Bar**: Gerçek zamanlı ilerleme ve ETA
- 📋 **User List**: İşlenen kullanıcıların canlı listesi
- 🧪 **Dry-Run Mode**: Gerçekte takipten çıkmadan test et
- ↶ **Undo System**: Son işlemleri geri al (persistent)
- ⏱️ **Smart Rate Limit**: 15 dakika sonra otomatik devam

## 📦 Kurulum

### Lokal Kurulum (Geliştirici Modu)

1. Bu klasörü bilgisayarınıza indirin
2. Chrome'da `chrome://extensions` sayfasını açın
3. Sağ üstten "Developer mode" (Geliştirici modu) aktif edin
4. "Load unpacked" (Paketlenmemiş yükle) butonuna tıklayın
5. Bu klasörü seçin
6. Eklenti yüklendi! 🎉

### Chrome Web Store'dan Kurulum (Yakında)

Extension Chrome Web Store'da yayınlandıktan sonra direkt oradan kurulabilecek.

## 🚀 Kullanım

1. Twitter/X hesabınıza giriş yapın
2. "Following" (Takip Edilenler) sayfasına gidin:
   - `https://twitter.com/[kullanıcı-adınız]/following`
   - veya `https://x.com/[kullanıcı-adınız]/following`
3. Eklenti simgesine tıklayın
4. **Opsiyonel:** Filtreler tab'ından keywords veya whitelist ekleyin
5. **Opsiyonel:** Dry-run mode'u aktif edin (gerçekte takipten çıkmadan test için)
6. "Başlat" butonuna tıklayın
7. İlk 50 kullanıcıdan sonra onay isteyecek (Batch Modu)
8. "Devam Et" diyerek ikinci 50 kişilik batch'e geçin
9. İstediğiniz zaman "Durdur" ile durdurabilirsiniz
10. İstatistikler tab'ından geçmişi görebilir ve CSV olarak indirebilirsiniz

## ⚙️ Ayarlar ve Limitler

- **Oturum Limiti**: 100 kişi/oturum (50+50 batch system)
- **Batch Sistemi**: İlk 50 kişi → Onay → İkinci 50 kişi
- **Toplam Limit**: Sınırsız (istatistik olarak tutuluyor)
- **Gecikme**: 2-5 saniye (rastgele)
- **Reset**: 24 saat sonra otomatik
- **Rate Limit**: 15 dakika otomatik bekleme ve devam
- **Undo Queue**: Son 10 işlem geri alınabilir
- **History**: 30 günlük geçmiş saklanır

## ⚠️ Önemli Uyarılar

1. **Rate Limit**: Twitter/X günlük işlem limitleri vardır. Eğer çok fazla işlem yaparsanız geçici olarak kısıtlanabilirsiniz.
2. **Ban Riski**: Bu eklenti dikkatli kullanılmalıdır. Aşırı kullanım hesap kısıtlamalarına yol açabilir.
3. **Geri Alma**: Takipten çıkarılan kişileri otomatik geri takip etmez, manuel eklemeniz gerekir.
4. **Doğruluk**: Twitter/X ara sıra sayfa yapısını değiştirir, bu durumda eklenti çalışmayabilir.

## 🛠️ Teknik Detaylar

### Teknolojiler
- Chrome Extension Manifest V3
- Vanilla JavaScript (No frameworks)
- Chrome Storage API
- Chrome Messaging API

### Dosya Yapısı
```
twitter-unfollow-extension/
├── manifest.json          # Extension configuration (Manifest V3)
├── background.js          # Service worker for message relay
├── content.js             # Main automation logic (564 lines)
├── popup.html             # 3-tab UI (Ana/Filtreler/İstatistikler)
├── popup.js               # UI controller and handlers (693 lines)
├── styles.css             # CSS with dark mode support (464 lines)
├── lib/                   # External libraries
│   ├── chartist.min.js   # Chart library
│   └── chartist.min.css  # Chart styles
├── icons/                 # Extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md              # This file
```

### Güvenlik Önlemleri
- Rastgele gecikmeler (2-5 saniye)
- Oturum limitleri (100 kişi)
- Organik duraklamalar (%10 rastgele)
- Rate limit tespiti
- 24 saatlik reset mekanizması

## 🤝 Katkıda Bulunma

Bu proje MVP (Minimum Viable Product) olarak geliştirilmiştir. Katkılarınızı bekliyoruz!

## 📄 Lisans

Bu proje kişisel kullanım içindir. Ticari kullanım için iletişime geçin.

## 🐛 Bilinen Sorunlar

- Twitter/X sayfa yapısı değişirse selektörler güncellenmelidir
- Virtual scrolling bazen tüm kullanıcıları yüklemeyebilir
- Rate limit durumunda manuel bekleme gerekir

## 📞 Destek

Sorun yaşarsanız veya öneriniz varsa lütfen issue açın.

---

**⚠️ UYARI**: Bu eklentiyi kendi sorumluluğunuzda kullanın. Aşırı kullanım Twitter/X tarafından hesap kısıtlamalarına yol açabilir.
```

## 🚀 Chrome Web Store'a Yükleme Adımları

1. [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole) hesabı oluşturun ($5)
2. "New Item" butonuna tıklayın
3. Extension dosyalarını ZIP olarak yükleyin:
   ```bash
   cd /tmp/twitter-unfollow-extension
   zip -r twitter-unfollow-extension.zip . -x "*.git*" "*.DS_Store" "README.md"
   ```
4. Store listing bilgilerini doldurun:
   - Detailed description (yukarıdaki taslağı kullanın)
   - Screenshots (minimum 1 adet, 1280x800px)
   - Privacy policy URL (yukarıdaki taslağı bir web sayfasında yayınlayın)
   - Category: Productivity
5. "Submit for review" ile gözden geçirmeye gönderin
6. ~1-3 gün içinde onaylanır

## 📸 Screenshot Önerileri

Store için şu ekran görüntülerini hazırlayın:
1. Ana tab - Popup arayüzü (istatistikler ve progress bar gösterilirken)
2. Filtreler tab - Keywords ve whitelist ayarları
3. İstatistikler tab - 30 günlük chart ve CSV export
4. Twitter Following sayfasında çalışırken (user list aktif)
5. Dark mode görünümü
6. Batch modu onay ekranı (50 kişi sonrası)

Her screenshot 1280x800px olmalı ve Chrome store'da iyi görünmeli.
