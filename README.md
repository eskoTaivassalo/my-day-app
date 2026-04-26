# My Day App - Päiväkirjasovellus

Moderni päiväkirjasovellus React Nativella ja Expo:lla. Tallenna päivän tapahtumia, kuvia ja muistoja helposti!

## 🌟 Ominaisuudet

### ✅ Valmiina
- **📖 Aikajana-näkymä**: Selaa päiväkirjamerkintöjäsi aikajärjestyksessä
- **📅 Kalenteri-näkymä**: Näe kaikki merkinnät kalenterissa ja siirry suoraan vanhoihin tapahtumiin
- **✍️ Uusi merkintä**: Luo uusia päiväkirjamerkintöjä
- **📸 Kuvien lisäys**: 
  - Ota kuva suoraan kameralla
  - Valitse kuvia galleriasta
  - Näe uusimmat kuvat automaattisina ehdotuksina
- **🎨 Moderni UI**: Puhdas ja käyttäjäystävällinen käyttöliittymä

### 🚧 Kehityksessä
- **☁️ Pilvisynkronointi**: Firebase Firestore -integraatio merkintöjen tallentamiseen
- **🖼️ Automaattinen kuvien synkronointi**: Kuvat synkronoituvat automaattisesti kuvapankkiin
- **🤖 AI-avusteinen kuvanvalinta**: Älykäs kuvanvalinta kun kuvia on paljon
- **👤 Käyttäjähallinta**: Kirjautuminen ja profiili
- **🔍 Haku**: Etsi merkintöjä otsikon tai sisällön perusteella

## 📱 Näkymät

### 1. Aikajana (Timeline)
- Lista kaikista päiväkirjamerkinnöistä uusimmasta vanhimpaan
- Näyttää otsikon, sisällön alun ja pikkukuvat
- Pull-to-refresh päivittää listan
- Tyhjä tila kun merkintöjä ei ole

### 2. Kalenteri
- Kuukausikalenteri
- Päivät joilla on merkintöjä merkitty pisteellä
- Klikkaa päivää nähdäksesi sen merkinnät
- Navigoi kuukausien välillä

### 3. Uusi merkintä
- Modaali-näkymä uuden merkinnän luomiseen
- Tekstikentät otsikkolle ja sisällölle
- Kuvien lisäys kahdella tavalla:
  - Ota kuva kameralla
  - Valitse galleriasta
- **Uusimmat kuvat ehdotuksina**: Näyttää 20 viimeisintä kuvaa laitteelta
- Valitut kuvat näkyvät ylhäällä, niitä voi poistaa
- Tallenna tai peruuta toiminto

## 🛠️ Teknologiat

- **React Native 0.81.5**
- **Expo SDK 54**
- **TypeScript**
- **React Navigation** (Stack & Bottom Tabs)
- **Firebase** (Firestore, Storage, Auth)
- **Expo Image Picker** - Kuvien valinta
- **Expo Camera** - Kuvien ottaminen
- **Expo Media Library** - Laitteen kuvat

## 📦 Asennus

1. Kloonaa repositorio
```bash
git clone <repository-url>
cd my-day-app
```

2. Asenna riippuvuudet
```bash
npm install
```

3. Konfiguroi Firebase (katso alla)

4. Käynnistä sovellus
```bash
npm start
# tai
npx expo start
```

## 🔥 Firebase-konfiguraatio

### 1. Luo Firebase-projekti
1. Mene [Firebase Console](https://console.firebase.google.com/)
2. Luo uusi projekti
3. Lisää Web-sovellus projektiin

### 2. Konfiguroi Firestore
1. Avaa Firestore Database
2. Luo uusi tietokanta
3. Aseta säännöt kehitykseen:
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /diary_entries/{entry} {
      allow read, write: if request.auth != null && 
                           request.auth.uid == resource.data.userId;
      allow create: if request.auth != null;
    }
  }
}
```

### 3. Konfiguroi Storage
1. Avaa Storage
2. Aseta säännöt:
```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /images/{userId}/{imageId} {
      allow read, write: if request.auth != null && 
                           request.auth.uid == userId;
    }
  }
}
```

### 4. Konfiguroi Authentication
1. Avaa Authentication
2. Ota käyttöön Email/Password -kirjautuminen
3. (Valinnainen) Ota käyttöön Google Sign-In

### 5. Kopioi Firebase-konfiguraatio
1. Mene Project Settings → General
2. Kopioi Firebase config
3. Päivitä `src/services/firebase.ts`:

```typescript
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "your-app.firebaseapp.com",
  projectId: "your-app",
  storageBucket: "your-app.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

## 📱 Buildaaminen

### Development Build (EAS)
```bash
# Android
eas build --profile development --platform android

# iOS
eas build --profile development --platform ios
```

### Production Build
```bash
# Android
eas build --profile production --platform android

# iOS
eas build --profile production --platform ios
```

## 🔁 DevOps työnkulku

Repossa on nyt tarkoitus käyttää jatkuvaa mobiili-DevOps-rytmiä:

1. jokainen muutos validoidaan lokaalisti ennen pushia
2. GitHub Actions ajaa automaattisen tarkistuksen `main`-haaran push- ja PR-tapahtumissa
3. iOS- ja Android-bundle tarkistetaan CI:ssä ilman että jokainen virhe löytyy vasta build-palvelussa
4. oikea laitetestaus tehdään Android-puhelimella ja iPhonella ennen releasea

### Lokaalit tarkistukset

```bash
npm run typecheck
npm run doctor
npm run bundle:android
npm run bundle:ios

# kaikki yhdellä komennolla
npm run verify
```

### EAS build -komennot

```bash
# Android preview
npm run eas:build:android:preview

# iOS preview (TestFlight / device build)
npm run eas:build:ios:preview

# iOS simulator build (vaatii simulatorin ajamiseen Macin)
npm run eas:build:ios:simulator
```

## 🍎 iOS-tuki ja testaus

Projektissa on nyt iOS bundle identifier asetettuna, joten EAS iOS build voidaan ottaa osaksi normaalia julkaisupolkua.

### Tarkeä rajoite Windowsilla

Apple iOS Simulator ei ole asennettavissa Windowsiin. Se kuuluu Xcodeen ja toimii vain macOS:ssa.

Taman vuoksi suositeltu iOS-optimointipolku tassa projektissa on:

1. kehita normaalisti Windowsilla
2. validoi koodi lokaalisti komennolla `npm run verify`
3. rakenna iOS-versio EAS:lla pilvessa
4. testaa ja optimoi oikealla iPhonella
5. jos tarvitset simulatorin, kayta Macia tai erillista macOS-rakennetta

### Apple-laitteella optimointi

Kun iOS preview build on valmis, testaa ainakin seuraavat kohdat oikealla iPhonella:

1. Achievements-nakymaan siirtyminen edestakaisin
2. Timeline-nopea scrollaus
3. Calendar- ja Documents-valilehtien ensireaktio
4. kuvien ja videoiden latausajat
5. muistin kaytto pitkan session aikana

Jos haluat tarkempaa iOS-suorituskykyprofilointia, tee se Xcodella Instrumentsilla Macissa tai TestFlight-buildin avulla oikealla laitteella.

Yksityiskohtainen vaiheistus loytyy tiedostosta [docs/ios-optimization-playbook.md](docs/ios-optimization-playbook.md).

## 🎯 Seuraavat askeleet

1. **Firebase-integraation viimeistely**
   - Päivitä TimelineScreen käyttämään `getEntries()`
   - Päivitä CalendarScreen käyttämään `getEntriesInRange()`
   - Päivitä NewEntryScreen käyttämään `createEntry()` ja `uploadImages()`

2. **Käyttäjähallinta**
   - Lisää kirjautumisnäkymä
   - Lisää rekisteröitymisnäkymä
   - Lisää profiili-näkymä

3. **Merkinnän yksityiskohtanäkymä**
   - Luo DetailScreen jossa näytetään koko merkintä
   - Mahdollisuus muokata merkintää
   - Mahdollisuus poistaa merkintä

4. **Kuvasynkronointi**
   - Implementoi automaattinen kuvien synkronointi
   - Lisää taustasynkronointi kun uusi kuva otetaan
   - Notifikaatiot synkronoinnista

5. **AI-ominaisuudet**
   - Älykäs kuvanvalinta (esim. kasvojentunnistus, parhaat kuvat)
   - Automaattinen tekstin luonti kuvista
   - Tunnelma-analyysi merkinnöistä

6. **Muut parannukset**
   - Hakutoiminto
   - Tagit ja kategoriat
   - Vienti/tuonti
   - Teemojen vaihto (dark mode)
   - Sijainnin lisäys automaattisesti

## 📄 Rakenne

```
my-day-app/
├── src/
│   ├── screens/
│   │   ├── TimelineScreen.tsx    # Aikajana-näkymä
│   │   ├── CalendarScreen.tsx    # Kalenteri-näkymä
│   │   └── NewEntryScreen.tsx    # Uusi merkintä -näkymä
│   ├── components/               # Uudelleenkäytettävät komponentit
│   ├── services/
│   │   ├── firebase.ts          # Firebase-konfiguraatio
│   │   └── diaryService.ts      # Päiväkirja-palvelut
│   └── types/
│       └── DiaryEntry.ts        # TypeScript-tyypit
├── App.tsx                       # Pääkomponentti & navigaatio
└── package.json
```

## 🤝 Kehitysvinkkejä

### Kuvien lataaminen tehokkaasti
- Käytä kuvavälimuistia
- Pienennä kuvat ennen lähettämistä
- Käytä progressive loading -tekniikkaa

### Firestore-optimointi
- Käytä indeksejä kyselyissä
- Limitoi haettujen dokumenttien määrää
- Käytä real-time listenereitä vain tarvittaessa

### UX-parannukset
- Lisää latausanimaatiot
- Optimistinen UI (näytä muutokset ennen tallennusta)
- Offline-tuki

## 📝 Lisenssi

MIT

## 👨‍💻 Kehittäjä

Esko Taivassalo

---

**Huom!** Tämä on kehitysversio. Lisää ominaisuuksia ja parannuksia tulossa!
