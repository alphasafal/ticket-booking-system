import QRCode from "qrcode";

// The QR payload is just the booking reference — enough for a gate scanner
// to look the booking up, and nothing that leaks booking details if scanned
// by the wrong person.
export function generateBookingQrCode(reference: string): Promise<string> {
  return QRCode.toDataURL(reference, { margin: 1, width: 240 });
}
