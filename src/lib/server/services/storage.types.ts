import type { BucketName } from '../env';

export type FolderOptions = {
	projectId: string;
	subfolder?: string;
};

export type PreviewOptions = {
	width?: number;
	watermarkText?: string;
};

export type SignedUpload = {
	bucket: BucketName;
	path: string;
	token: string;
	signedUrl: string;
};

export type SignedDownload = {
	signedUrl: string;
	expiresAt: Date;
};
