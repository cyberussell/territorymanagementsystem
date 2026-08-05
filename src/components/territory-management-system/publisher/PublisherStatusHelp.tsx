import Card from '@/components/territory-management-system/dashboard/Card'

// Status labels stay in English (matching the "Status" dropdown in PublisherVisitLogForm) —
// only the explanations are in Tagalog, per Russell's request. Content is presentational copy
// specific to this help widget, kept local rather than folded into records/schema.ts. Rendered
// as a peer tab alongside Territory Map/Live Map/Share To in PublisherWorkspaceApp's Home
// toggle (not a separate collapsible card) — the tab switcher itself is the show/hide control.
const STATUS_HELP: { status: string; description: string }[] = [
  { status: 'Not At Home', description: 'Walang tao sa bahay. Ito ang status ng kausap kapag walang aktwal na nakausap.' },
  {
    status: 'Visited Again',
    description:
      'Nakausap mo ulit sila as return visit. (Ito rin ang gagamitin kapag pwede nang bisitahin ulit ang isang naka-Do Not Call na record at gusto nilang makipag-usap na muli.)',
  },
  {
    status: 'Potential BS',
    description:
      'Nagpakita sila ng kahit kauting interes sa Bibliya, pero wala pang regular na pag-aaral ang napasimulan. Sa susunod na pagbisita, maaari mo ng piliin ang Started Bible Study o No Positive Response.',
  },
  {
    status: 'Started Bible Study',
    description:
      'Kakasimula lang ng unang regular na pag-aaral gamit ang Bibliya o anumang aklat na ginagamit sa pag-aaral. Sa susunod na pagbisita, magiging Progressive BS (kung tuloy-tuloy), Discontinued (kung tumigil sa pag-aaral), o No Positive Response ang status.',
  },
  {
    status: 'Progressive BS',
    description:
      'Sumusulong ang Bible Study. Huwag palitan ng iyong pangalan ang pangalan ng nagko-conduct ng Bible Study malibang pormal na inilipat ito sa iyo. Sa susunod na pagbisita, magiging Progressive BS pa rin (kung tuloy-tuloy), Discontinued BS (kung tumigil sa pag-aaral), o No Positive Response ang status.',
  },
  {
    status: 'No Positive Response',
    description: 'Walang positibong pagtugon sa kasalukuyan pero hindi naman Do Not Call.',
  },
  {
    status: 'Discontinued BS',
    description:
      'May regular nang pag-aaral (Started Bible Study o Progressive BS) pero tumigil na. Iba ito sa No Positive Response, na para sa records na hindi pa naman talaga nagsimula ng regular na pag-aaral.',
  },
  {
    status: 'Do Not Call',
    description:
      'Hiniling ng individual na huwag na silang bisitahin. Ini-lock ng system ang record mula sa anumang pagbisita sa loob ng 6 na buwan. Pwedeng mag-add ng person sa kaparehong address kung may interesado sa address na iyon',
  },
  {
    status: 'Unlocated',
    description:
      'Hindi na sila nakatira doon. May sariling button ito (hindi bahagi ng Status dropdown) — hihilingin sa iyo na itama ang address/contact info o irekomenda ang record para tanggalin ng admin.',
  },
  {
    status: 'Busy',
    description: 'Abala o walang oras ang kausap ngayon, o anumang hindi sakop ng ibang status — kailangan ito ng notes.',
  },
]

export default function PublisherStatusHelp() {
  return (
    <Card className="space-y-3 p-4">
      {STATUS_HELP.map(({ status, description }) => (
        <div key={status}>
          <p className="text-sm font-semibold text-[#0B1B33]">{status}</p>
          <p className="mt-0.5 text-sm text-slate-600">{description}</p>
        </div>
      ))}
      <p className="border-t border-blue-50 pt-3 text-xs text-slate-500">
        Kung may mga katanungan, tanungin ang sinumang elder or Group Leader sa araw ng inyong paglabas. Wag i-screenshot ang anumang
        details dito o ipost ito sa anumang social media.
      </p>
    </Card>
  )
}
