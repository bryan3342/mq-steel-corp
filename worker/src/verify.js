import { jwtVerify, createRemoteJWKSet } from 'jose';

export class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

// App Check audiences/issuers use the Firebase project NUMBER, not the project id.
const PROJECT_NUMBER = '900353658641';

// Firebase ID tokens: RS256, verified against Google's securetoken JWKS.
const idJwks = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));
// App Check tokens.
const acJwks = createRemoteJWKSet(new URL('https://firebaseappcheck.googleapis.com/v1/jwks'));

async function verifyIdToken(token, projectId) {
  const { payload } = await jwtVerify(token, idJwks, {
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
    algorithms: ['RS256'],
  });
  if (payload.email_verified !== true) throw new HttpError(403, 'email not verified');
  if (!payload.email) throw new HttpError(403, 'no email');
  return { email: String(payload.email).toLowerCase(), uid: payload.sub };
}

async function verifyAppCheck(token, projectId) {
  await jwtVerify(token, acJwks, {
    issuer: `https://firebaseappcheck.googleapis.com/${PROJECT_NUMBER}`,
    audience: [`projects/${PROJECT_NUMBER}`, `projects/${projectId}`],
    algorithms: ['RS256'],
  });
}

// Confirm the caller is an allowlisted admin via Firestore REST, forwarding their
// ID token + App Check token so the existing rules gate the read. No service account.
async function isAllowlisted(email, idToken, appCheckToken, projectId) {
  const u = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/admins/${encodeURIComponent(email)}`;
  const res = await fetch(u, {
    headers: { Authorization: `Bearer ${idToken}`, 'X-Firebase-AppCheck': appCheckToken },
  });
  return res.status === 200;
}

export async function verifyAdmin(req, env) {
  const auth = req.headers.get('Authorization') || '';
  const idToken = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const acToken = req.headers.get('X-Firebase-AppCheck') || '';
  if (!idToken) throw new HttpError(401, 'missing id token');
  if (!acToken) throw new HttpError(401, 'missing app check token');
  const projectId = env.FIREBASE_PROJECT_ID;
  await verifyAppCheck(acToken, projectId);
  const { email, uid } = await verifyIdToken(idToken, projectId);
  if (!(await isAllowlisted(email, idToken, acToken, projectId))) throw new HttpError(403, 'not an admin');
  return { email, uid };
}
