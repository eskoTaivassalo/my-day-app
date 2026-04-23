import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { getLocaleFromLanguage } from '../i18n/locale';

interface Section {
  title: string;
  content: string;
}

const policyByLanguage: Record<'fi' | 'en' | 'sv', { title: string; subtitle: string; updated: string; summaryTitle: string; summaryText: string; footer: string; sections: Section[] }> = {
  fi: {
    title: 'Tietosuojaseloste',
    subtitle: 'My days -paivakirjasovellus · GDPR',
    updated: 'Paivitetty',
    summaryTitle: '🔒 Tietoturvatiivistelma',
    summaryText:
      'Kaikki kirjoittamasi tekstit salataan laitteellasi ennen tallennusta. Salausavain on vain laitteessasi - edes kehittaja ei pysty lukemaan sisaltojasi.',
    footer:
      'Tama tietosuojaseloste on laadittu EU:n yleisen tietosuoja-asetuksen (GDPR 2016/679) vaatimusten mukaisesti.',
    sections: [
      { title: '1. Rekisterinpita ja', content: 'My days -sovelluksen rekisterinpita ja on sovelluksen kehittaja. Henkilotietojen kasittely tapahtuu GDPR:n mukaisesti.' },
      { title: '2. Kerattavat tiedot', content: 'Kerattavat tiedot voivat sisaltaa sahkopostin, merkintojen sisallon, kuvat/videot, dokumentit, valinnaisen sijainnin ja profiilikuvan.' },
      { title: '3. Kayttotarkoitus', content: 'Tietoja kaytetaan vain sovelluksen toimintoihin: kirjautuminen, merkintojen hallinta, media- ja dokumenttien kasittely.' },
      { title: '4. Salaus', content: 'Arkaluonteinen data salataan laitteella ennen lahetysta. Salausavain pysyy laitteessa (zero-knowledge).' },
      { title: '5. Tallennus ja kolmannet osapuolet', content: 'Data tallennetaan Firebase-palveluihin GDPR-vaatimusten mukaisesti. Sisalto on salattua.' },
      { title: '6. Sailytusaika', content: 'Tietoja sailytetaan tilin olemassaolon ajan. Tilin poistossa data poistetaan pysyvasti.' },
      { title: '7. Oikeutesi', content: 'Sinulla on GDPR-oikeudet: tarkastus, oikaisu, poistaminen, vastustaminen ja siirto.' },
      { title: '8. Seuranta', content: 'Sovellus ei kayta analytiikkaseurantaa markkinointiin. Turvalokit voivat kerty a kirjautumisesta.' },
      { title: '9. Alaikaiset', content: 'Sovellus ei ole tarkoitettu alle 16-vuotiaille.' },
      { title: '10. Muutokset', content: 'Tietosuojaselostetta voidaan paivittaa. Merkittavista muutoksista ilmoitetaan sovelluksessa.' },
      { title: '11. Yhteystiedot', content: 'Tietosuoja-asioissa voit olla yhteydessa kehittajaan tai valvovaan viranomaiseen.' },
    ],
  },
  en: {
    title: 'Privacy Policy',
    subtitle: 'My days diary app · GDPR',
    updated: 'Updated',
    summaryTitle: '🔒 Security Summary',
    summaryText:
      'All diary text is encrypted on your device before storage. The encryption key remains on your device only; even the developer cannot read your private content.',
    footer:
      'This privacy policy is prepared in accordance with EU General Data Protection Regulation (GDPR 2016/679).',
    sections: [
      { title: '1. Data Controller', content: 'The data controller is the app developer, responsible for personal data processing under GDPR.' },
      { title: '2. Data We Collect', content: 'Data may include email address, diary content, user-added photos/videos/documents, optional location, and profile image.' },
      { title: '3. Purpose of Processing', content: 'Data is used only to provide core app functionality: authentication, diary storage, and media/document management.' },
      { title: '4. End-to-End Encryption', content: 'Sensitive content is encrypted on your device before upload. The encryption key is kept only on your device (zero-knowledge).' },
      { title: '5. Storage and Processors', content: 'Data is stored using Firebase services under GDPR-compliant terms. Encrypted content is not readable by third parties.' },
      { title: '6. Retention', content: 'Data is retained while the account exists. Account deletion removes related data permanently.' },
      { title: '7. Your Rights', content: 'You have GDPR rights including access, rectification, erasure, objection, and portability.' },
      { title: '8. Tracking', content: 'The app does not use behavioral analytics for marketing. Security logs related to authentication may be collected.' },
      { title: '9. Minors', content: 'The app is not intended for users under 16 years old.' },
      { title: '10. Policy Changes', content: 'This policy may be updated from time to time. Material changes are communicated in the app.' },
      { title: '11. Contact', content: 'For privacy questions, contact the app developer or your local data protection authority.' },
    ],
  },
  sv: {
    title: 'Integritetspolicy',
    subtitle: 'My days dagboksapp · GDPR',
    updated: 'Uppdaterad',
    summaryTitle: '🔒 Sakerhetssammanfattning',
    summaryText:
      'All text du skriver krypteras pa din enhet innan lagring. Krypteringsnyckeln stannar pa enheten; inte ens utvecklaren kan lasa privat innehall.',
    footer:
      'Denna integritetspolicy har upprattats enligt EU:s dataskyddsforordning (GDPR 2016/679).',
    sections: [
      { title: '1. Personuppgiftsansvarig', content: 'Appens utvecklare ar personuppgiftsansvarig och behandlar data enligt GDPR.' },
      { title: '2. Uppgifter som samlas in', content: 'Uppgifter kan omfatta e-post, dagboksinnehall, anvandarens bilder/videor/dokument, valfri plats och profilbild.' },
      { title: '3. Andamal', content: 'Uppgifterna anvands endast for appens grundfunktioner: inloggning, lagring av anteckningar och hantering av media/dokument.' },
      { title: '4. End-to-end-kryptering', content: 'Kansligt innehall krypteras pa enheten fore uppladdning. Nyckeln finns endast pa din enhet (zero-knowledge).' },
      { title: '5. Lagring och parter', content: 'Data lagras via Firebase enligt GDPR-kompatibla villkor. Krypterat innehall ar inte lasbart for tredje part.' },
      { title: '6. Lagringstid', content: 'Data sparas sa lange kontot finns. Nar kontot tas bort raderas data permanent.' },
      { title: '7. Dina rattigheter', content: 'Du har GDPR-rattigheter inklusive tillgang, rattelse, radering, invandning och dataportabilitet.' },
      { title: '8. Sparning', content: 'Appen anvander inte beteendeanalys for marknadsforing. Sakerhetsloggar kring autentisering kan forekomma.' },
      { title: '9. Minderariga', content: 'Appen ar inte avsedd for personer under 16 ar.' },
      { title: '10. Andringar', content: 'Policyn kan uppdateras over tid. Vasentliga andringar meddelas i appen.' },
      { title: '11. Kontakt', content: 'For integritetsfragor, kontakta utvecklaren eller relevant dataskyddsmyndighet.' },
    ],
  },
};

export default function PrivacyPolicyScreen({ navigation }: any) {
  const { language } = useLanguage();
  const { theme } = useTheme();
  const isDark = theme.id === 'midnight';
  const locale = getLocaleFromLanguage(language);
  const policy = policyByLanguage[language];
  const updatedDate = new Date(2026, 3, 3).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  });

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.colors.border, backgroundColor: theme.colors.white }]}>
        {navigation && (
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={[styles.backText, { color: theme.colors.primary, fontFamily: theme.fonts.bodyFamily }]}>{language === 'en' ? '← Back' : language === 'sv' ? '← Tillbaka' : '← Takaisin'}</Text>
          </TouchableOpacity>
        )}
        <Text style={[styles.headerTitle, { color: theme.colors.text, fontFamily: theme.fonts.headingFamily }]}>{policy.title}</Text>
        <Text style={[styles.headerSubtitle, { color: theme.colors.textSecondary, fontFamily: theme.fonts.bodyFamily }]}>{policy.subtitle}</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Päivitetty */}
        <View style={styles.updated}>
          <Text style={[styles.updatedText, { color: theme.colors.textSecondary, fontFamily: theme.fonts.bodyFamily }]}>📅 {policy.updated}: {updatedDate}</Text>
        </View>

        {/* Tiivistelmä */}
        <View style={[styles.summary, { backgroundColor: isDark ? '#0B1220' : '#EFF6FF', borderLeftColor: theme.colors.primary }] }>
          <Text style={[styles.summaryTitle, { color: theme.colors.primary, fontFamily: theme.fonts.bodyFamily }]}>{policy.summaryTitle}</Text>
          <Text style={[styles.summaryText, { color: theme.colors.text, fontFamily: theme.fonts.bodyFamily }]}>{policy.summaryText}</Text>
        </View>

        {/* Osiot */}
        {policy.sections.map((section, index) => (
          <View key={index} style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.colors.text, fontFamily: theme.fonts.bodyFamily }]}>{section.title}</Text>
            <Text style={[styles.sectionContent, { color: theme.colors.textSecondary, fontFamily: theme.fonts.bodyFamily }]}>{section.content}</Text>
          </View>
        ))}

        <View style={[styles.footer, { borderTopColor: theme.colors.border }] }>
          <Text style={[styles.footerText, { color: theme.colors.textSecondary, fontFamily: theme.fonts.bodyFamily }]}>{policy.footer}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  backButton: {
    marginBottom: 8,
  },
  backText: {
    color: '#007AFF',
    fontSize: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  updated: {
    marginBottom: 16,
  },
  updatedText: {
    fontSize: 13,
    color: '#888',
  },
  summary: {
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderLeftWidth: 4,
    borderLeftColor: '#3B82F6',
  },
  summaryTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1D4ED8',
    marginBottom: 8,
  },
  summaryText: {
    fontSize: 14,
    color: '#1E40AF',
    lineHeight: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  sectionContent: {
    fontSize: 14,
    color: '#444',
    lineHeight: 22,
  },
  footer: {
    marginTop: 8,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  footerText: {
    fontSize: 12,
    color: '#888',
    lineHeight: 18,
    textAlign: 'center',
  },
});
