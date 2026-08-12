// Parses Logic Pro X-style export filenames like:
//   KickDrum-NewJerrySong-01-001.wav
// into a candidate track name ("KickDrum"), by stripping the trailing
// Track Number and Increment segments (always numeric, easy to detect),
// then stripping the Project Name segment — which isn't numeric, so it
// can't be detected from one filename alone. Instead it's determined
// empirically from the whole batch: if every file's remainder ends in the
// same segment, that's the shared project name, and it gets stripped too.
// If the batch doesn't cleanly agree on a shared trailing segment, this
// falls back to a more conservative parse and leaves it for the human
// reviewing the batch to fix — never a silent wrong guess.

function stripExtension(filename) {
  return filename.replace(/\.[^/.]+$/, '');
}

function parseBatchFilenames(filenames) {
  const parsed = filenames.map((filename) => {
    const base = stripExtension(filename);
    const parts = base.split('-');

    if (parts.length >= 3) {
      const last2 = parts.slice(-2);
      if (last2.every((p) => /^\d+$/.test(p))) {
        return { filename, remainder: parts.slice(0, -2) };
      }
    }
    // Couldn't confidently identify trailing Track Number/Increment —
    // treat the whole base name as the candidate remainder.
    return { filename, remainder: parts };
  });

  const eligible = parsed.filter((p) => p.remainder.length > 1);
  const lastSegments = eligible.map((p) => p.remainder[p.remainder.length - 1]);
  const allShareSameLastSegment =
    eligible.length === parsed.length &&
    lastSegments.length > 0 &&
    lastSegments.every((s) => s === lastSegments[0]);

  return parsed.map((p) => {
    const remainder = allShareSameLastSegment ? p.remainder.slice(0, -1) : p.remainder;
    const finalParts = remainder.length ? remainder : p.remainder;
    return { filename: p.filename, candidateName: finalParts.join('-') };
  });
}

module.exports = { parseBatchFilenames };
