import { LoginForm } from '@/components/auth/LoginForm'

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-stretch">
      {/* LEFT — brand statement (hidden on small) */}
      <aside className="hidden lg:flex flex-col justify-between flex-1 px-16 py-12 border-r border-line relative overflow-hidden">
        <header className="flex items-baseline gap-4">
          <span className="font-mono text-[10px] uppercase tracking-kicker text-ink-faint">
            § 00 · Sign-in
          </span>
          <span className="h-px flex-1 bg-line-hot self-center" />
        </header>

        <div className="my-auto">
          <p className="font-mono text-xxs uppercase tracking-kicker text-ember-deep mb-6">
            Old Forge Technologies
          </p>
          <h1
            className="font-serif italic text-[clamp(56px,8vw,108px)] leading-[0.95] text-ember m-0"
            style={{ fontVariationSettings: '"opsz" 144, "SOFT" 100, "wght" 380' }}
          >
            DocuVault.
          </h1>
          <div className="mt-6 flex items-center gap-4">
            <span className="block w-16 h-px bg-ember" />
            <span className="font-mono text-xs uppercase tracking-kicker text-ink-dim">
              IT documentation, instrumented
            </span>
          </div>

          <p
            className="mt-12 max-w-md font-serif italic text-lg text-ink-dim leading-snug"
            style={{ fontVariationSettings: '"opsz" 24, "SOFT" 50, "wght" 380' }}
          >
            “Every device, every credential, every line of inheritance —
            kept on the record so the work outlives the moment.”
          </p>
        </div>

        <footer className="grid grid-cols-3 gap-8 font-mono text-[10px] uppercase tracking-kicker text-ink-faint">
          <div>
            <div className="text-ink-dim mb-1">Established</div>
            <div className="tnum-mono text-ink">2025</div>
          </div>
          <div>
            <div className="text-ink-dim mb-1">Forge</div>
            <div className="text-ink">Suffolk · UK</div>
          </div>
          <div>
            <div className="text-ink-dim mb-1">Edition</div>
            <div className="tnum-mono text-ink">v 1.0</div>
          </div>
        </footer>
      </aside>

      {/* RIGHT — form panel */}
      <section className="flex-1 lg:flex-[0_0_460px] xl:flex-[0_0_520px] flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          {/* Mobile brand mark */}
          <div className="lg:hidden text-center mb-10">
            <p className="font-mono text-[10px] uppercase tracking-kicker text-ember-deep mb-3">
              Old Forge Technologies
            </p>
            <h1
              className="font-serif italic text-5xl text-ember m-0"
              style={{ fontVariationSettings: '"opsz" 144, "SOFT" 100, "wght" 380' }}
            >
              DocuVault.
            </h1>
          </div>

          <div className="modal-panel px-7 py-7">
            <div className="mb-6">
              <span className="kicker text-ink-faint">Identification</span>
              <h2
                className="mt-2 font-serif italic text-2xl text-ink m-0"
                style={{ fontVariationSettings: '"opsz" 144, "SOFT" 80, "wght" 400' }}
              >
                Sign in to continue.
              </h2>
            </div>
            <LoginForm />
          </div>

          <p className="mt-6 text-center font-mono text-[10px] uppercase tracking-kicker text-ink-faint">
            · Encrypted vault · session bound to operator ·
          </p>
        </div>
      </section>
    </div>
  )
}
