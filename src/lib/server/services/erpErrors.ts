export type ErpErrorCode =
	| 'NOT_FOUND'
	| 'INVALID_STATE'
	| 'FORBIDDEN'
	| 'QUOTA_EXCEEDED'
	| 'INSUFFICIENT_STOCK'
	| 'ALREADY_PROCESSED'
	| 'UNPAID';

/**
 * Error domain ERP. Route handler memetakan `code` ke status HTTP
 * sehingga UI bisa menampilkan pesan yang tepat dalam Bahasa Indonesia.
 */
export class ErpError extends Error {
	readonly code: ErpErrorCode;
	readonly details?: Record<string, unknown>;

	constructor(code: ErpErrorCode, message: string, details?: Record<string, unknown>) {
		super(message);
		this.name = 'ErpError';
		this.code = code;
		this.details = details;
	}

	get httpStatus(): number {
		switch (this.code) {
			case 'NOT_FOUND':
				return 404;
			case 'FORBIDDEN':
				return 403;
			case 'ALREADY_PROCESSED':
				return 409;
			case 'INVALID_STATE':
			case 'QUOTA_EXCEEDED':
			case 'INSUFFICIENT_STOCK':
			case 'UNPAID':
				return 422;
			default:
				return 400;
		}
	}
}

export function fail(
	code: ErpErrorCode,
	message: string,
	details?: Record<string, unknown>
): never {
	throw new ErpError(code, message, details);
}
