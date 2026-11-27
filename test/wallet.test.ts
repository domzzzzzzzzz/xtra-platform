import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { config } from '../src/config.js';
import forge from 'node-forge';
import { appleCreds, cairoIso, googleClass, issuerContact, applePass, applePkpass, appleWalletReady, googleObject, googleWalletUrl, type PassInfo } from '../src/integrations/wallet.js';
import { renderEmail } from '../src/integrations/email-html.js';
import { bookingTimes } from '../src/modules/passes.js';
import { fakeAppleCerts } from './helpers.js';

const info: PassInfo = {
  id: '6f1b6a3e-1b52-4a37-9d7e-0f7c8d0c1a11', qrToken: 'TOKEN_abc123xyz', kind: 'ticket', groupId: '0b7e9a7a-3c2a-4e7e-9a55-7d5a0f2c9b10',
  venueId: '1c2d3e4f-1b52-4a37-9d7e-0f7c8d0c1a11',
  title: 'Afro Night', subtitle: 'Orchestra · Row C, Seat 6', holder: 'Nour Hassan', startsAt: new Date('2026-12-05T20:00:00Z'), venueName: 'Lumen Rooftop',
  address: 'New Cairo', lat: 30.0271, lng: 31.4913, color: '#2e3192', code: 'ORD123', ticketType: 'Ticket', passUrl: 'http://test.local/t/TOKEN_abc123xyz',
  place: [{ key: 'section', label: 'Section', value: 'Orchestra' }, { key: 'row', label: 'Row', value: 'C' }, { key: 'seat', label: 'Seat', value: '6' }],
};

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
    expect(body.payload.eventTicketClasses[0]).toMatchObject({ issuerName: 'Lumen Rooftop', eventName: { defaultValue: { value: 'Afro Night' } }, locations: [{ latitude: 30.0271, longitude: 31.4913 }] });
    expect(body.payload.eventTicketObjects[0]).toMatchObject({ ticketHolderName: 'Nour Hassan', barcode: { type: 'QR_CODE', value: 'TOKEN_abc123xyz' },
      state: 'ACTIVE', seatInfo: { section: { defaultValue: { value: 'Orchestra' } }, row: { defaultValue: { value: 'C' } }, seat: { defaultValue: { value: '6' } } } });
    expect(googleObject({ ...info, voided: true }).state).toBe('INACTIVE');
    // A booking: the table goes in a text row (seatInfo is for seats).
    const booking = googleObject({ ...info, kind: 'booking', place: [{ key: 'area', label: 'Area', value: 'Terrace' }, { key: 'table', label: 'Table', value: 'T4' }] });
    expect(booking.seatInfo).toBeUndefined();
    expect(booking.textModulesData).toEqual(expect.arrayContaining([{ id: 'table', header: 'Table', body: 'T4' }]));
    Object.assign(config.googleWallet, { issuerId: '', serviceAccountEmail: '', privateKey: '' });
  });

  it('Google Wallet looks finished: Cairo times, card rows, XTRA logo fallback and "Powered by XTRA"', () => {
    expect(cairoIso(new Date('2026-12-05T20:00:00Z'))).toBe('2026-12-05T22:00:00+02:00');
    expect(cairoIso(new Date('2026-07-05T20:00:00Z'))).toBe('2026-07-05T23:00:00+03:00');
    const cls = googleClass(info);
    expect(cls.dateTime.start).toBe('2026-12-05T22:00:00+02:00');
    expect(cls.logo.sourceUri.uri).toMatch(/\/web\/brand\/xtra-wallet-logo\.png$/);
    expect(googleClass({ ...info, hasLogo: true }).logo.sourceUri.uri).toContain('/api/public/wallet/logo/');
    expect(googleClass({ ...info, kind: 'booking', hasHero: true }).heroImage?.sourceUri.uri).toContain('/api/public/wallet/venue/');
    const rows = cls.classTemplateInfo.cardTemplateOverride.cardRowTemplateInfos;
    expect(rows[1].threeItems.startItem.firstValue.fields.map((f) => f.fieldPath)).toEqual(["object.textModulesData['section']", "object.textModulesData['area']"]);
    const obj = googleObject(info);
    const ids = obj.textModulesData.map((m) => m.id);
    // Every id the card reads exists on the object or is simply left out.
    for (const r of rows) for (const it of Object.values(r.threeItems)) for (const f of it.firstValue.fields) {
      const id = f.fieldPath.match(/'(\w+)'/)![1];
      if (['date', 'time', 'type', 'section', 'row', 'seat'].includes(id)) expect(ids).toContain(id);
    }
    expect(obj.imageModulesData[0].mainImage.sourceUri.uri).toMatch(/\/web\/brand\/wallet-powered\.png$/);
    expect(obj.linksModuleData.uris.map((u) => u.description)).toEqual(['Open my pass', 'Directions', 'Terms']);
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
    // Venue logo and event poster go in when given.
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');
    const branded = (await applePkpass(info, { logo: png, strip: png })).toString('latin1');
    expect(branded).toContain('strip.png');
    // Apple's terms: issuer name and contact details for questions and complaints.
    process.env.SUPPORT_EMAIL = 'help@xtratickets.com';
    expect(issuerContact()).toContain('Email: help@xtratickets.com');
    expect(googleObject(info).textModulesData).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'issuer', header: 'Issued by' })]));
    delete process.env.SUPPORT_EMAIL;
    Object.assign(config.appleWallet, { passTypeId: '', teamId: '', cert: '', key: '', wwdr: '' });
  });

  it('Apple Wallet: a .p12 from Keychain is enough (Pass Type ID and Team ID come from the certificate)', () => {
    const keys = forge.pki.rsa.generateKeyPair(1024);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey; cert.serialNumber = '01';
    cert.validity.notBefore = new Date(); cert.validity.notAfter = new Date(Date.now() + 864e5);
    const subject = [{ type: '0.9.2342.19200300.100.1.1', value: 'pass.com.xtratickets.hospitality' }, { name: 'commonName', value: 'Pass Type ID: pass.com.xtratickets.hospitality' }, { shortName: 'OU', value: 'TEAM123456' }];
    cert.setSubject(subject); cert.setIssuer(subject); cert.sign(keys.privateKey, forge.md.sha256.create());
    const p12 = forge.asn1.toDer(forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], 'secret', { algorithm: '3des' })).getBytes();
    Object.assign(config.appleWallet, { p12: forge.util.encode64(p12), p12Password: 'secret' });
    expect(appleCreds()).toMatchObject({ passTypeId: 'pass.com.xtratickets.hospitality', teamId: 'TEAM123456', cert: expect.stringContaining('BEGIN CERTIFICATE') });
    Object.assign(config.appleWallet, { p12Password: 'wrong' });
    expect(appleCreds()).toBeNull();
    Object.assign(config.appleWallet, { p12: '', p12Password: '' });
  });

  it('booking times: night date + slot, early hours fall on the next day', () => {
    expect(bookingTimes('2026-12-05', '22:00 to 23:30')).toEqual({ start: new Date('2026-12-05T20:00:00Z'), end: new Date('2026-12-05T21:30:00Z') });
    expect(bookingTimes('2026-12-05', '01:00').start).toEqual(new Date('2026-12-05T23:00:00Z'));
    expect(bookingTimes('2026-12-05', '').start).toEqual(new Date('2026-12-05T18:00:00Z'));
  });

  it('emails show wallet buttons under each QR', () => {
    const html = renderEmail({ venue: { name: 'Lumen' }, preheader: 'x', title: 'Your pass', qrs: [{ token: 'TOKEN_abc123xyz', caption: 'Nour', wallet: { apple: 'https://a/pk', google: 'https://g/save' } }] });
    expect(html).toContain('Add to Apple Wallet');
    expect(html).toContain('href="https://g/save"');
    expect(renderEmail({ venue: { name: 'Lumen' }, preheader: 'x', title: 'Your pass', qrs: [{ token: 'TOKEN_abc123xyz', caption: 'Nour' }] })).not.toContain('Wallet');
    // Every email ends with "Powered by" and the XTRA logo (an image, not text).
    expect(html).toMatch(/Powered by<\/td>[\s\S]*\/web\/brand\/xtra-gray\.png" alt="XTRA"/);
  });
});
