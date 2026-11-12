import { Component, EventEmitter, Output, input, signal } from '@angular/core';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDragHandle,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { CloudinaryService } from '../../../core/services/cloudinary.service';
import { cloudinaryPreviewUrl } from '../../../core/utils/cloudinary-image.util';

@Component({
  selector: 'app-image-uploader',
  standalone: true,
  imports: [CdkDrag, CdkDragHandle, CdkDropList, MatButtonModule, MatIconModule],
  templateUrl: './image-uploader.html',
  styleUrl: './image-uploader.css',
})
export class ImageUploaderComponent {
  readonly previewImage = cloudinaryPreviewUrl;
  readonly images = input<string[]>([]);
  readonly maxImages = input(5);
  readonly uploading = signal(false);
  readonly uploadedCount = signal(0);
  readonly totalCount = signal(0);
  readonly lastError = signal('');

  @Output() uploaded = new EventEmitter<string[]>();
  @Output() error = new EventEmitter<string>();
  @Output() uploadingChange = new EventEmitter<boolean>();

  constructor(private readonly cloudinaryService: CloudinaryService) {}

  onSelect(event: Event): void {
    const inputElement = event.target as HTMLInputElement;
    const remaining = Math.max(0, this.maxImages() - this.images().length);
    const files = Array.from(inputElement.files ?? []).slice(0, remaining);
    const invalid = files.find((file) => !this.cloudinaryService.isValidImageType(file));

    if (invalid) {
      const message = 'Solo se permiten archivos de imagen válidos (JPG, PNG, WEBP, HEIC, etc.).';
      this.lastError.set(message);
      this.error.emit(message);
      inputElement.value = '';
      return;
    }

    if (!files.length) {
      return;
    }

    const existingImages = [...this.images()];
    this.lastError.set('');
    this.uploadedCount.set(0);
    this.totalCount.set(files.length);
    this.uploading.set(true);
    this.uploadingChange.emit(true);
    this.cloudinaryService.uploadImages(files).subscribe({
      next: (urls) => {
        this.uploadedCount.set(urls.length);
        this.uploaded.emit([...existingImages, ...urls].slice(0, this.maxImages()));
      },
      error: (error: unknown) => {
        this.uploading.set(false);
        this.uploadingChange.emit(false);
        inputElement.value = '';
        const cause = error instanceof Error ? error.message : 'No se pudieron subir las imágenes.';
        const message = this.uploadedCount() > 0
          ? `${cause} Las fotos anteriores quedaron cargadas; selecciona de nuevo las pendientes.`
          : cause;
        this.lastError.set(message);
        this.error.emit(message);
      },
      complete: () => {
        this.uploading.set(false);
        this.uploadingChange.emit(false);
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

  reorderImages(event: CdkDragDrop<string[]>): void {
    if (this.uploading() || event.previousIndex === event.currentIndex) {
      return;
    }

    const current = [...this.images()];
    moveItemInArray(current, event.previousIndex, event.currentIndex);
    this.uploaded.emit(current);
  }
}
