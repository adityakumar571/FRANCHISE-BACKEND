import cloudinary from '../config/cloudinary.js';
import { Readable } from 'stream';
import { asyncHandler } from '../utils/asyncHandler.js';
import { apiResponse } from '../utils/apiResponse.js';

const uploadImage = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json(new apiResponse(400, null, "No file uploaded"));
  }

  try {
    const uploadStream = cloudinary.uploader.upload_stream(
      { resource_type: 'auto' },
      (error, result) => {
        if (error) {
          console.error("Cloudinary upload error:", error);
          return res.status(500).json(new apiResponse(500, null, `Cloudinary Error: ${error.message}`));
        }
        // imageUrl — original key used by legacy code
        // url — key expected by StaffForm (res?.data?.data?.imageUrl)
        return res.status(200).json(
          new apiResponse(200, { imageUrl: result.secure_url }, "File uploaded successfully")
        );
      }
    );

    Readable.from(req.file.buffer).pipe(uploadStream);
  } catch (err) {
    console.error("Error during upload:", err);
    res.status(500).json({ error: err.message });
  }
});

export { uploadImage };
