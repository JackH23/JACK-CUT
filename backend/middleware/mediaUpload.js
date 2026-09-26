const fs = require("fs");
const path = require("path");
const multer = require("multer");
const crypto = require("crypto");

const uploadDirectory = path.join(
  __dirname,
  "..",
  "uploads",
  "media",
);

if (!fs.existsSync(uploadDirectory)) {
  fs.mkdirSync(uploadDirectory, {
    recursive: true,
  });
}

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    callback(null, uploadDirectory);
  },

  filename: (_req, file, callback) => {
    const extension = path.extname(file.originalname);
    const uniqueName = `${Date.now()}-${crypto.randomUUID()}${extension}`;

    callback(null, uniqueName);
  },
});

const allowedMimeTypes = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

const fileFilter = (_req, file, callback) => {
  if (!allowedMimeTypes.includes(file.mimetype)) {
    return callback(
      new Error(`Unsupported file type: ${file.mimetype}`),
    );
  }

  callback(null, true);
};

const mediaUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500 MB per file
    files: 20,
  },
});

module.exports = mediaUpload;