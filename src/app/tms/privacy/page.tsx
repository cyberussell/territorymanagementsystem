import Link from 'next/link'

export const metadata = {
  title: 'Data Privacy & Confidentiality Notice — TMS',
}

export default function PrivacyNoticePage() {
  return (
    <div className="flex min-h-dvh flex-col items-center bg-[#C9D8EE] px-4 py-12">
      <div className="w-full max-w-2xl">
        <div className="mb-6">
          <Link href="/tms/login" className="text-sm text-[#2563EB] hover:underline">
            &larr; Back to login
          </Link>
        </div>

        <div className="rounded-2xl border border-gray-300 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_0_18px_-3px_rgba(148,163,184,0.6)] sm:p-8">
          <h1 className="text-xl font-bold text-[#0B1B33]">Data Privacy &amp; Confidentiality Notice</h1>

          <p className="mt-4 text-sm leading-relaxed text-slate-700">
            This Territory Management System (TMS) is provided solely for authorized congregation territory and ministry
            activities. Access is limited to appointed users.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-slate-700">
            By signing in and using this system, you agree to handle all personal information responsibly and only for its
            intended ministry purpose.
          </p>

          <h2 className="mt-6 text-sm font-semibold text-[#0B1B33]">When recording territory information</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-slate-700">
            <li>Record only information reasonably necessary for territory organization and courteous follow-up.</li>
            <li>Keep resident names optional unless a name is genuinely needed for the ministry purpose.</li>
            <li>
              Do not record a person&apos;s religion, ethnicity, health or medical information, political views, financial
              circumstances, or other unnecessary sensitive personal information.
            </li>
            <li>
              Keep visit notes brief and ministry-related. Do not record private family matters, personal judgments,
              gossip, derogatory descriptions, or information unrelated to a return visit.
            </li>
            <li>
              Respect Do Not Call requests. Information retained for this purpose must be limited to what is necessary to
              prevent an unwanted future visit.
            </li>
            <li>Do not copy, screenshot, download, print, share, or use resident information outside its authorized purpose unless specifically authorized.</li>
            <li>Do not share your account or allow an unauthorized person to access the system.</li>
          </ul>

          <p className="mt-6 text-sm leading-relaxed text-slate-700">
            Personal information stored in TMS is subject to access controls and retention measures and should be kept
            only for as long as reasonably necessary for its intended purpose.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-slate-700">
            If a resident requests access, correction, removal, or raises a privacy concern regarding information
            recorded in TMS, do not make promises on behalf of the organization. Refer the matter promptly to the
            congregation elders or designated person responsible for data privacy.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-slate-700">
            By continuing, you acknowledge your responsibility to protect the confidentiality and privacy of information
            entrusted to you through TMS.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-slate-700">
            Use of TMS must comply with the Philippine Data Privacy Act of 2012 (Republic Act No. 10173), its
            implementing rules and regulations, applicable issuances of the National Privacy Commission, and applicable
            organizational policies.
          </p>
        </div>

        <p className="mt-6 text-center">
          <Link href="/tms/login" className="text-sm text-[#2563EB] hover:underline">
            &larr; Back to login
          </Link>
        </p>
      </div>
    </div>
  )
}
