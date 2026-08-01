import { Component, EventEmitter, Output, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { CloudinaryService } from '../../../core/services/cloudinary.service';
import { cloudinaryPreviewUrl } from '../../../core/utils/cloudinary-image.util';

@Component({
  selector: 'app-image-uploader',
  standalone: true,
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './image-uploader.html',
  styleUrl: './image-uploader.css',
})
export class ImageUploaderComponent {
  readonly previewImage = cloudinaryPreviewUrl;
  readonly images = input<string[]>([]);
  readonly maxImages = input(5);
  readonly uploading = signal(false);

  @Output() uploaded = new EventEmitter<string[]>();
  @Output() error = new EventEmitter<string>();

  constructor(private readonly cloudinaryService: CloudinaryService) {}

  onSelect(event: Event): void {
    const inputElement = event.target as HTMLInputElement;
    const remaining = Math.max(0, this.maxImages() - this.images().length);
    const files = Array.from(inputElement.files ?? []).slice(0, remaining);
    const invalid = files.find((file) => !this.cloudinaryService.isValidImageType(file));

    if (invalid) {
      this.error.emit('Solo se permiten archivos de imagen válidos (JPG, PNG, WEBP, HEIC, etc.).');
      inputElement.value = '';
      return;
    }

    if (!files.length) {
      return;
    }

    this.uploading.set(true);
    this.cloudinaryService.uploadImages(files).subscribe({
      next: (urls) => this.uploaded.emit([...this.images(), ...urls].slice(0, this.maxImages())),
      error: () => this.error.emit('No se pudieron subir las imágenes.'),
      complete: () => {
        this.uploading.set(false);
        inputElement.value = '';
      },
    });
  }

  removeImage(index: number): void {
    if (this.uploading()) return;
    const current = [...this.images()];
    current.splice(index, 1);
    this.uploaded.emit(current);
  }
}
