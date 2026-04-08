rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // Päiväkirjamerkintöjen kuvat — vain omistaja lukee ja kirjoittaa
    match /images/{userId}/{allPaths=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    // Päiväkirjamerkintöjen videot — vain omistaja lukee ja kirjoittaa
    match /videos/{userId}/{allPaths=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    // Profiilikuvat — vain omistaja lukee ja kirjoittaa
    match /profile_images/{userId}/{allPaths=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    // Dokumentit (PDF, DOCX, kuvat) — vain omistaja lukee ja kirjoittaa
    match /documents/{userId}/{allPaths=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
