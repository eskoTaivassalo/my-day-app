# iOS Optimization Playbook (EAS + iPhone)

Tama playbook tekee iOS-testauksesta toistettavan ja vertailukelpoisen.

## 1) Ennen buildia

1. Varmista riippuvuudet:
   - `npm ci`
2. Aja validaatio:
   - `npm run verify`
3. Tarkista, etta branch on oikea ja commitit pushattu.

## 2) Rakenna iOS preview EAS:lla

1. Aja build:
   - `npm run eas:build:ios:preview`
2. Odota buildin valmistumista EAS Dashboardissa.
3. Asenna build iPhoneen (internal distribution / TestFlight riippuen profiilista).

## 3) Testiskenaariot iPhonella

Aja testit aina samassa jarjestyksessa:

1. Kylma kaynnistys
   - Avaa appi kokonaan suljettuna.
   - Mittaa aika ensimmainen interaktio -hetkeen.
2. Achievements-navigation
   - Timeline -> Nayta kaikki -> Takaisin -> Nayta kaikki.
   - Varmista valiton ruudunvaihto.
3. Timeline scroll
   - Nopea vieritys alas ylos 20-30 sekuntia.
   - Tarkkaile jankkyta ja frame droppeja.
4. Calendar/Documents vaihto
   - Siirry valilehdesta toiseen nopeasti.
   - Varmista, etta UI reagoi valittomasti.
5. Media-polut
   - Avaa kuvia ja videoita useasta merkinnasta.
   - Varmista, ettei muisti kasva hallitsemattomasti pitkan session aikana.

## 4) Optimointikierros

Kun loydat hitaan kohdan:

1. Kirjaa tarkka toistopolku (3-6 vaihetta).
2. Kirjaa laite + iOS-versio.
3. Kirjaa havaittu viive sekunteina.
4. Tee pieni rajattu korjaus.
5. Aja sama testiskenaario uudelleen.

## 5) Windows-rajoite

iOS Simulator toimii vain macOS + Xcode -ymparistossa.

Windowsilla suositeltu virta on:

1. Kehitys ja lint/typecheck paikallisesti
2. iOS build EAS-pilvessa
3. Testaus oikealla iPhonella

## 6) Julkaisugate (suositus)

Merkitse build "release-ready" vasta kun kaikki tayttyvat:

1. `npm run verify` onnistuu
2. EAS iOS preview build onnistuu
3. Yksikaan kriittinen testiskenaario ei jumita
4. Kaksi perakkaista testikierrosta antaa saman tuloksen