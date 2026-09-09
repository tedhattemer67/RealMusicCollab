// Shared multer config for every audio-upload route (single-take upload,
// mix upload, batch upload). memoryStorage everywhere, same as before — the
// buffer still goes through storage.writeFile() to land on whichever
// adapter is configured. What's new here is the limits/fileFilter: without
// them, an unauthenticated-adjacent* upload endpoint had no cap on file
// size or count, so a single request could buffer an unbounded amount of
// data in memory. (*routes are requireAuth-gated, but any logged-in member
// could still exhaust server memory by accident or on purpose.)
const multer = require('multer');

// Generous headroom for long, high-resolution multitrack WAV stems (a
// 10-minute 24-bit/96kHz stereo take is well under this), while still
// bounding a single request's memory footprint.
const MAX_FILE_BYTES = 300 * 1024 * 1024;
// Only the batch-upload route sends more than one file per request.
const MAX_FILES_PER_REQUEST = 50;

// Every upload form in the client already restricts to .wav (see
// AddTrackForm/BatchUploadForm/MixPanel/TrackRow) — this just enforces the
// same rule server-side instead of trusting the client.
function wavFileFilter(req, file, cb) {
  const okMimetype = ['audio/wav', 'audio/x-wav', 'audio/wave'].includes(file.mimetype);
  const okExtension = file.originalname.toLowerCase().endsWith('.wav');
  if (!okMimetype && !okExtension) {
    return cb(new Error('UNSUPPORTED_FILE_TYPE'));
  }
  cb(null, true);
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES_PER_REQUEST },
  fileFilter: wavFileFilter,
});

module.exports = { upload, MAX_FILE_BYTES, MAX_FILES_PER_REQUEST };
