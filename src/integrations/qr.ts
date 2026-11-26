import QRCode from 'qrcode';

export const qrPng = (data: string) => QRCode.toBuffer(data, { margin: 1, width: 512, errorCorrectionLevel: 'M' });
