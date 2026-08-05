import 'server-only'
import QRCode from 'qrcode'

// Matches the hardcoded origin already used elsewhere in this codebase (LMS's
// orders/qr.ts, staff-invite emails) — no env-based base URL exists yet.
const APP_ORIGIN = 'https://www.cyberussell.com'

// Uses the /tms short-URL prefix (see next.config.ts's permanent redirect to
// /territory-management-system/:path*) instead of the full product path — shorter for both the
// QR code itself and the plain-text link shown underneath it.
export function getAssignmentBatchUrl(accessToken: string): string {
  return `${APP_ORIGIN}/tms/assignment/${accessToken}`
}

// Scanning this with an ordinary phone camera opens the batch's public partnership list
// directly — no in-app scanner needed, no publisher account required.
// darkColor/lightColor let the caller distinguish an overflow batch's QR from a normal
// assignment's at a glance — see group-leader/dashboard/page.tsx, which fully inverts an
// overflow batch's QR (white on black) rather than just recoloring the dark modules, since
// that reads as visually distinct faster than a navy-on-white variant did.
export async function getAssignmentBatchQrDataUrl(accessToken: string, darkColor = '#000000', lightColor = '#FFFFFF'): Promise<string> {
  return QRCode.toDataURL(getAssignmentBatchUrl(accessToken), {
    margin: 1,
    width: 480,
    color: { dark: darkColor, light: lightColor },
  })
}
