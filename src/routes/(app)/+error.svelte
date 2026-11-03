<script lang="ts">
	import { page } from '$app/state';
	import ErrorView from '$lib/components/ErrorView.svelte';
</script>

<!-- Galat dari halaman di dalam (app) tetap tampil di dalam shell aplikasi. -->
<ErrorView status={page.status} message={page.error?.message} variant="embedded" />
