const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

// عزل بيانات الاختبار عن ملف data.json الحقيقي.
const TEST_DATA_PATH = path.join(__dirname, '.tmp-prod-guard-test-data.json');
try { fs.unlinkSync(TEST_DATA_PATH); } catch (e) {}
process.env.ACCOUNTS_DATA_PATH = TEST_DATA_PATH;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-not-for-production';

const db = require('../src/db');

test.after(() => { try { fs.unlinkSync(TEST_DATA_PATH); } catch (e) {} });

test('init() يرفض الإقلاع بالإنتاج بدون MONGODB_URI (تخزين ملف محلي لا ينجو من إعادة النشر)', async () => {
  const prevEnv = process.env.NODE_ENV;
  const prevUri = process.env.MONGODB_URI;
  const prevAllow = process.env.ALLOW_LOCAL_ACCOUNTS_STORAGE;
  process.env.NODE_ENV = 'production';
  delete process.env.MONGODB_URI;
  delete process.env.ALLOW_LOCAL_ACCOUNTS_STORAGE;
  try {
    await assert.rejects(() => db.init(), /MONGODB_URI/);
  } finally {
    process.env.NODE_ENV = prevEnv;
    if (prevUri !== undefined) process.env.MONGODB_URI = prevUri;
    if (prevAllow !== undefined) process.env.ALLOW_LOCAL_ACCOUNTS_STORAGE = prevAllow;
  }
});

test('init() يسمح بالتخزين المحلي بالإنتاج لو ALLOW_LOCAL_ACCOUNTS_STORAGE=1 صراحة', async () => {
  const prevEnv = process.env.NODE_ENV;
  const prevUri = process.env.MONGODB_URI;
  const prevAllow = process.env.ALLOW_LOCAL_ACCOUNTS_STORAGE;
  process.env.NODE_ENV = 'production';
  delete process.env.MONGODB_URI;
  process.env.ALLOW_LOCAL_ACCOUNTS_STORAGE = '1';
  try {
    await assert.doesNotReject(() => db.init());
  } finally {
    process.env.NODE_ENV = prevEnv;
    if (prevUri !== undefined) process.env.MONGODB_URI = prevUri;
    process.env.ALLOW_LOCAL_ACCOUNTS_STORAGE = prevAllow;
  }
});
