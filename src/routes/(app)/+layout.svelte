<script lang="ts">
	import AppShell from '$lib/components/AppShell.svelte';
	import type { LayoutData } from './$types';
	import type { Snippet } from 'svelte';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();
</script>

<AppShell
	profile={data.profile}
	unread={data.unreadNotifications}
	notifications={data.notifications}
>
	{@render children()}
</AppShell>
