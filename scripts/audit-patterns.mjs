/**
 * Audit lapis kedua: pola kredensial + fragmen password di dalam URL.
 *
 * Lapis pertama hanya mencari nilai .env persis. Ini menangkap kasus lain:
 * password yang tertanam di connection string, token JWT sisa copy-paste,
 * private key, dan API key dengan bentuk khas vendor.
 *
 * Tidak pernah mencetak nilai rahasia — hanya nama file/baris dan jenis pola.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const sh = (cmd) => {
	try {
		return execSync(cmd, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
	} catch {
		return '';
	}
};

const envText = fs.readFileSync('.env', 'utf8');
const get = (key) => {
	const m = new RegExp(`^${key}=(.*)$`, 'm').exec(envText);
	if (!m) return '';
	return m[1].trim().replace(/^["']|["']$/g, '');
};

/* ------------- Fragmen password dari dalam DATABASE_URL ------------- */
const dbUrl = get('DATABASE_URL');
let dbPassword = '';
try {
	const u = new URL(dbUrl);
	dbPassword = decodeURIComponent(u.password ?? '');
} catch {
	// bukan URL valid; ambil manual di antara ':' dan '@'
	const m = /:\/\/[^:]+:([^@]+)@/.exec(dbUrl);
	dbPassword = m ? decodeURIComponent(m[1]) : '';
}

const cloudUrl = get('CLOUDINARY_URL');
let cloudKey = '';
let cloudSecret = '';
{
	const m = /cloudinary:\/\/([^:]+):([^@]+)@/.exec(cloudUrl);
	if (m) {
		cloudKey = m[1];
		cloudSecret = m[2];
	}
}

console.log('=== Fragmen rahasia yang dicari ===');
console.log(`password DATABASE_URL : ${dbPassword ? `panjang ${dbPassword.length}, awal "${dbPassword.slice(0, 2)}…"` : '(tidak ada)'}`);
console.log(`cloudinary api_key    : ${cloudKey ? `panjang ${cloudKey.length}` : '(tidak ada)'}`);
console.log(`cloudinary api_secret : ${cloudSecret ? `panjang ${cloudSecret.length}` : '(tidak ada)'}`);

const fragments = [
	['db-password', dbPassword],
	['cloudinary-key', cloudKey],
	['cloudinary-secret', cloudSecret]
].filter(([, v]) => v && v.length >= 10);

/* ---------------------- Pola kredensial umum ---------------------- */
const PATTERNS = [
	['postgres URL berpassword', /postgres(?:ql)?:\/\/[^\s"'<>]+:[^\s"'<>@]+@[^\s"'<>]+/gi],
	['mysql URL berpassword', /mysql:\/\/[^\s"'<>]+:[^\s"'<>@]+@/gi],
	['mongodb URL berpassword', /mongodb(?:\+srv)?:\/\/[^\s"'<>]+:[^\s"'<>@]+@/gi],
	['JWT (eyJ…)', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}\b/g],
	['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/g],
	['AWS access key', /\bAKIA[0-9A-Z]{16}\b/g],
	['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g],
	['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g],
	['Stripe secret key', /\bsk_(?:live|test)_[A-Za-z0-9]{16,}\b/g],
	['Cloudinary URL', /cloudinary:\/\/[A-Za-z0-9_-]+:[^\s"'@]+@/gi],
	['private key block', /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g],
	['Supabase service_role literal', /service_role['"]?\s*[:=]\s*['"][A-Za-z0-9_-]{20,}/gi],
	['password assignment', /(?:password|passwd|pwd|secret|api[_-]?key|token)\s*[:=]\s*['"][^'"\s]{12,}['"]/gi],
	['bearer token literal', /Bearer\s+[A-Za-z0-9_.-]{20,}/g]
];

const tracked = sh('git ls-files').split('\n').filter(Boolean);
// Berkas biner & yang sah memuat pola umum — dikecualikan dari pemindaian isi.
const SKIP = /\.(jpg|jpeg|png|gif|webp|ico|woff2?|ttf)$/i;
// Berkas yang memang berisi contoh/dokumentasi pola.
const ALLOW = new Set(['scripts/audit-secrets.mjs']);

const findings = [];

const scan = (label, text) => {
	for (const [name, re] of PATTERNS) {
		re.lastIndex = 0;
		const hits = [...text.matchAll(re)];
		for (const h of hits) {
			// Abaikan placeholder yang jelas
			const sample = h[0];
			if (/<(?:password|api_key|api_secret|cloud_name|ref|region)>/i.test(sample)) continue;
			if (/\$\{[A-Z_]+\}/.test(sample)) continue;
			if (/example|placeholder|your-|xxx+|dummy|redacted/i.test(sample)) continue;
			const line = text.slice(0, h.index).split('\n').length;
			findings.push({ label, name, line, len: sample.length });
		}
	}
	for (const [fname, value] of fragments) {
		if (text.includes(value)) {
			const idx = text.indexOf(value);
			const line = text.slice(0, idx).split('\n').length;
			findings.push({ label, name: `fragmen ${fname}`, line, len: value.length });
		}
	}
};

/* 1. File kerja yang dilacak */
for (const file of tracked) {
	if (!fs.existsSync(file) || SKIP.test(file) || ALLOW.has(file)) continue;
	scan(file, fs.readFileSync(file, 'utf8'));
}

/* 2. Seluruh blob di riwayat (termasuk unreachable) */
const objects = new Set();
for (const line of sh('git rev-list --objects --all').split('\n').filter(Boolean)) {
	objects.add(line.split(' ')[0]);
}
for (const m of sh('git fsck --lost-found --unreachable --dangling 2>nul').matchAll(/\b([0-9a-f]{40})\b/g)) {
	objects.add(m[1]);
}

let blobs = 0;
for (const hash of objects) {
	if (sh(`git cat-file -t ${hash}`) !== 'blob') continue;
	blobs++;
	const content = sh(`git cat-file -p ${hash}`);
	// Nama berkas blob tidak selalu diketahui untuk unreachable blob.
	scan(`blob:${hash.slice(0, 10)}`, content);
}

console.log(`\n=== Hasil pemindaian ===`);
console.log(`File kerja discan : ${tracked.length}`);
console.log(`Blob riwayat      : ${blobs}`);

if (findings.length === 0) {
	console.log('\nBERSIH — tidak ada pola kredensial yang lolos filter placeholder.');
} else {
	console.log(`\n${findings.length} temuan yang perlu dilihat manusia:`);
	for (const f of findings) {
		console.log(`  [${f.name}] ${f.label}:${f.line} (panjang ${f.len})`);
	}
}
