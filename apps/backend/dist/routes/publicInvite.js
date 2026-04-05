"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const supabaseClient_1 = require("../utils/supabaseClient");
const inviteLinks_1 = require("../utils/inviteLinks");
const router = (0, express_1.Router)();
const tokenIsExpired = (iso) => {
    const expiry = Date.parse(iso);
    return Number.isFinite(expiry) && expiry < Date.now();
};
router.get('/.well-known/assetlinks.json', (_req, res) => {
    res.json([
        {
            relation: ['delegate_permission/common.handle_all_urls'],
            target: {
                namespace: 'android_app',
                package_name: (0, inviteLinks_1.getAndroidAppPackage)(),
                sha256_cert_fingerprints: (0, inviteLinks_1.getAndroidShaFingerprints)(),
            },
        },
    ]);
});
router.get('/.well-known/apple-app-site-association', (_req, res) => {
    res.type('application/json').send({
        applinks: {
            apps: [],
            details: (0, inviteLinks_1.getIosAssociatedAppIds)().map((appId) => ({
                appID: appId,
                paths: ['/invite/*'],
            })),
        },
    });
});
router.get('/invite/:token', async (req, res) => {
    const token = String(req.params.token ?? '').trim();
    if (!token) {
        res.status(400).send('Missing invite token.');
        return;
    }
    const { data, error } = await supabaseClient_1.supabase
        .from('family_invites')
        .select('token,status,expires_at')
        .eq('token', token)
        .maybeSingle();
    if (error) {
        res.status(500).send('Unable to load invite.');
        return;
    }
    if (!data) {
        res.status(404).send((0, inviteLinks_1.renderInviteLandingPage)(token, 'not found'));
        return;
    }
    const invite = data;
    const status = invite.status === 'pending' && tokenIsExpired(invite.expires_at)
        ? 'expired'
        : invite.status;
    res.type('html').send((0, inviteLinks_1.renderInviteLandingPage)(token, status));
});
router.get('/invite/:token/open', (req, res) => {
    const token = String(req.params.token ?? '').trim();
    const { appInviteUrl } = (0, inviteLinks_1.buildInviteUrls)(token);
    res.redirect(appInviteUrl);
});
exports.default = router;
