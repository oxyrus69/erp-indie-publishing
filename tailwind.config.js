import forms from '@tailwindcss/forms';
import typography from '@tailwindcss/typography';

/** @type {import('tailwindcss').Config} */
export default {
	content: ['./src/**/*.{html,js,svelte,ts}'],
	darkMode: 'class',
	theme: {
		extend: {
			colors: {
				ink: {
					50: '#f6f6f5',
					100: '#e7e7e4',
					200: '#d1d1cc',
					300: '#b0b0a8',
					400: '#8a8a80',
					500: '#6f6f66',
					600: '#585850',
					700: '#47473f',
					800: '#3c3c36',
					900: '#23231f',
					950: '#141413'
				},
				paper: '#faf9f6',
				/** Yale Blue — satu-satunya warna aksen (interaktif). */
				yale: {
					50: '#f0f6fd',
					100: '#dceaf9',
					200: '#c1daf4',
					300: '#98c3eb',
					400: '#67a3de',
					500: '#4385ce',
					600: '#2f6ab5',
					700: '#0f4d92',
					800: '#0d3f75',
					900: '#0b3257',
					950: '#06203b'
				}
			},
			fontFamily: {
				sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
				serif: ['"Instrument Serif"', 'ui-serif', 'Georgia', 'serif'],
				mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace']
			}
		}
	},
	plugins: [forms, typography]
};
