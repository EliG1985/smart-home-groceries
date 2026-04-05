"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderInviteLandingPage = exports.getIosAssociatedAppIds = exports.getAndroidShaFingerprints = exports.getAndroidAppPackage = exports.getInviteUniversalLinkHost = exports.buildInviteUrls = void 0;
const trimTrailingSlash = (value) => value.replace(/\/+$/, '');
const getEnv = (name) => process.env[name]?.trim() || '';
const DEFAULT_INVITE_BASE_URL = 'https://links.smarthomegroceries.app/invite';
const DEFAULT_APP_SCHEME = 'smarthomegroceries';
const DEFAULT_ANDROID_PACKAGE = 'com.anonymous.smarthomegroceriesmobile';
const getInviteBaseUrl = () => trimTrailingSlash(getEnv('INVITE_PUBLIC_BASE_URL') || DEFAULT_INVITE_BASE_URL);
const getAppScheme = () => getEnv('APP_SCHEME') || DEFAULT_APP_SCHEME;
const getAndroidPackageName = () => getEnv('ANDROID_APP_PACKAGE') || DEFAULT_ANDROID_PACKAGE;
const getAndroidStoreUrl = () => getEnv('ANDROID_STORE_URL')
    || `https://play.google.com/store/apps/details?id=${encodeURIComponent(getAndroidPackageName())}`;
const getIosStoreUrl = () => getEnv('IOS_STORE_URL') || 'https://apps.apple.com/app/id0000000000';
const buildInviteUrls = (token) => {
    const normalizedToken = encodeURIComponent(token);
    const publicInviteUrl = `${getInviteBaseUrl()}/${normalizedToken}`;
    const appInviteUrl = `${getAppScheme()}://invite/${normalizedToken}`;
    return {
        publicInviteUrl,
        appInviteUrl,
        androidStoreUrl: getAndroidStoreUrl(),
        iosStoreUrl: getIosStoreUrl(),
    };
};
exports.buildInviteUrls = buildInviteUrls;
const getInviteUniversalLinkHost = () => {
    try {
        return new URL(getInviteBaseUrl()).host;
    }
    catch {
        return 'links.smarthomegroceries.app';
    }
};
exports.getInviteUniversalLinkHost = getInviteUniversalLinkHost;
const getAndroidAppPackage = () => getAndroidPackageName();
exports.getAndroidAppPackage = getAndroidAppPackage;
const getAndroidShaFingerprints = () => (getEnv('ANDROID_APP_SHA256_CERT_FINGERPRINTS') || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
exports.getAndroidShaFingerprints = getAndroidShaFingerprints;
const getIosAssociatedAppIds = () => (getEnv('IOS_ASSOCIATED_APP_IDS') || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
exports.getIosAssociatedAppIds = getIosAssociatedAppIds;
const getStoreUrlForPlatform = (platform) => platform === 'ios' ? getIosStoreUrl() : getAndroidStoreUrl();
const renderInviteLandingPage = (token, inviteStatus) => {
    const { appInviteUrl, publicInviteUrl, androidStoreUrl, iosStoreUrl } = (0, exports.buildInviteUrls)(token);
    const safeStatus = inviteStatus.replace(/[^a-zA-Z0-9 _-]/g, '');
    const escapedAppUrl = appInviteUrl.replace(/'/g, '%27');
    const escapedFallbackUrl = publicInviteUrl.replace(/'/g, '%27');
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>SmartHome Groceries Invite</title>
  <style>
    body { margin: 0; font-family: Arial, sans-serif; background: linear-gradient(180deg, #f2f7f4 0%, #ffffff 100%); color: #142218; }
    .wrap { max-width: 560px; margin: 0 auto; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
    .card { width: 100%; background: #ffffff; border: 1px solid #dbe8df; border-radius: 24px; padding: 28px; box-shadow: 0 16px 48px rgba(20, 34, 24, 0.08); }
    h1 { margin: 0 0 12px; font-size: 32px; line-height: 1.1; }
    p { margin: 0 0 14px; font-size: 16px; line-height: 1.5; color: #355240; }
    .status { display: inline-block; margin-bottom: 16px; padding: 8px 12px; border-radius: 999px; background: #edf8f0; color: #236345; font-weight: 700; font-size: 12px; letter-spacing: 0.04em; text-transform: uppercase; }
    .buttons { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 20px; }
    a { text-decoration: none; }
    .primary, .secondary { display: inline-flex; align-items: center; justify-content: center; min-height: 48px; border-radius: 999px; padding: 0 18px; font-weight: 700; }
    .primary { background: #146c43; color: #ffffff; }
    .secondary { background: #f0f5f2; color: #183d28; border: 1px solid #c8d8cd; }
    .stores { margin-top: 16px; display: flex; gap: 10px; flex-wrap: wrap; }
    .stores a { color: #146c43; font-weight: 700; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="status">${safeStatus}</div>
      <h1>Open your family invite</h1>
      <p>If SmartHome Groceries is installed, this page will open the app and continue the invitation automatically.</p>
      <p>If it is not installed yet, use one of the store links below and reopen the same invitation after install.</p>
      <div class="buttons">
        <a class="primary" href="${appInviteUrl}">Open App</a>
        <a class="secondary" href="${publicInviteUrl}">Reload Invite Link</a>
      </div>
      <div class="stores">
        <a href="${androidStoreUrl}">Google Play</a>
        <a href="${iosStoreUrl}">App Store</a>
      </div>
    </div>
  </div>
  <script>
    (function() {
      var started = Date.now();
      var isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
      var fallback = isIos ? '${iosStoreUrl}' : '${androidStoreUrl}';
      window.location.href = '${escapedAppUrl}';
      setTimeout(function() {
        if (Date.now() - started < 2200) {
          window.location.href = fallback || '${escapedFallbackUrl}';
        }
      }, 1400);
    })();
  </script>
</body>
</html>`;
};
exports.renderInviteLandingPage = renderInviteLandingPage;
