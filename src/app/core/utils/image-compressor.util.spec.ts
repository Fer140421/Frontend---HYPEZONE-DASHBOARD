import { compressImage, compressImages } from './image-compressor.util';

describe('ImageCompressorUtil', () => {
  it('should return original file if non-image file is provided', async () => {
    const textFile = new File(['hello world'], 'test.txt', { type: 'text/plain' });
    const result = await compressImage(textFile);
    expect(result).toBe(textFile);
  });

  it('should return original file for SVG images', async () => {
    const svgFile = new File(['<svg></svg>'], 'icon.svg', { type: 'image/svg+xml' });
    const result = await compressImage(svgFile);
    expect(result).toBe(svgFile);
  });

  it('should process multiple files with compressImages', async () => {
    const textFile1 = new File(['a'], 'a.txt', { type: 'text/plain' });
    const textFile2 = new File(['b'], 'b.txt', { type: 'text/plain' });
    const results = await compressImages([textFile1, textFile2]);
    expect(results.length).toBe(2);
    expect(results[0]).toBe(textFile1);
    expect(results[1]).toBe(textFile2);
  });
});
