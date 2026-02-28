import HandleForm from '@/components/HandleForm'

export default function Home() {
  return (
    <main className="h-screen flex flex-col items-center justify-center px-6">
      <div className="mb-10 text-center">
        <h1 className="text-amber-pub text-2xl tracking-[0.3em] uppercase mb-2">
          86ed
        </h1>
        <p className="text-dim text-xs leading-relaxed max-w-xs">
          real-time only. no logs. no history.<br />
          if you weren&apos;t here, you missed it.
        </p>
      </div>
      <HandleForm />
    </main>
  )
}
