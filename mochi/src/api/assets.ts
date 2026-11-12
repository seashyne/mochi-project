// Assets upload client module for Mochi Web Platform

import { ApiClient, defaultApiClient, ApiClientError } from './client';
import { AssetUploadRequest, AssetUploadResponse } from './types';
import {
  multipartUploader,
  UploadBlobOptions,
  UploadedAsset
} from './multipartUpload';

export class AssetsApi {
  constructor(private client: ApiClient = defaultApiClient) {}

  public async getUploadUrl(
    request: AssetUploadRequest,
    token?: string
  ): Promise<AssetUploadResponse> {
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return this.client.post<AssetUploadResponse>('/api/v1/assets/upload-url', request, {
      headers
    });
  }

  // Resumable multipart upload for large assets (world chunks, models, textures).
  public async uploadBlob(
    data: Blob,
    options: UploadBlobOptions = {}
  ): Promise<UploadedAsset> {
    return multipartUploader.upload(data, options);
  }

  public async uploadAsset(
    uploadUrl: string,
    data: Blob | ArrayBuffer | Uint8Array,
    contentType: string
  ): Promise<void> {
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType
      },
      body: data as BodyInit
    });

    if (!response.ok) {
      throw new ApiClientError(
        `Failed to upload asset payload: ${response.statusText}`,
        response.status
      );
    }
  }
}

export const assetsApi = new AssetsApi();
