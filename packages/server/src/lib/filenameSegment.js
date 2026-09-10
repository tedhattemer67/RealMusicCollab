// Sanitizes a free-text field (song title, track name, project name) for use
// as a single path SEGMENT in a Content-Disposition filename or ZIP entry
// name — strip slashes/backslashes so a crafted name can't inject an extra
// path level, strip control characters and the quote character that would
// break filename="...", and collapse a segment that's now just dots so it
// can't act as a zip-slip "../" traversal once joined with the "/"s the
// caller controls itself.
function sanitizeExportSegment(segment) {
  const cleaned = String(segment)
    .replace(/[/\\]/g, '_')
    .replace(/[\x00-\x1f\x7f"]/g, '')
    .trim();
  return /^\.*$/.test(cleaned) || cleaned === '' ? 'untitled' : cleaned;
}

module.exports = { sanitizeExportSegment };
