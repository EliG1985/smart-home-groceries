import { Router } from 'express';
import { supabase } from '../utils/supabaseClient';
import {
  buildInviteUrls,
  getAndroidAppPackage,
  getAndroidShaFingerprints,
  getIosAssociatedAppIds,
  renderInviteLandingPage,
} from '../utils/inviteLinks';

type InviteRow = {
  token: string;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  expires_at: string;
};

const router = Router();

const tokenIsExpired = (iso: string): boolean => {
  const expiry = Date.parse(iso);
  return Number.isFinite(expiry) && expiry < Date.now();
};

router.get('/.well-known/assetlinks.json', (_req, res) => {
  res.json([
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: getAndroidAppPackage(),
        sha256_cert_fingerprints: getAndroidShaFingerprints(),
      },
    },
  ]);
});

router.get('/.well-known/apple-app-site-association', (_req, res) => {
  res.type('application/json').send({
    applinks: {
      apps: [],
      details: getIosAssociatedAppIds().map((appId) => ({
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

  const { data, error } = await supabase
    .from('family_invites')
    .select('token,status,expires_at')
    .eq('token', token)
    .maybeSingle();

  if (error) {
    res.status(500).send('Unable to load invite.');
    return;
  }

  if (!data) {
    res.status(404).send(renderInviteLandingPage(token, 'not found'));
    return;
  }

  const invite = data as InviteRow;
  const status = invite.status === 'pending' && tokenIsExpired(invite.expires_at)
    ? 'expired'
    : invite.status;

  res.type('html').send(renderInviteLandingPage(token, status));
});

router.get('/invite/:token/open', (req, res) => {
  const token = String(req.params.token ?? '').trim();
  const { appInviteUrl } = buildInviteUrls(token);
  res.redirect(appInviteUrl);
});

export default router;