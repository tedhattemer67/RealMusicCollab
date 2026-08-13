module.exports = {
  SESSION_COOKIE_NAME: 'session_id',
  SESSION_DURATION_MS: 30 * 24 * 60 * 60 * 1000, // 30 days
  // A genuinely cross-origin deployment (frontend and backend on different
  // real URLs) needs secure + sameSite:'none' for the cookie to be sent at
  // all. Local dev needs the opposite — sameSite:'lax' and no secure flag,
  // since local dev is plain HTTP and 'none' cookies require HTTPS.
  getSessionCookieOptions() {
    const isProduction = process.env.NODE_ENV === 'production';
    return {
      httpOnly: true,
      sameSite: isProduction ? 'none' : 'lax',
      secure: isProduction,
      maxAge: 30 * 24 * 60 * 60 * 1000,
    };
  },
};
