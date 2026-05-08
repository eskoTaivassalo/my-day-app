#!/usr/bin/env node

/**
 * Cleanup orphaned encrypted image files from Firebase Storage.
 *
 * Safety-first defaults:
 * - Dry-run by default (no deletions without --apply)
 * - Only scans under images/{uid}
 * - Only considers encrypted image objects (*.enc)
 * - Optional age threshold to avoid touching recent uploads
 * - UserId must match authenticated uid
 *
 * Usage:
 *   node scripts/cleanup-orphaned-images.mjs --userId <UID> --email <EMAIL> --password <PASSWORD>
 *   node scripts/cleanup-orphaned-images.mjs --userId <UID> --email <EMAIL> --password <PASSWORD> --apply
 *
 * Options:
 *   --olderThanMinutes 180   // default 180
 *   --maxDeletes 200         // default 200 (apply mode)
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';
import { getStorage, ref, listAll, deleteObject, getMetadata } from 'firebase/storage';

const ENC_FILE_RE = /\.enc$/i;

const parseArgs = () => {
  const args = process.argv.slice(2);
  const result = {
    apply: false,
    userId: '',
    email: '',
    password: '',
    olderThanMinutes: 180,
    maxDeletes: 200,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--apply') {
      result.apply = true;
      continue;
    }

    if (!arg.startsWith('--')) {
      throw new Error(`Unexpected argument: ${arg}`);
    }

    const key = arg.slice(2);
    const value = args[i + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for --${key}`);
    }

    if (key === 'userId') result.userId = value;
    else if (key === 'email') result.email = value;
    else if (key === 'password') result.password = value;
    else if (key === 'olderThanMinutes') result.olderThanMinutes = Number(value);
    else if (key === 'maxDeletes') result.maxDeletes = Number(value);
    else throw new Error(`Unknown argument --${key}`);

    i += 1;
  }

  return result;
};

const loadDotEnv = () => {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;

  const raw = fs.readFileSync(envPath, 'utf8');
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;

    const eq = trimmed.indexOf('=');
    if (eq === -1) return;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  });
};

const requiredEnv = (key) => {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
};

const decodeStoragePathFromUrl = (url) => {
  if (!url || typeof url !== 'string') return null;

  if (url.startsWith('gs://')) {
    const noScheme = url.slice('gs://'.length);
    const slash = noScheme.indexOf('/');
    if (slash === -1) return null;
    return noScheme.slice(slash + 1);
  }

  const marker = '/o/';
  const idx = url.indexOf(marker);
  if (idx !== -1) {
    const tail = url.slice(idx + marker.length);
    const q = tail.indexOf('?');
    const encoded = q === -1 ? tail : tail.slice(0, q);
    try {
      return decodeURIComponent(encoded);
    } catch {
      return encoded;
    }
  }

  return null;
};

const collectAllItems = async (folderRef) => {
  const result = await listAll(folderRef);
  const nestedItems = await Promise.all(result.prefixes.map((child) => collectAllItems(child)));
  return [...result.items, ...nestedItems.flat()];
};

const toMillis = (isoString) => {
  if (!isoString) return null;
  const ts = Date.parse(isoString);
  return Number.isFinite(ts) ? ts : null;
};

const main = async () => {
  loadDotEnv();
  const args = parseArgs();

  if (!args.userId || !args.email || !args.password) {
    throw new Error('Usage: --userId <UID> --email <EMAIL> --password <PASSWORD> [--apply] [--olderThanMinutes <n>] [--maxDeletes <n>]');
  }

  const firebaseConfig = {
    apiKey: requiredEnv('EXPO_PUBLIC_FIREBASE_API_KEY'),
    authDomain: requiredEnv('EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN'),
    projectId: requiredEnv('EXPO_PUBLIC_FIREBASE_PROJECT_ID'),
    storageBucket: requiredEnv('EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: requiredEnv('EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'),
    appId: requiredEnv('EXPO_PUBLIC_FIREBASE_APP_ID'),
  };

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const storage = getStorage(app);

  const credential = await signInWithEmailAndPassword(auth, args.email, args.password);
  const authenticatedUid = credential.user?.uid;

  if (!authenticatedUid) {
    throw new Error('Authentication succeeded without uid; aborting for safety.');
  }

  if (authenticatedUid !== args.userId) {
    throw new Error(
      `Safety check failed: --userId (${args.userId}) does not match authenticated uid (${authenticatedUid}).`
    );
  }

  const entriesSnap = await getDocs(
    query(collection(db, 'diary_entries'), where('userId', '==', args.userId))
  );

  const referencedImagePaths = new Set(
    entriesSnap.docs
      .flatMap((d) => {
        const images = d.data()?.images;
        return Array.isArray(images) ? images : [];
      })
      .map((value) => decodeStoragePathFromUrl(value))
      .filter((value) => typeof value === 'string' && value.startsWith(`images/${args.userId}/`))
  );

  const storageRoot = ref(storage, `images/${args.userId}`);
  const allItems = await collectAllItems(storageRoot);
  const encryptedItems = allItems.filter((item) => ENC_FILE_RE.test(item.fullPath));

  const ageThresholdMs = Math.max(1, args.olderThanMinutes) * 60_000;
  const now = Date.now();

  const candidates = [];
  for (const item of encryptedItems) {
    if (referencedImagePaths.has(item.fullPath)) {
      continue;
    }

    let metadata = null;
    try {
      metadata = await getMetadata(item);
    } catch {
      // If metadata fails, skip the object for safety.
      continue;
    }

    const updatedMs = toMillis(metadata.updated);
    if (!updatedMs) {
      continue;
    }

    const ageMs = now - updatedMs;
    if (ageMs < ageThresholdMs) {
      continue;
    }

    candidates.push({
      item,
      storagePath: item.fullPath,
      ageMinutes: Math.round(ageMs / 60_000),
      updated: metadata.updated,
    });
  }

  console.log('\nCleanup report:');
  console.table({
    uid: args.userId,
    firestoreEntries: entriesSnap.size,
    referencedImages: referencedImagePaths.size,
    storageEncryptedImages: encryptedItems.length,
    orphanCandidates: candidates.length,
    olderThanMinutes: args.olderThanMinutes,
    mode: args.apply ? 'apply' : 'dry-run',
  });

  if (candidates.length > 0) {
    console.log('\nCandidate objects (first 50):');
    candidates.slice(0, 50).forEach((candidate) => {
      console.log(`- ${candidate.storagePath} | age=${candidate.ageMinutes}min | updated=${candidate.updated}`);
    });
  }

  if (!args.apply) {
    console.log('\nDry-run only. Re-run with --apply to delete candidates.');
    return;
  }

  const limitedCandidates = candidates.slice(0, Math.max(1, args.maxDeletes));
  let deleted = 0;

  for (const candidate of limitedCandidates) {
    try {
      await deleteObject(candidate.item);
      deleted += 1;
    } catch (error) {
      console.warn(`Failed to delete ${candidate.storagePath}:`, error?.code || error?.message || error);
    }
  }

  console.log(`\nDeleted ${deleted}/${limitedCandidates.length} orphan image object(s).`);

  if (candidates.length > limitedCandidates.length) {
    console.log(`Skipped ${candidates.length - limitedCandidates.length} additional candidate(s) due to --maxDeletes limit.`);
  }
};

main().catch((error) => {
  console.error('\nCleanup failed:', error?.message || error);
  process.exit(1);
});
