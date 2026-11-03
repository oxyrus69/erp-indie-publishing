import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
/**
 * `style: false` — proyek ini tidak memakai blok `<style>` di komponen Svelte
 * (semua gaya lewat `app.css` + Tailwind). Tanpa ini, vite-preprocess ikut
 * menjalankan PostCSS/Tailwind ke blok `<style>` milik paket pihak ketiga
 * (mis. layerchart, yang memakai `@layer components`), dan Tailwind menolaknya
 * karena file itu bukan entry CSS — halaman jadi 500.
 */
const config = {
	preprocess: vitePreprocess({ style: false }),
	kit: {
		adapter: adapter(),
		alias: {
			$db: './src/lib/server/db'
		}
	}
};

export default config;
