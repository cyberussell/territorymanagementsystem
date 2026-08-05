// Publishers hit this route by scanning a QR code, often on cellular in the field — exactly
// where a blank white page during the initial fetch is most likely to read as "broken link."
export default function Loading() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#C9D8EE]">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#38BDF8] border-t-transparent" />
    </div>
  )
}
