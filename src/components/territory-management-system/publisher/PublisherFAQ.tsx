import Card from '@/components/territory-management-system/dashboard/Card'

// General publisher FAQ, in English — separate from PublisherStatusHelp, which covers what
// each visit Status means. Rendered as its own peer tab (alongside Territory Map/Live
// Map/Share/Status) in PublisherWorkspaceApp's Home toggle.
const FAQ: { question: string; answer: string }[] = [
  { question: 'How do I start?', answer: 'Enter your name above to claim your assignment.' },
  {
    question: 'What if I lose internet or signal?',
    answer: "The app still works offline. It will sync automatically once you're back online.",
  },
  {
    question: "What if I can't finish everyone today?",
    answer: 'Use "End My Ministry Early." Unfinished records stay assigned for next time.',
  },
  {
    question: 'How do I add another person at the same address?',
    answer: 'Open that record and tap "Add Another Person Here."',
  },
  {
    question: 'What if someone moved or the address is wrong?',
    answer: 'Mark the record "Unlocated." You\'ll be asked to fix the address or recommend it for removal.',
  },
  {
    question: "How do I know I'm done?",
    answer: 'You\'ll see a "Sync & Finish" screen, then a thank-you screen once everything is submitted.',
  },
  {
    question: 'Who do I ask if I have questions?',
    answer: 'Ask any elder or your Group Leader on the day you go out.',
  },
  {
    question: 'Can I change my mind before I start?',
    answer:
      'Yes. Tapping in doesn\'t claim it — saving your name does. Before that, you can release the assignment from the "Select your Partner" screen.',
  },
  { question: 'What is "Search Area" for?', answer: 'Territory you can search on your own, outside your assigned records.' },
  {
    question: "What if I'm just checking someone else's progress?",
    answer: "Opening another partner's link shows their assignment read-only — you can't log visits for them.",
  },
  {
    question: 'What if syncing keeps failing?',
    answer: 'Use "Copy for Admin" on the failed-sync screen and send it to your Group Leader.',
  },
  {
    question: 'Can I work with a partner on the same assignment?',
    answer: 'Yes — that\'s what "Ministry Partner" means. You and a partner share one assignment link.',
  },
  {
    question: 'Should I screenshot or share this app?',
    answer: "No — don't screenshot details or post them on social media.",
  },
  {
    question: 'Why is a record locked / grayed out?',
    answer: "It's marked Do Not Call. The system locks it from visits for 6 months.",
  },
  {
    question: 'Why do I see one card for multiple people at the same address?',
    answer: 'Households are grouped into one card. Tap it to see everyone there.',
  },
  {
    question: 'I logged a visit by mistake — can I fix it?',
    answer: "No, publishers can't undo a visit. Tell your Group Leader or Admin and they can correct it.",
  },
  {
    question: "What if I find an address that's not on my list?",
    answer: 'Add it as a new record. Your Admin will review and approve it before it counts.',
  },
  {
    question: 'Can I leave a note for Admin?',
    answer: "Yes, after finishing you'll get an optional screen to leave a note before syncing.",
  },
  {
    question: 'How long is visit history kept?',
    answer: "Each record's visit history is kept for 6 months, then automatically cleared.",
  },
  {
    question: "How long is a record's change history kept?",
    answer:
      'Changes made to a record — edits, corrections, moves, and removal recommendations — are kept for 1 year, then automatically cleared.',
  },
]

export default function PublisherFAQ() {
  return (
    <Card className="space-y-3 p-4">
      {FAQ.map(({ question, answer }) => (
        <div key={question}>
          <p className="text-sm font-semibold text-[#0B1B33]">{question}</p>
          <p className="mt-0.5 text-sm text-slate-600">{answer}</p>
        </div>
      ))}
    </Card>
  )
}
