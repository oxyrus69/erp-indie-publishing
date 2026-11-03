import type { UserRole } from '$db/schema';

/**
 * Peta hak akses per rute. `null` berarti hanya butuh login.
 * Urutan pencocokan: prefix terpanjang menang.
 */
export const ROUTE_ROLES: Record<string, UserRole[] | null> = {
	'/admin': ['SUPER_ADMIN', 'PROJECT_MANAGER', 'FINANCE'],
	'/projects': ['SUPER_ADMIN', 'PROJECT_MANAGER', 'FINANCE'],
	'/orders': ['SUPER_ADMIN', 'PROJECT_MANAGER', 'FINANCE'],
	'/crm': ['SUPER_ADMIN', 'PROJECT_MANAGER'],
	'/dss': ['SUPER_ADMIN', 'PROJECT_MANAGER', 'FINANCE'],
	'/notifications': null,
	'/files': null,
	'/freelancer': ['FREELANCER'],
	'/portal': ['AUTHOR']
};

/** Prefix rute yang tidak memerlukan autentikasi. */
export const PUBLIC_PREFIXES = ['/login', '/auth', '/api/public', '/_app', '/favicon'];

export function isPublicPath(pathname: string): boolean {
	return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Rute default setelah login, per role. */
export const ROLE_HOME: Record<UserRole, string> = {
	SUPER_ADMIN: '/admin',
	PROJECT_MANAGER: '/admin',
	FINANCE: '/admin',
	FREELANCER: '/freelancer',
	AUTHOR: '/portal'
};

/**
 * Mencari role yang diizinkan untuk sebuah path.
 * Mengembalikan `{ matched: false }` bila rute tidak diatur (hanya butuh login).
 */
export function resolveRouteRoles(pathname: string): { matched: boolean; roles: UserRole[] | null } {
	const entries = Object.entries(ROUTE_ROLES)
		.filter(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`))
		.sort((a, b) => b[0].length - a[0].length);

	const top = entries[0];
	if (!top) return { matched: false, roles: null };
	return { matched: true, roles: top[1] };
}

export function hasRole(userRole: UserRole, allowed: UserRole[] | null): boolean {
	if (allowed === null) return true;
	if (userRole === 'SUPER_ADMIN') return true;
	return allowed.includes(userRole);
}

/** Label Bahasa Indonesia untuk setiap role. */
export const ROLE_LABEL: Record<UserRole, string> = {
	SUPER_ADMIN: 'Super Admin',
	PROJECT_MANAGER: 'Project Manager',
	FINANCE: 'Finance',
	FREELANCER: 'Freelancer',
	AUTHOR: 'Penulis'
};
