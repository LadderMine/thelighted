// backend/src/modules/cloudinary/cloudinary.service.ts
import { Injectable, BadRequestException } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';

export interface CloudinaryUploadResult {
  url: string;
  publicId: string;
  width: number;
  height: number;
  format: string;
  resourceType: string;
}

@Injectable()
export class CloudinaryService {
  async uploadImage(
    file: Express.Multer.File,
    restaurantId: string,
    subfolder: string = 'menu-items',
  ): Promise<CloudinaryUploadResult> {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        'Invalid file type. Only JPEG, PNG, and WebP images are allowed',
      );
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      throw new BadRequestException('File size must be less than 5MB');
    }

    // Create restaurant-specific folder path
    const folderPath = `restaurants/${restaurantId}/${subfolder}`;

    try {
      return await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: folderPath,
            resource_type: 'image',
            transformation: [
              { width: 1200, height: 1200, crop: 'limit' }, // Max dimensions
              { quality: 'auto' }, // Auto quality optimization
              { fetch_format: 'auto' }, // Auto format selection
            ],
          },
          (error, result) => {
            if (error) {
              reject(
                new BadRequestException(`Upload failed: ${error.message}`),
              );
            } else {
              resolve({
                url: result.secure_url,
                publicId: result.public_id,
                width: result.width,
                height: result.height,
                format: result.format,
                resourceType: result.resource_type,
              });
            }
          },
        );

        // Convert buffer to stream and pipe to Cloudinary
        const stream = Readable.from(file.buffer);
        stream.pipe(uploadStream);
      });
    } catch (error) {
      throw new BadRequestException(`Failed to upload image: ${error.message}`);
    }
  }

  async deleteImage(publicId: string): Promise<void> {
    try {
      await cloudinary.uploader.destroy(publicId);
    } catch (error) {
      console.error(`Failed to delete image ${publicId}:`, error);
      // Don't throw error, just log it
    }
  }

  /**
   * List all images for a restaurant
   */
  async listRestaurantImages(
    restaurantId: string,
    subfolder: string = 'menu-items',
  ): Promise<any[]> {
    try {
      const folderPath = `restaurants/${restaurantId}/${subfolder}`;
      const result = await cloudinary.api.resources({
        type: 'upload',
        prefix: folderPath,
        max_results: 500,
      });

      return result.resources;
    } catch (error) {
      console.error('Failed to list images:', error);
      return [];
    }
  }

  /**
   * Delete all images for a restaurant (use with caution!)
   */
  async deleteRestaurantFolder(restaurantId: string): Promise<void> {
    try {
      const folderPath = `restaurants/${restaurantId}`;
      await cloudinary.api.delete_resources_by_prefix(folderPath);
      await cloudinary.api.delete_folder(folderPath);
    } catch (error) {
      console.error('Failed to delete folder:', error);
    }
  }
}
