import crypto from 'node:crypto';
import forge from 'node-forge';
import { describe, expect, it } from 'vitest';
import { config } from '../src/config.js';
import { applePass, applePkpass, appleWalletReady, googleWalletUrl, type PassInfo } from '../src/integrations/wallet.js';

const info: PassInfo = {
  id: '6f1b6a3e-1b52-4a37-9d7e-0f7c8d0c1a11', qrToken: 'TOKEN_abc123xyz', kind: 'ticket', groupId: '0b7e9a7a-3c2a-4e7e-9a55-7d5a0f2c9b10',
  title: 'Afro Night', subtitle: 'VIP · T4', holder: 'Nour Hassan', startsAt: new Date('2026-12-05T20:00:00Z'), venueName: 'Lumen Rooftop',
  address: 'New Cairo', lat: 30.0271, lng: 31.4913, color: '#2e3192',
};

/** A throwaway CA + signer, standing in for Apple's WWDR and a Pass Type ID certificate. */
function fakeAppleCerts() {
  const mk = (cn: string, issuer?: { cert: forge.pki.Certificate; key: forge.pki.rsa.PrivateKey }) => {
    const keys = forge.pki.rsa.generateKeyPair(1024);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey; cert.serialNumber = String(Date.now());
    cert.validity.notBefore = new Date(Date.now() - 864e5); cert.validity.notAfter = new Date(Date.now() + 864e5 * 365);
    cert.setSubject([{ name: 'commonName', value: cn }]);
    cert.setIssuer(issuer ? issuer.cert.subject.attributes : [{ name: 'commonName', value: cn }]);
    cert.sign(issuer ? issuer.key : keys.privateKey, forge.md.sha256.create());
    return { cert, key: keys.privateKey };
  };
  const ca = mk('Fake WWDR'), signer = mk('Pass Type ID: pass.eg.xtra.test', ca);
  return { wwdr: forge.pki.certificateToPem(ca.cert), cert: forge.pki.certificateToPem(signer.cert), key: forge.pki.privateKeyToPem(signer.key) };
}

describe('Wallet passes', () => {
  it('Google Wallet: no link until set up, then a signed JWT with the class and the ticket', () => {
    expect(googleWalletUrl(info)).toBeNull();
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    Object.assign(config.googleWallet, { issuerId: '3388000000012345678', serviceAccountEmail: 'wallet@xtra.iam.gserviceaccount.com', privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() });
    const url = googleWalletUrl(info)!;
    expect(url.startsWith('https://pay.google.com/gp/v/save/')).toBe(true);
    const [h, b, s] = url.split('/').pop()!.split('.');
    expect(crypto.createVerify('RSA-SHA256').update(`${h}.${b}`).verify(publicKey, Buffer.from(s, 'base64url'))).toBe(true);
    const body = JSON.parse(Buffer.from(b, 'base64url').toString());
    expect(body.payload.eventTicketClasses[0]).toMatchObject({ eventName: { defaultValue: { value: 'Afro Night' } }, locations: [{ latitude: 30.0271, longitude: 31.4913 }] });
    expect(body.payload.eventTicketObjects[0]).toMatchObject({ ticketHolderName: 'Nour Hassan', barcode: { type: 'QR_CODE', value: 'TOKEN_abc123xyz' } });
    Object.assign(config.googleWallet, { issuerId: '', serviceAccountEmail: '', privateKey: '' });
  });

  it('Apple Wallet: off until certificates exist, then a signed .pkpass', async () => {
    expect(applePass(info)).toEqual({ configured: false });
    await expect(applePkpass(info)).rejects.toThrow(/not configured/);
    Object.assign(config.appleWallet, { passTypeId: 'pass.eg.xtra.test', teamId: 'ABCDE12345', ...fakeAppleCerts() });
    expect(appleWalletReady()).toBe(true);
    expect(applePass(info)).toMatchObject({ configured: true, url: expect.stringContaining('/api/public/pass/TOKEN_abc123xyz/apple.pkpass') });
    const buf = await applePkpass(info);
    expect(buf.subarray(0, 2).toString()).toBe('PK');
    const names = buf.toString('latin1');
    for (const f of ['pass.json', 'manifest.json', 'signature', 'icon.png', 'logo.png']) expect(names).toContain(f);
    Object.assign(config.appleWallet, { passTypeId: '', teamId: '', cert: '', key: '', wwdr: '' });
  });
});
