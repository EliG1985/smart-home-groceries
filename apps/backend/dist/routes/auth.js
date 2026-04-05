"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const router = (0, express_1.Router)();
/**
 * Password reset callback handler
 * Extracts recovery token from Supabase email link and redirects to mobile app
 * GET /auth/callback?type=recovery&access_token=...&refresh_token=...
 */
router.get('/callback', (req, res) => {
    const { type, access_token, refresh_token, error, error_description } = req.query;
    if (error) {
        return res.status(400).send(`
      <!DOCTYPE html>
      <html>
      <head><title>Recovery Failed</title></head>
      <body>
        <h1>Password Recovery Failed</h1>
        <p>${error_description || error}</p>
        <p>Please try again or contact support.</p>
      </body>
      </html>
    `);
    }
    if (type === 'recovery' && access_token && refresh_token) {
        // Redirect to mobile app with tokens in deep link
        const deepLink = `smarthomegroceries://reset-password?access_token=${access_token}&refresh_token=${refresh_token}&type=recovery`;
        return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Password Recovery</title>
        <script>
          window.location.href = "${deepLink}";
          // Fallback for web
          setTimeout(() => {
            document.body.innerHTML = '<h1>Redirecting to app...</h1><p><a href="${deepLink}">Click here if not redirected</a></p>';
          }, 100);
        </script>
      </head>
      <body>
        <h1>Opening Password Recovery...</h1>
        <p><a href="${deepLink}">Click here if the app doesn't open</a></p>
      </body>
      </html>
    `);
    }
    return res.status(400).send(`
    <!DOCTYPE html>
    <html>
    <head><title>Invalid Recovery Link</title></head>
    <body>
      <h1>Invalid Recovery Link</h1>
      <p>This recovery link is invalid or has expired.</p>
    </body>
    </html>
  `);
});
exports.default = router;
