import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, from, map, switchMap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { compressImage, compressImages } from '../utils/image-compressor.util';

interface CloudinaryUploadResponse {
  secure_url: string;
}

@Injectable({ providedIn: 'root' })
export class CloudinaryService {
  private readonly http = inject(HttpClient);
  private readonly allowedTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'image/avif',
    'image/gif',
  ];

  uploadImage(file: File): Observable<string> {
    if (!this.isValidImageType(file)) {
      throw new Error('Formato de imagen no permitido.');
    }

    return from(compressImage(file)).pipe(
      switchMap((compressedFile) => {
        const data = new FormData();
        data.append('file', compressedFile);
        data.append('upload_preset', environment.cloudinary.uploadPreset);

        return this.http
          .post<CloudinaryUploadResponse>(
            `https://api.cloudinary.com/v1_1/${environment.cloudinary.cloudName}/image/upload`,
            data,
          )
          .pipe(map((response) => response.secure_url));
      })
    );
  }

  uploadImages(files: File[]): Observable<string[]> {
    return from(compressImages(files)).pipe(
      switchMap((compressedFiles) =>
        forkJoin(
          compressedFiles.map((file) => {
            const data = new FormData();
            data.append('file', file);
            data.append('upload_preset', environment.cloudinary.uploadPreset);

            return this.http
              .post<CloudinaryUploadResponse>(
                `https://api.cloudinary.com/v1_1/${environment.cloudinary.cloudName}/image/upload`,
                data,
              )
              .pipe(map((response) => response.secure_url));
          })
        )
      )
    );
  }

  isValidImageType(file: File): boolean {
    if (!file || !file.type) return false;
    return file.type.startsWith('image/') || this.allowedTypes.includes(file.type.toLowerCase());
  }
}

