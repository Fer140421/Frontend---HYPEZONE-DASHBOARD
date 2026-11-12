import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CloudinaryService } from './cloudinary.service';

describe('CloudinaryService', () => {
  let service: CloudinaryService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(CloudinaryService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('sube una foto a la vez y conserva las ya completadas si otra falla', async () => {
    const files = [
      new File(['<svg/>'], 'primera.svg', { type: 'image/svg+xml' }),
      new File(['<svg/>'], 'segunda.svg', { type: 'image/svg+xml' }),
    ];
    const received: string[][] = [];
    let failure = '';
    service.uploadImages(files).subscribe({
      next: (urls) => received.push(urls),
      error: (error: Error) => { failure = error.message; },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    const first = http.expectOne((request) => request.url.endsWith('/image/upload'));
    first.flush({ secure_url: 'https://example.com/primera.svg' });
    expect(received).toEqual([['https://example.com/primera.svg']]);

    await new Promise((resolve) => setTimeout(resolve, 0));
    const second = http.expectOne((request) => request.url.endsWith('/image/upload'));
    second.flush({ error: { message: 'File size too large' } }, { status: 400, statusText: 'Bad Request' });
    expect(received).toEqual([['https://example.com/primera.svg']]);
    expect(failure).toContain('segunda.svg');
    expect(failure).toContain('File size too large');
  });
});
