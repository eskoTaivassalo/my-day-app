import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';

interface Section {
  title: string;
  content: string;
}

const sections: Section[] = [
  {
    title: '1. Rekisterinpitäjä',
    content:
      'My Day -päiväkirjasovelluksen rekisterinpitäjä on sovelluksen kehittäjä. ' +
      'Rekisterinpitäjä vastaa henkilötietojen käsittelystä EU:n yleisen tietosuoja-asetuksen ' +
      '(GDPR, 2016/679) mukaisesti.',
  },
  {
    title: '2. Kerättävät tiedot',
    content:
      'Sovellus kerää ja käsittelee seuraavia tietoja:\n\n' +
      '• Sähköpostiosoite (kirjautumista varten)\n' +
      '• Päiväkirjamerkinnät: otsikko, sisältö, päivämäärä\n' +
      '• Valokuvat ja videot, jotka käyttäjä itse lisää merkintöihin\n' +
      '• Dokumentit (PDF, DOCX yms.), jotka käyttäjä itse lisää\n' +
      '• Valinnainen sijaintitieto merkinnöissä\n' +
      '• Profiilikuva (valinnainen)',
  },
  {
    title: '3. Tietojen käyttötarkoitus',
    content:
      'Tietoja käytetään ainoastaan sovelluksen perustoimintojen tarjoamiseen:\n\n' +
      '• Käyttäjän tunnistautuminen\n' +
      '• Päiväkirjamerkintöjen tallentaminen ja näyttäminen\n' +
      '• Dokumenttien ja kuvien hallinta\n\n' +
      'Tietoja ei käytetä markkinointiin, profilointiin eikä myydä kolmansille osapuolille.',
  },
  {
    title: '4. End-to-End -salaus ja Zero-Knowledge -periaate',
    content:
      'Kaikki arkaluonteiset tiedot salataan laitteellasi ennen kuin ne lähetetään palvelimelle:\n\n' +
      '• Päiväkirjamerkintöjen otsikot ja tekstisisältö salataan\n' +
      '• Dokumenttien otsikot ja kuvaukset salataan\n' +
      '• Sijaintitiedot (osoitteet) salataan\n\n' +
      'Salausavain on tallennettu VAIN laitteesi suojattuun tallennukseen ' +
      '(iOS: Keychain, Android: Keystore). Avain ei koskaan lähde laitteeltasi.\n\n' +
      '⚠️ Tämä tarkoittaa, että:\n' +
      '• Edes sovelluksen kehittäjä ei pysty lukemaan sisältöjäsi\n' +
      '• Jos vaihdat laitetta, salattua sisältöä ei voi siirtää (v1)\n' +
      '• Jos poistat tilin, kaikki data poistetaan pysyvästi',
  },
  {
    title: '5. Tietojen säilytys ja kolmannet osapuolet',
    content:
      'Tiedot tallennetaan Google Firebase -palveluihin (Firestore ja Cloud Storage), ' +
      'jotka sijaitsevat EU:n alueella tai EU:n tietosuojavaatimusten piirissä.\n\n' +
      'Google Firebase toimii henkilötietojen käsittelijänä, jonka kanssa on tehty ' +
      'tietojenkäsittelysopimus (DPA) GDPR:n vaatimusten mukaisesti.\n\n' +
      'Googlen tietosuojaseloste: https://policies.google.com/privacy\n\n' +
      'Firebase-palvelimille tallennettu data on salattu (end-to-end), joten ' +
      'Google tai sovelluksen kehittäjä ei pysty lukemaan sen sisältöä.',
  },
  {
    title: '6. Tietojen säilytysaika',
    content:
      'Tietoja säilytetään niin kauan kuin käyttäjätili on olemassa. ' +
      'Kun käyttäjä poistaa tilinsä, kaikki tiedot poistetaan välittömästi ja pysyvästi:\n\n' +
      '• Kaikki Firestore-dokumentit\n' +
      '• Kaikki tallennetut kuvat, videot ja dokumentit\n' +
      '• Käyttäjäprofiili\n' +
      '• Salausavain laitteelta',
  },
  {
    title: '7. Käyttäjän oikeudet (GDPR)',
    content:
      'EU:n tietosuoja-asetuksen mukaan sinulla on seuraavat oikeudet:\n\n' +
      '• Oikeus saada tiedot (Art. 15): Näet kaikki tietosi sovelluksen kautta\n' +
      '• Oikeus oikaista tiedot (Art. 16): Voit muokata merkintöjäsi sovelluksessa\n' +
      '• Oikeus tulla unohdetuksi (Art. 17): Poista tili Asetukset-näkymästä\n' +
      '• Oikeus tietojen siirtämiseen (Art. 20): Voit viedä merkintäsi (tulossa)\n' +
      '• Oikeus vastustaa käsittelyä (Art. 21): Voit poistaa tilisi koska tahansa\n\n' +
      'Kaikki oikeudet ovat käytettävissä suoraan sovelluksessa.',
  },
  {
    title: '8. Evästeet ja seuranta',
    content:
      'Sovellus ei käytä evästeitä eikä seuraa käyttäjien käyttäytymistä analytiikan ' +
      'avulla. Firebase Authentication kerää kirjautumisiin liittyvät lokitiedot ' +
      'tietoturvan ja väärinkäytösten havaitsemisen vuoksi.',
  },
  {
    title: '9. Alaikäiset',
    content:
      'Sovellus ei ole tarkoitettu alle 16-vuotiaille. Emme tietoisesti kerää ' +
      'alaikäisten henkilötietoja.',
  },
  {
    title: '10. Muutokset tietosuojaselosteeseen',
    content:
      'Voimme päivittää tätä tietosuojaselostetta ajoittain. ' +
      'Merkittävistä muutoksista ilmoitetaan sovelluksen kautta. ' +
      'Jatkamalla sovelluksen käyttöä muutosten jälkeen hyväksyt päivitetyn selosteen.',
  },
  {
    title: '11. Yhteystiedot',
    content:
      'Tietosuoja-asioissa voit ottaa yhteyttä sovelluksen kehittäjään. ' +
      'Sinulla on myös oikeus tehdä valitus tietosuojaviranomaiselle ' +
      '(Suomessa: Tietosuojavaltuutetun toimisto, www.tietosuoja.fi).',
  },
];

export default function PrivacyPolicyScreen({ navigation }: any) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        {navigation && (
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backText}>← Takaisin</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.headerTitle}>Tietosuojaseloste</Text>
        <Text style={styles.headerSubtitle}>My Day -päiväkirjasovellus · GDPR</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Päivitetty */}
        <View style={styles.updated}>
          <Text style={styles.updatedText}>📅 Päivitetty: 3.4.2026</Text>
        </View>

        {/* Tiivistelmä */}
        <View style={styles.summary}>
          <Text style={styles.summaryTitle}>🔒 Tietoturvatiivistelmä</Text>
          <Text style={styles.summaryText}>
            Kaikki kirjoittamasi tekstit salataan laitteellasi ennen tallennusta.
            Salausavain on vain laitteessasi — edes kehittäjä ei pysty lukemaan sisältöjäsi.
          </Text>
        </View>

        {/* Osiot */}
        {sections.map((section, index) => (
          <View key={index} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.sectionContent}>{section.content}</Text>
          </View>
        ))}

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Tämä tietosuojaseloste on laadittu EU:n yleisen tietosuoja-asetuksen
            (GDPR 2016/679) vaatimusten mukaisesti.
          </Text>
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
