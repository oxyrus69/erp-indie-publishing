/**
 * Verifikasi final: simulasi persis apa yang akan diterima GitHub.
 *
 * Yang diperiksa hanya objek yang BENAR-BENAR akan di-push (semua ref yang
 * akan naik), bukan sekadar working tree. Untuk setiap blob: cari fragmen
 * rahasia .env. Cetak jumlah dan lokasi saja, tanpa nilai.
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
	return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
};

/* Susun daftar "jarum" dari nilai .env, termasuk pecahan pentingnya. */
const needles = [];
const add = (label, value, minLen = 8) => {
	if (value && value.length >= minLen) needles.push({ label, value });
};

const dbUrl = get('DATABASE_URL');
add('DATABASE_URL utuh', dbUrl);
try {
	const u = new URL(dbUrl);
	add('db user', u.username, 4);
	add('db password', decodeURIComponent(u.password ?? ''), 8);
	add('db host', u.hostname, 10);
	add('db project-ref', (u.hostname.split('.')[0] ?? '').replace(/^.*postgres$/, ''), 6);
} catch {
	/* abaikan */
}

const sbUrl = get('PUBLIC_SUPABASE_URL');
add('SUPABASE_URL utuh', sbUrl);
try {
	const host = new URL(sbUrl).hostname;
	const ref = host.split('.')[0];
	add('supabase project-ref', ref, 10);
} catch {
	/* abaikan */
}

add('SUPABASE_ANON_KEY', get('PUBLIC_SUPABASE_ANON_KEY'), 20);
add('SERVICE_ROLE_KEY', get('SUPABASE_SERVICE_ROLE_KEY'), 20);

const cloudUrl = get('CLOUDINARY_URL');
add('CLOUDINARY_URL utuh', cloudUrl);
{
	const m = /cloudinary:\/\/([^:]+):([^@]+)@([^/\s]+)/.exec(cloudUrl);
	if (m) {
		add('cloudinary key', m[1], 10);
		add('cloudinary secret', m[2], 10);
		add('cloudinary cloud', m[3], 4);
	}
}

console.log(`=== ${needles.length} fragmen rahasia akan dicari ===`);
for (const n of needles) {
	console.log(`  ${n.label.padEnd(22)} panjang ${n.value.length}`);
}

/* Ref yang akan di-push. Tanpa remote, anggap semua ref lokal. */
const refs = sh('git for-each-ref --format="%(refname)"').split('\n').filter(Boolean);
console.log(`\n=== Ref yang akan naik ===`);
for (const r of refs) console.log(`  ${r}`);

const objects = new Set();
for (const r of refs) {
	for (const line of sh(`git rev-list --objects ${r}`).split('\n').filter(Boolean)) {
		objects.add(line.split(' ')[0]);
	}
}
// Plus objek tak terjangkau: GitHub TIDAK menerimanya, tapi kita periksa
// supaya tahu apakah pembersihan masih diperlukan sebelum push.
const unreachable = new Set();
for (const m of sh('git fsck --unreachable --dangling --lost-found 2>nul').matchAll(/\b([0-9a-f]{40})\b/g)) {
	unreachable.add(m[1]);
}

const scanBlobs = (set) => {
	const hits = [];
	let count = 0;
	for (const hash of set) {
		if (sh(`git cat-file -t ${hash}`) !== 'blob') continue;
		count++;
		const content = sh(`git cat-file -p ${hash}`);
		for (const n of needles) {
			if (content.includes(n.value)) hits.push({ hash, label: n.label });
		}
	}
	return { hits, count };
};

const reachable = scanBlobs(objects);
console.log(`\n=== Objek terjangkau (yang benar-benar di-push) ===`);
console.log(`Blob diperiksa: ${reachable.count}`);
if (reachable.hits.length === 0) {
	console.log('BERSIH — tidak ada fragmen rahasia di objek yang akan dikirim ke GitHub.');
} else {
	for (const h of reachable.hits) console.log(`BOCOR  ${h.label}  di blob ${h.hash.slice(0, 10)}`);
}

if (unreachable.size > 0) {
	const un = scanBlobs(unreachable);
	console.log(`\n=== Objek unreachable (tidak ikut push, tapi ada di .git lokal) ===`);
	console.log(`Blob diperiksa: ${un.count}`);
	if (un.hits.length === 0) {
		console.log('BERSIH — tidak ada fragmen rahasia.');
	} else {
		for (const h of un.hits) console.log(`PERLU BERSIH  ${h.label}  di blob ${h.hash.slice(0, 10)}`);
	}
} else {
	console.log(`\n=== Objek unreachable === tidak ada.`);
}

/* Working tree: file yang dilacak */
console.log(`\n=== Working tree (file dilacak) ===`);
const tracked = sh('git ls-files').split('\n').filter(Boolean);
const wtHits = [];
for (const f of tracked) {
	if (!fs.existsSync(f)) continue;
	if (/\.(jpg|jpeg|png|gif|webp|ico|woff2?|ttf)$/i.test(f)) continue;
	const text = fs.readFileSync(f, 'utf8');
	for (const n of needles) {
		if (text.includes(n.value)) wtHits.push({ file: f, label: n.label });
	}
}
console.log(`File diperiksa: ${tracked.length}`);
if (wtHits.length === 0) {
	console.log('BERSIH — tidak ada fragmen rahasia di file yang dilacak.');
} else {
	for (const h of wtHits) console.log(`BOCOR  ${h.label}  di ${h.file}`);
}

/* Status .env */
console.log(`\n=== .env ===`);
const trackedEnv = tracked.filter((f) => f === '.env' || f.startsWith('.env.') && f !== '.env.example');
console.log(trackedEnv.length === 0 ? '.env TIDAK dilacak (benar)' : `.env DILACAK: ${trackedEnv.join(', ')}`);
console.log(sh('git check-ignore -v .env') || 'PERINGATAN: .env tidak cocok dengan aturan ignore mana pun');
