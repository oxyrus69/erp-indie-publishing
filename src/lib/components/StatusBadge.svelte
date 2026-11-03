<script lang="ts">
	import { TONE_CLASS, type Tone } from '$lib/ui';

	let {
		label,
		tone = 'neutral',
		dot = true
	}: { label: string; tone?: Tone; dot?: boolean } = $props();
</script>

<span class="badge {TONE_CLASS[tone]}">
	{#if dot}
		<span class="size-1.5 rounded-full bg-current opacity-70"></span>
	{/if}
	{label}
</span>
