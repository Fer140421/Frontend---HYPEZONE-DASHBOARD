import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, concatMap, from, map, scan, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { compressImage } from '../utils/image-compressor.util';

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
          .pipe(
            map((response) => response.secure_url),
            catchError((error: unknown) => throwError(() => this.uploadError(file, compressedFile === file, error))),
          );
      })
    );
  }

  uploadImages(files: File[]): Observable<string[]> {
    return from(files).pipe(
      concatMap((file) => this.uploadImage(file)),
      scan((urls, url) => [...urls, url], [] as string[]),
    );
  }

  private uploadError(file: File, wasUncompressed: boolean, error: unknown): Error {
    const heic = /\.hei[cf]$/i.test(file.name) || /^image\/hei[cf]$/i.test(file.type);
    const compressionHint = wasUncompressed && heic
      ? ' El navegador no pudo comprimir este HEIC. Prueba tomarla en JPG a 12 MP.'
      : '';
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) {
        return new Error(`No se pudo conectar para subir ${file.name}. Revisa tu conexión e intenta otra vez.`);
      }
      const detail = error.error?.error?.message;
      if (typeof detail === 'string' && detail.trim()) {
        return new Error(`No se pudo subir ${file.name}: ${detail}.${compressionHint}`);
      }
      if (error.status === 413) {
        return new Error(`${file.name} supera el tamaño permitido para subir imágenes.${compressionHint}`);
      }
    }
    return new Error(`No se pudo subir ${file.name}. Intenta subirla por separado.${compressionHint}`);
  }

  isValidImageType(file: File): boolean {
    if (!file || !file.type) return false;
    return file.type.startsWith('image/') || this.allowedTypes.includes(file.type.toLowerCase());
  }
}

