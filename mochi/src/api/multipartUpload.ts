// Resumable multipart uploader for assets larger than the Worker body limit.
// Parts are sliced client-side, uploaded with bounded concurrency, and finalized
// into a content-addressed R2 object.

import { ApiClient, ApiClientError, defaultApiClient } from './client';
import {
  MultipartCompleteResponse,
  MultipartCreateResponse,
  MultipartPartResponse
} from './types';
import { hashBlob } from './sha256';

export type UploadPhase = 'hashing' | 'uploading' | 'completing';

export interface UploadProgress {
  phase: UploadPhase;
  uploadedBytes: number;
  totalBytes: number;
  partNumber?: number;
  totalParts?: number;
}

export interface UploadBlobOptions {
  filename?: string;
  contentType?: string;
  token?: string;
  concurrency?: number;
  onProgress?: (progress: UploadProgress) => void;
  signal?: AbortSignal;
}

export interface UploadedAsset {
  assetKey: string;
  publicUrl: string;
  sizeBytes: number;
  contentType: string;
  etag: string;
  sha256: string;
}

const DEFAULT_CONCURRENCY = 3;
const MAX_PART_ATTEMPTS = 2;

function requireField<T>(value: T | undefined, name: string): T {
  if (value === undefined || value === null) {
    throw new ApiClientError(`Upload session is missing ${name}`, 500);
  }
  return value;
}

export class MultipartUploader {
  constructor(private client: ApiClient = defaultApiClient) {}

  public async upload(
    data: Blob,
    options: UploadBlobOptions = {}
  ): Promise<UploadedAsset> {
    const filename = options.filename || 'asset.bin';
    const contentType = options.contentType || data.type || 'application/octet-stream';
    const report = options.onProgress;

    report?.({ phase: 'hashing', uploadedBytes: 0, totalBytes: data.size });
    const sha256 = await hashBlob(data, (hashed, total) => {
      report?.({ phase: 'hashing', uploadedBytes: hashed, totalBytes: total });
    });

    const headers: Record<string, string> = {};
    if (options.token) headers.Authorization = `Bearer ${options.token}`;

    const session = await this.client.post<MultipartCreateResponse>(
      '/api/v1/assets/multipart/create',
      { filename, contentType, sizeBytes: data.size, sha256 },
      { headers, signal: options.signal }
    );

    if (session.existing) {
      report?.({ phase: 'completing', uploadedBytes: data.size, totalBytes: data.size });
      return {
        assetKey: session.assetKey,
        publicUrl: session.publicUrl,
        sizeBytes: data.size,
        contentType,
        etag: 'existing',
        sha256
      };
    }

    const uploadId = requireField(session.uploadId, 'uploadId');
    const uploadToken = requireField(session.uploadToken, 'uploadToken');
    const partSize = requireField(session.partSize, 'partSize');
    const totalParts = requireField(session.totalParts, 'totalParts');

    try {
      const parts = await this.uploadParts(data, {
        assetKey: session.assetKey,
        uploadId,
        uploadToken,
        partSize,
        totalParts,
        concurrency: options.concurrency ?? DEFAULT_CONCURRENCY,
        signal: options.signal,
        onProgress: report
      });

      report?.({ phase: 'completing', uploadedBytes: data.size, totalBytes: data.size });
      const completed = await this.client.request<MultipartCompleteResponse>(
        this.completeUrl(session.assetKey, uploadId),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Upload-Token': uploadToken
          },
          body: JSON.stringify({ parts }),
          signal: options.signal
        }
      );

      return {
        assetKey: completed.assetKey,
        publicUrl: completed.publicUrl,
        sizeBytes: completed.sizeBytes,
        contentType: completed.contentType,
        etag: completed.etag,
        sha256
      };
    } catch (error) {
      await this.abort(session.assetKey, uploadId, uploadToken);
      throw error;
    }
  }

  private async uploadParts(
    data: Blob,
    options: {
      assetKey: string;
      uploadId: string;
      uploadToken: string;
      partSize: number;
      totalParts: number;
      concurrency: number;
      signal?: AbortSignal;
      onProgress?: (progress: UploadProgress) => void;
    }
  ): Promise<MultipartPartResponse[]> {
    const queue = Array.from({ length: options.totalParts }, (_, index) => index + 1);
    const results: MultipartPartResponse[] = [];
    let uploadedBytes = 0;
    const workerCount = Math.max(1, Math.min(options.concurrency, options.totalParts));

    const worker = async () => {
      while (queue.length > 0) {
        if (options.signal?.aborted) throw new DOMException('Upload aborted', 'AbortError');
        const partNumber = queue.shift() as number;
        const start = (partNumber - 1) * options.partSize;
        const end = Math.min(start + options.partSize, data.size);
        const slice = data.slice(start, end);
        const partHash = await hashBlob(slice);

        const part = await this.uploadPartWithRetry(
          slice,
          partNumber,
          options.assetKey,
          options.uploadId,
          options.uploadToken,
          partHash,
          options.signal
        );
        results.push(part);
        uploadedBytes += slice.size;
        options.onProgress?.({
          phase: 'uploading',
          uploadedBytes,
          totalBytes: data.size,
          partNumber,
          totalParts: options.totalParts
        });
      }
    };

    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    return results.sort((a, b) => a.partNumber - b.partNumber);
  }

  private async uploadPartWithRetry(
    slice: Blob,
    partNumber: number,
    assetKey: string,
    uploadId: string,
    uploadToken: string,
    partHash: string,
    signal?: AbortSignal
  ): Promise<MultipartPartResponse> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_PART_ATTEMPTS; attempt++) {
      try {
        const response = await fetch(this.partUrl(assetKey, partNumber, uploadId), {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/octet-stream',
            'X-Upload-Token': uploadToken,
            'X-Part-Sha256': partHash
          },
          body: slice,
          signal
        });
        if (!response.ok) {
          throw new ApiClientError(
            `Part ${partNumber} failed with status ${response.status}`,
            response.status
          );
        }
        return (await response.json()) as MultipartPartResponse;
      } catch (error) {
        lastError = error;
        if (signal?.aborted || attempt === MAX_PART_ATTEMPTS) break;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new ApiClientError(`Part ${partNumber} upload failed`, 0);
  }

  private async abort(assetKey: string, uploadId: string, uploadToken: string): Promise<void> {
    try {
      await fetch(
        `${this.client.getBaseUrl()}/api/v1/assets/multipart/abort?key=${encodeURIComponent(assetKey)}&uploadId=${encodeURIComponent(uploadId)}`,
        { method: 'DELETE', headers: { 'X-Upload-Token': uploadToken } }
      );
    } catch {
      // Abort is best-effort; the upload token expires on its own.
    }
  }

  private partUrl(assetKey: string, partNumber: number, uploadId: string): string {
    return `${this.client.getBaseUrl()}/api/v1/assets/multipart/part?key=${encodeURIComponent(
      assetKey
    )}&uploadId=${encodeURIComponent(uploadId)}&partNumber=${partNumber}`;
  }

  private completeUrl(assetKey: string, uploadId: string): string {
    return `/api/v1/assets/multipart/complete?key=${encodeURIComponent(
      assetKey
    )}&uploadId=${encodeURIComponent(uploadId)}`;
  }
}

export const multipartUploader = new MultipartUploader();
