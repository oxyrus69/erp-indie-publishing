/**
 * Audit data pribadi non-kredensial: email di metadata commit, nomor telepon,
 * rekening bank, dan email asli di data seed.
 *
 * Alasan: repo publik membocorkan lebih dari sekadar password. Metadata commit
 * memuat email penulis, dan data seed bisa memuat nomor asli bila tidak hati-hati.
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

console.log('=== 1. Metadata commit (ikut publik, tidak bisa dihapus tanpa rewrite) ===');
const commits = sh('git log --format="%H|%an|%ae|%cn|%ce|%s"').split('\n').filter(Boolean);
for (const line of commits) {
	const [sha, an, ae, cn, ce, ...rest] = line.split('|');
	console.log(`  ${sha.slice(0, 7)}  author: ${an} <${ae}>`);
	console.log(`           committer: ${cn} <${ce}>`);
	console.log(`           pesan: ${rest.join('|')}`);
}

console.log('\n=== 2. Identitas git yang akan dipakai commit berikutnya ===');
for (const key of ['user.name', 'user.email']) {
	const local = sh(`git config --local ${key}`);
	const global_ = sh(`git config --global ${key}`);
	console.log(`  ${key}: lokal=${local || '(tidak diset)'}  global=${global_ || '(tidak diset)'}`);
}

console.log('\n=== 3. Pola data pribadi di file yang dilacak ===');
const tracked = sh('git ls-files').split('\n').filter(Boolean);
const SKIP = /\.(jpg|jpeg|png|gif|webp|ico|woff2?|ttf)$/i;

const PATTERNS = [
	['nomor HP Indonesia', /\b(?:\+62|62|0)8[1-9][0-9]{6,11}\b/g],
	['NIK (16 digit)', /\b[1-9][0-9]{15}\b/g],
	['nomor rekening (10-16 digit)', /\b[0-9]{10,16}\b/g],
	['email non-demo', /\b[A-Za-z0-9._%+-]+@(?!penerbit\.co\.id|demo\.id|freelance\.id|contoh\.id|example\.(?:com|org)|test\.|localhost)[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g]
];

const findings = [];
for (const file of tracked) {
	if (!fs.existsSync(file) || SKIP.test(file)) continue;
	if (file === 'scripts/audit-patterns.mjs' || file === 'scripts/audit-push.mjs' || file === 'scripts/audit-secrets.mjs' || file === 'scripts/audit-personal.mjs') continue;
	const text = fs.readFileSync(file, 'utf8');
	const lines = text.split('\n');
	lines.forEach((line, i) => {
		// lewati komentar yang jelas-jelas contoh
		for (const [name, re] of PATTERNS) {
			re.lastIndex = 0;
			const hits = [...line.matchAll(re)];
			for (const h of hits) {
				const sample = h[0];
				// saring deret angka yang jelas bukan rekening (tahun, versi, ukuran)
				if (name.includes('rekening') && /^(?:19|20)\d{2}/.test(sample)) continue;
				if (name.includes('NIK') && /^0/.test(sample)) continue;
				if (/xxx|example|contoh|dummy|placeholder|<|>/i.test(sample)) continue;
				findings.push({ file, line: i + 1, name, mask: sample.replace(/.(?=.{3})/g, '*') });
			}
		}
	});
}

if (findings.length === 0) {
	console.log('  BERSIH — tidak ada pola data pribadi yang mencurigakan.');
} else {
	console.log(`  ${findings.length} kandidat (nilai disamarkan):`);
	for (const f of findings.slice(0, 40)) {
		console.log(`    [${f.name}] ${f.file}:${f.line}  ${f.mask}`);
	}
	if (findings.length > 40) console.log(`    … dan ${findings.length - 40} lainnya`);
}
