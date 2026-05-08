#!/usr/bin/env node

/**
 * Repair Firestore diary_entries documents where images[] contains transient
 * local cache paths (file:///.../decrypted_images/...) instead of Firebase URLs.
 *
 * Usage examples:
 *   node scripts/migrate-broken-image-refs.mjs --userId <UID> --email <EMAIL> --password <PASSWORD>
 *   node scripts/migrate-broken-image-refs.mjs --userId <UID> --email <EMAIL> --password <PASSWORD> --apply
 *
 * Optional:
 *   --windowMinutes 1440   // max age diff for candidate matching (default 1440 = 24h)
 *   --limit 50             // max broken entries to process
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';
import { getStorage, ref, listAll, getDownloadURL } from 'firebase/storage';

const TRANSIENT_IMAGE_RE = /^file:\/\/.*\/decrypted_images\//i;
const ENCRYPTED_IMAGE_RE = /\.enc(?:\?|$)/i;

const parseArgs = () => {
  const args = process.argv.slice(2);
  const result = {
    apply: false,
    userId: '',
    email: '',
    password: '',
    windowMinutes: 24 * 60,
    limit: 200,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--apply') {
      result.apply = true;
      continue;
    }

    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = args[i + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`Missing value for --${key}`);
      }

      if (key === 'userId') result.userId = value;
      else if (key === 'email') result.email = value;
      else if (key === 'password') result.password = value;
      else if (key === 'windowMinutes') result.windowMinutes = Number(value);
      else if (key === 'limit') result.limit = Number(value);
      else throw new Error(`Unknown argument --${key}`);

      i += 1;
    }
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

const extractTimestampFromStoragePath = (storagePath) => {
  // images/{uid}/{timestamp}_{rand}.jpg.enc
  const fileName = storagePath.split('/').pop() || '';
  const match = fileName.match(/^(\d{10,})_/);
  if (!match) return null;
  const ts = Number(match[1]);
  return Number.isFinite(ts) ? ts : null;
};

const toMillis = (value) => {
  if (!value) return null;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
};

const getEntryAnchorTime = (entryData) => {
  return toMillis(entryData.date) ?? toMillis(entryData.createdAt) ?? toMillis(entryData.updatedAt) ?? Date.now();
};

const isTransientImageRef = (value) => typeof value === 'string' && TRANSIENT_IMAGE_RE.test(value);
const isEncryptedUrlRef = (value) => typeof value === 'string' && /^https?:\/\//i.test(value) && ENCRYPTED_IMAGE_RE.test(value);

const resolveStoragePathFromUrl = (url) => {
  if (!url || typeof url !== 'string') return null;
  const marker = '/o/';
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  const tail = url.slice(idx + marker.length);
  const q = tail.indexOf('?');
  const encodedPath = q === -1 ? tail : tail.slice(0, q);
  try {
    return decodeURIComponent(encodedPath);
  } catch {
    return encodedPath;
  }
};

const pickCandidatesForEntry = ({
  desiredCount,
  entryTime,
  pool,
  usedPaths,
  windowMs,
}) => {
  const scored = pool
    .filter((item) => !usedPaths.has(item.storagePath))
    .map((item) => ({
      ...item,
      deltaMs: Math.abs(item.timestampMs - entryTime),
    }))
    .filter((item) => item.deltaMs <= windowMs)
    .sort((a, b) => a.deltaMs - b.deltaMs);

  return scored.slice(0, desiredCount);
};

const main = async () => {
  loadDotEnv();
  const args = parseArgs();

  if (!args.userId || !args.email || !args.password) {
    throw new Error('Usage: --userId <UID> --email <EMAIL> --password <PASSWORD> [--apply] [--windowMinutes <n>] [--limit <n>]');
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

  const entriesQuery = query(collection(db, 'diary_entries'), where('userId', '==', args.userId));
  const entrySnapshot = await getDocs(entriesQuery);

  const allEntries = entrySnapshot.docs.map((d) => ({ id: d.id, data: d.data() }));

  const brokenEntries = allEntries
    .filter(({ data }) => Array.isArray(data.images) && data.images.some(isTransientImageRef))
    .slice(0, args.limit);

  if (brokenEntries.length === 0) {
    console.log('No broken entries found (no transient decrypted image refs).');
    return;
  }

  const storageRoot = ref(storage, `images/${args.userId}`);
  const list = await listAll(storageRoot);

  const encryptedStorageObjects = list.items
    .map((item) => {
      const storagePath = item.fullPath;
      if (!ENCRYPTED_IMAGE_RE.test(storagePath)) return null;
      const timestampMs = extractTimestampFromStoragePath(storagePath);
      if (!timestampMs) return null;
      return { item, storagePath, timestampMs };
    })
    .filter(Boolean);

  const usedStoragePaths = new Set(
    allEntries.flatMap(({ data }) => (Array.isArray(data.images) ? data.images : []))
      .map(resolveStoragePathFromUrl)
      .filter(Boolean)
  );

  const windowMs = Math.max(1, args.windowMinutes) * 60_000;
  const plan = [];

  for (const entry of brokenEntries) {
    const images = Array.isArray(entry.data.images) ? entry.data.images : [];
    const transientCount = images.filter(isTransientImageRef).length;
    const validExisting = images.filter(isEncryptedUrlRef);

    const desiredCount = transientCount;
    const entryTime = getEntryAnchorTime(entry.data);

    const candidates = pickCandidatesForEntry({
      desiredCount,
      entryTime,
      pool: encryptedStorageObjects,
      usedPaths: usedStoragePaths,
      windowMs,
    });

    const replacementUrls = [];
    for (const candidate of candidates) {
      const url = await getDownloadURL(candidate.item);
      replacementUrls.push({
        url,
        storagePath: candidate.storagePath,
        deltaMs: candidate.deltaMs,
      });
    }

    const repairedImages = [...validExisting, ...replacementUrls.map((r) => r.url)];

    const confidence =
      replacementUrls.length < desiredCount
        ? 'low'
        : replacementUrls.every((r) => r.deltaMs <= 10 * 60_000)
          ? 'high'
          : 'medium';

    replacementUrls.forEach((r) => usedStoragePaths.add(r.storagePath));

    plan.push({
      entryId: entry.id,
      desiredCount,
      matchedCount: replacementUrls.length,
      confidence,
      repairedImages,
      details: replacementUrls,
      originalImages: images,
    });
  }

  const report = {
    totalEntries: allEntries.length,
    brokenEntries: brokenEntries.length,
    plannedRepairs: plan.length,
    fullyMatched: plan.filter((p) => p.matchedCount === p.desiredCount).length,
    partialOrNone: plan.filter((p) => p.matchedCount < p.desiredCount).length,
  };

  console.log('\nMigration report:');
  console.table(report);

  console.log('\nPer-entry plan:');
  for (const item of plan) {
    console.log(`- ${item.entryId} | matched ${item.matchedCount}/${item.desiredCount} | confidence=${item.confidence}`);
    item.details.forEach((d) => {
      const minutes = Math.round(d.deltaMs / 60000);
      console.log(`  -> ${d.storagePath} (delta ${minutes} min)`);
    });
  }

  if (!args.apply) {
    console.log('\nDry-run only. Re-run with --apply to write updates.');
    return;
  }

  let updated = 0;
  for (const item of plan) {
    if (item.matchedCount === 0) continue;

    await updateDoc(doc(db, 'diary_entries', item.entryId), {
      images: item.repairedImages,
      updatedAt: new Date(),
    });

    updated += 1;
  }

  console.log(`\nApplied updates to ${updated} entries.`);
};

main().catch((error) => {
  console.error('\nMigration failed:', error?.message || error);
  process.exit(1);
});
