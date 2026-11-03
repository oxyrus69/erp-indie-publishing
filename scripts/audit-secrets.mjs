/**
 * Audit kebocoran kredensial.
 *
 * Tidak mencetak nilai rahasia sama sekali — hanya panjang, hash pendek, dan
 * lokasi temuan. Tujuan: membuktikan ada/tidaknya, bukan menampilkannya.
 */
import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';

const sh = (cmd) => {
	try {
		return execSync(cmd, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
	} catch {
		return '';
	}
};

/* ------------------------- 1. Baca nilai .env asli ------------------------- */
const envText = fs.readFileSync('.env', 'utf8');
const secrets = {};
for (const line of envText.split(/\r?\n/)) {
	const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line);
	if (!m) continue;
	let value = m[2].trim();
	// buang kutip pembungkus
	if (
		(value.startsWith('"') && value.endsWith('"')) ||
		(value.startsWith("'") && value.endsWith("'"))
	) {
		value = value.slice(1, -1);
	}
	secrets[m[1]] = value;
}

const isReal = (v) => typeof v === 'string' && v.length >= 8 && !/^<.*>$/.test(v);

console.log('=== 1. Variabel .env (tanpa nilai) ===');
for (const [k, v] of Object.entries(secrets)) {
	const fp = v ? crypto.createHash('sha256').update(v).digest('hex').slice(0, 10) : '(kosong)';
	console.log(
		`${k.padEnd(26)} len=${String(v.length).padStart(3)}  ${isReal(v) ? 'TERISI' : 'kosong/pendek'}  fp=${fp}`
	);
}

/* ------------------- 2. Kumpulan teks yang akan di-push ------------------- */
// Semua blob di seluruh riwayat (bukan hanya HEAD) + file kerja yang dilacak.
const tracked = sh('git ls-files').split('\n').filter(Boolean);

const allObjects = new Set();
// blob di semua commit
const revList = sh('git rev-list --objects --all').split('\n').filter(Boolean);
for (const line of revList) {
	const [hash, ...rest] = line.split(' ');
	if (rest.length > 0 || hash.length === 40) allObjects.add(hash);
}
// danglings & unreachable (mis. file yang sempat di-add lalu di-reset)
const fsck = sh('git fsck --lost-found --unreachable --dangling 2>nul');
for (const m of fsck.matchAll(/\b([0-9a-f]{40})\b/g)) allObjects.add(m[1]);

console.log(`\n=== 2. Cakupan audit ===`);
console.log(`File dilacak (HEAD): ${tracked.length}`);
console.log(`Objek git diperiksa (riwayat + unreachable): ${allObjects.size}`);

/* --------------- 3. Cari nilai .env persis di dalam objek git --------------- */
const targets = Object.entries(secrets).filter(([, v]) => isReal(v));

const leaks = [];

// 3a. File kerja yang akan di-push
for (const file of tracked) {
	if (!fs.existsSync(file)) continue;
	const text = fs.readFileSync(file, 'utf8');
	for (const [key, value] of targets) {
		if (text.includes(value)) leaks.push({ where: file, key, via: 'working-tree' });
	}
}

// 3b. Setiap blob di riwayat
let scannedBlobs = 0;
for (const hash of allObjects) {
	const type = sh(`git cat-file -t ${hash}`);
	if (type !== 'blob') continue;
	const content = sh(`git cat-file -p ${hash}`);
	scannedBlobs++;
	for (const [key, value] of targets) {
		if (content.includes(value)) leaks.push({ where: `blob:${hash.slice(0, 10)}`, key, via: 'history' });
	}
}
console.log(`Blob discan: ${scannedBlobs}`);

console.log(`\n=== 3. Kebocoran nilai .env ===`);
if (leaks.length === 0) {
	console.log('BERSIH — tidak satu pun nilai .env muncul di file ter-commit maupun objek git.');
} else {
	for (const l of leaks) console.log(`BOCOR  ${l.key}  di ${l.where} (${l.via})`);
}
