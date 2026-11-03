<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { browser } from '$app/environment';
	import { ROLE_LABEL_ID } from '$lib/ui';
	import NavProgress from './NavProgress.svelte';
	import Toaster from './Toaster.svelte';
	import ConfirmHost from './ConfirmHost.svelte';
	import NotificationBell from './NotificationBell.svelte';
	import {
		BookOpen,
		Gauge,
		LayoutDashboard,
		Library,
		Wallet,
		ClipboardList,
		LogOut,
		Moon,
		PenLine,
		Receipt,
		Settings,
		Sun,
		Tags,
		Menu,
		ScrollText,
		Users,
		UserPlus,
		X
	} from 'lucide-svelte';
	import type { Profile } from '$db/schema';

	let {
		profile,
		unread = 0,
		notifications = [],
		children,
		title = '',
		subtitle = ''
	}: {
		profile: Profile | null;
		unread?: number;
		notifications?: {
			id: string;
			category: string;
			severity: string;
			title: string;
			body: string | null;
			href: string | null;
			readAt: Date | null;
			createdAt: Date;
		}[];
		children: Snippet;
		title?: string;
		subtitle?: string;
	} = $props();

	const role = $derived(profile?.role ?? 'AUTHOR');

	const NAV: Record<string, { href: string; label: string; icon: typeof Library }[]> = {
		SUPER_ADMIN: [
			{ href: '/admin', label: 'Dasbor', icon: LayoutDashboard },
			{ href: '/dss', label: 'Keputusan', icon: Gauge },
			{ href: '/crm', label: 'Prospek', icon: UserPlus },
			{ href: '/orders', label: 'Order', icon: Receipt },
			{ href: '/projects', label: 'Proyek', icon: Library },
			{ href: '/admin/finance', label: 'Keuangan', icon: Wallet },
			{ href: '/admin/katalog', label: 'Katalog', icon: Tags },
			{ href: '/admin/penulis', label: 'Penulis', icon: PenLine },
			{ href: '/admin/freelancer', label: 'Freelancer', icon: Users },
			{ href: '/admin/audit', label: 'Jejak Aktivitas', icon: ScrollText },
			{ href: '/admin/pengaturan', label: 'Pengaturan', icon: Settings }
		],
		PROJECT_MANAGER: [
			{ href: '/admin', label: 'Dasbor', icon: LayoutDashboard },
			{ href: '/dss', label: 'Keputusan', icon: Gauge },
			{ href: '/crm', label: 'Prospek', icon: UserPlus },
			{ href: '/orders', label: 'Order', icon: Receipt },
			{ href: '/projects', label: 'Proyek', icon: Library },
			{ href: '/admin/katalog', label: 'Katalog', icon: Tags },
			{ href: '/admin/penulis', label: 'Penulis', icon: PenLine },
			{ href: '/admin/freelancer', label: 'Freelancer', icon: Users },
			{ href: '/admin/audit', label: 'Jejak Aktivitas', icon: ScrollText },
			{ href: '/admin/pengaturan', label: 'Pengaturan', icon: Settings }
		],
		FINANCE: [
			{ href: '/admin', label: 'Dasbor', icon: LayoutDashboard },
			{ href: '/dss', label: 'Keputusan', icon: Gauge },
			{ href: '/orders', label: 'Order', icon: Receipt },
			{ href: '/admin/finance', label: 'Keuangan', icon: Wallet },
			{ href: '/admin/audit', label: 'Jejak Aktivitas', icon: ScrollText },
			{ href: '/admin/pengaturan', label: 'Pengaturan', icon: Settings }
		],
		FREELANCER: [{ href: '/freelancer', label: 'Tugas Saya', icon: ClipboardList }],
		AUTHOR: [{ href: '/portal', label: 'Buku Saya', icon: BookOpen }]
	};

	const navItems = $derived(NAV[role] ?? []);

	/**
	 * Tema disimpan di localStorage dan sudah diterapkan oleh skrip di app.html
	 * sebelum paint. Nilai awal dibaca dari class pada <html> agar toggle tidak
	 * menimpa pilihan pengguna setiap kali layout di-mount ulang.
	 */
	let dark = $state(browser && document.documentElement.classList.contains('dark'));

	/**
	 * Di bawah breakpoint ini sidebar berubah menjadi drawer yang dipanggil dari
	 * topbar. `isDesktop` dibaca dari matchMedia (bukan dari lebar render) supaya
	 * label tombol menu dan `inert` selalu cocok dengan CSS `lg:`.
	 */
	const DESKTOP_QUERY = '(min-width: 1024px)';
	let isDesktop = $state(browser ? window.matchMedia(DESKTOP_QUERY).matches : false);
	let menuOpen = $state(false);
	let menuButton = $state<HTMLButtonElement | null>(null);

	$effect(() => {
		if (!browser) return;
		const query = window.matchMedia(DESKTOP_QUERY);
		const onChange = (event: MediaQueryListEvent) => {
			isDesktop = event.matches;
			// Melebarkan jendela ke desktop menutup drawer, agar tidak tertinggal
			// dalam keadaan "terbuka" saat jendela dipersempit lagi.
			if (event.matches) menuOpen = false;
		};
		query.addEventListener('change', onChange);
		return () => query.removeEventListener('change', onChange);
	});

	/**
	 * Drawer ditutup otomatis setiap rute berganti — termasuk saat pengguna
	 * menekan tombol back browser, bukan hanya saat mengeklik tautan.
	 */
	let lastPath = browser ? page.url.pathname : '';
	$effect(() => {
		const path = page.url.pathname;
		if (path === lastPath) return;
		lastPath = path;
		menuOpen = false;
	});

	/** Halaman di belakang drawer tidak ikut bergulir selagi drawer terbuka. */
	$effect(() => {
		if (!browser || !menuOpen || isDesktop) return;
		const root = document.documentElement;
		const previous = root.style.overflow;
		root.style.overflow = 'hidden';
		return () => {
			root.style.overflow = previous;
		};
	});

	function closeMenu(): void {
		menuOpen = false;
	}

	/**
	 * Esc menutup drawer dan mengembalikan fokus ke tombol pembukanya, supaya
	 * pengguna keyboard tidak terlempar ke awal dokumen.
	 */
	function handleKeydown(event: KeyboardEvent): void {
		if (event.key !== 'Escape' || !menuOpen) return;
		closeMenu();
		menuButton?.focus();
	}

	/**
	 * Hanya satu tautan yang boleh aktif. Prefix terpanjang menang, sehingga
	 * `/admin/finance` tidak ikut menyalakan `/admin` di atasnya.
	 */
	const activeHref = $derived(
		navItems
			.map((item) => item.href)
			.filter((href) => page.url.pathname === href || page.url.pathname.startsWith(`${href}/`))
			.sort((a, b) => b.length - a.length)[0] ?? null
	);

	function isActive(href: string): boolean {
		return activeHref === href;
	}

	function toggleTheme(): void {
		dark = !dark;
		document.documentElement.classList.toggle('dark', dark);
		try {
			localStorage.setItem('erp-theme', dark ? 'dark' : 'light');
		} catch {}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="min-h-full bg-paper text-ink-900 dark:bg-ink-950 dark:text-ink-100">
	<!--
		Skip-link: pengguna keyboard tidak perlu menekan Tab melewati sidebar
		(sekitar 6 tautan) setiap kali berpindah halaman. Tersembunyi sampai
	difokus, lalu muncul di atas segalanya.
	-->
	<a
		href="#konten"
		class="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-yale-700 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white focus:shadow-lg"
	>
		Lewati ke konten
	</a>

	<!-- Latar gelap drawer. Menutup saat diklik, dan tidak pernah tampil di desktop. -->
	{#if menuOpen}
		<div
			class="fixed inset-0 z-30 bg-ink-950/50 backdrop-blur-sm lg:hidden"
			role="presentation"
			onclick={closeMenu}
		></div>
	{/if}

	<aside
		id="app-drawer"
		aria-label="Navigasi utama"
		inert={!menuOpen && !isDesktop}
		class="fixed inset-y-0 left-0 z-40 flex w-72 max-w-[86vw] flex-col border-r border-ink-200/80 bg-white px-4 py-6
			transition-transform duration-300 ease-out
			dark:border-ink-800 dark:bg-ink-900
			lg:z-30 lg:w-60 lg:max-w-none lg:translate-x-0
			{menuOpen ? 'translate-x-0' : '-translate-x-full'}"
	>
		<div class="flex items-center justify-between gap-2">
			<a
				href="/"
				onclick={closeMenu}
				class="flex items-center gap-2.5 px-2 text-sm font-semibold tracking-tight"
			>
				<BookOpen class="size-4" strokeWidth={1.75} />
				<span>Penerbit<span class="text-ink-400">·</span>ERP</span>
			</a>
			<button
				type="button"
				class="grid size-8 shrink-0 place-items-center rounded-lg text-ink-500 transition hover:bg-ink-100 hover:text-ink-900 dark:text-ink-400 dark:hover:bg-ink-800 dark:hover:text-ink-100 lg:hidden"
				aria-label="Tutup menu navigasi"
				onclick={closeMenu}
			>
				<X class="size-4" strokeWidth={1.75} />
			</button>
		</div>

		<nav class="mt-8 flex-1 space-y-0.5">
			<p class="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400">
				Ruang Kerja
			</p>
			{#each navItems as item (item.href)}
				<a
					href={item.href}
					aria-current={isActive(item.href) ? 'page' : undefined}
					onclick={closeMenu}
					class="flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm transition
						{isActive(item.href)
						? 'bg-yale-50 font-medium text-yale-800 dark:bg-yale-950/50 dark:text-yale-200'
						: 'text-ink-600 hover:bg-ink-50 dark:text-ink-400 dark:hover:bg-ink-800/60'}"
				>
					<item.icon class="size-4" strokeWidth={1.75} />
					{item.label}
				</a>
			{/each}
		</nav>

		<div class="mt-4 border-t border-ink-100 pt-4 dark:border-ink-800">
			<div class="flex items-center gap-2.5 px-2">
				<span
					class="grid size-8 place-items-center rounded-full bg-yale-700 font-mono text-xs font-semibold text-white dark:bg-yale-600"
				>
					{(profile?.fullName ?? '?').slice(0, 1).toUpperCase()}
				</span>
				<div class="min-w-0 flex-1">
					<p class="truncate text-xs font-medium">{profile?.fullName ?? 'Tanpa Profil'}</p>
					<p class="truncate text-[11px] text-ink-400">{ROLE_LABEL_ID[role]}</p>
				</div>
			</div>
			<div class="mt-3 flex items-center gap-1">
				<form method="POST" action="/auth/signout" class="flex-1">
					<button class="btn-secondary w-full !py-1.5 !text-xs" type="submit">
						<LogOut class="size-3.5" /> Keluar
					</button>
				</form>
				<button
					type="button"
					class="btn-secondary !px-2 !py-1.5"
					aria-label={dark ? 'Ganti ke tema terang' : 'Ganti ke tema gelap'}
					aria-pressed={dark}
					title={dark ? 'Ganti ke tema terang' : 'Ganti ke tema gelap'}
					onclick={toggleTheme}
				>
					{#if dark}<Sun class="size-3.5" />{:else}<Moon class="size-3.5" />{/if}
				</button>
			</div>
		</div>
	</aside>

	<div class="lg:pl-60">
		<header
			class="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-ink-200/80 bg-paper/85 px-5 py-4 backdrop-blur dark:border-ink-800 dark:bg-ink-950/85 lg:px-10"
		>
			<div class="flex min-w-0 items-center gap-3">
				<!--
					Topbar adalah satu-satunya jalan ke navigasi di ponsel, karena
					sidebar disembunyikan di bawah lg. Tombolnya menyamar sebagai
					kontrol 36px yang sama tinggi dengan badge di kanan.
				-->
				<button
					bind:this={menuButton}
					type="button"
					class="-ml-1 grid size-9 shrink-0 place-items-center rounded-lg border border-ink-200 bg-white text-ink-600 transition hover:border-ink-300 hover:bg-ink-50 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-300 dark:hover:bg-ink-800 lg:hidden"
					aria-label="Buka menu navigasi"
					aria-controls="app-drawer"
					aria-expanded={menuOpen}
					onclick={() => (menuOpen = true)}
				>
					<Menu class="size-4" strokeWidth={1.75} />
				</button>

				<div class="min-w-0">
					{#if title}
						<h1 class="truncate text-lg font-semibold tracking-tight">{title}</h1>
					{/if}
					{#if subtitle}
						<p class="truncate text-xs text-ink-500 dark:text-ink-400">{subtitle}</p>
					{/if}
				</div>
			</div>

			<div class="flex shrink-0 items-center gap-2">
				<NotificationBell items={notifications} {unread} />
				<span
					class="badge hidden border-ink-200 bg-ink-50 text-ink-500 sm:inline-flex dark:border-ink-700 dark:bg-ink-800 dark:text-ink-300"
				>
					{ROLE_LABEL_ID[role]}
				</span>
			</div>

			<!-- Bar progres navigasi menempel di tepi bawah topbar, jadi selalu
			     terlihat tanpa menggeser layout halaman. -->
			<NavProgress />
		</header>

		<main id="konten" tabindex="-1" class="px-5 py-6 lg:px-10 lg:py-8">{@render children()}</main>
	</div>

	<Toaster />
	<ConfirmHost />
</div>
