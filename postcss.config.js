import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

/**
 * Membuka bungkus `@layer` pada CSS pihak ketiga.
 *
 * Komponen layerchart menulis `@layer base { ... }` di blok `<style>`-nya.
 * Tailwind v3 hanya mengenal directive itu di file entry yang punya
 * `@tailwind base`; kalau ia menangkap CSS komponen lain, seluruh halaman 500
 * ("`@layer base` is used but no matching `@tailwind base` directive").
 *
 * Plugin ini berjalan SEBELUM Tailwind dan, khusus untuk file di
 * `node_modules`, mengangkat isi `@layer` ke luar bungkusnya. CSS pihak ketiga
 * tetap utuh; urutan cascade-nya hanya kehilangan nama layer, yang tidak
 * dipakai siapa pun di sini.
 */
const unwrapThirdPartyLayers = () => ({
	postcssPlugin: 'unwrap-third-party-layers',
	Once(root, { result }) {
		const from = result.opts.from ?? '';
		if (!from.includes('node_modules')) return;

		root.walkAtRules('layer', (atRule) => {
			// Hanya blok bercabang: `@layer a, b;` tidak punya anak.
			if (atRule.nodes) atRule.replaceWith(atRule.nodes);
		});
	}
});
unwrapThirdPartyLayers.postcss = true;

export default {
	plugins: [unwrapThirdPartyLayers(), tailwindcss(), autoprefixer()]
};
