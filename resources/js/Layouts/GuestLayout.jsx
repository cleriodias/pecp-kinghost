import ApplicationLogo from '@/Components/ApplicationLogo';
import { Link } from '@inertiajs/react';

export default function GuestLayout({ children }) {
    return (
        <div
            className="relative min-h-screen overflow-hidden bg-[#f7efe5] text-slate-900"
            style={{
                fontFamily: "'Space Grotesk', sans-serif",
            }}
        >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.9),rgba(255,255,255,0.55)_40%,rgba(247,239,229,0.95)_78%)]" />
            <div className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-amber-200/40 blur-[120px]" />
            <div className="pointer-events-none absolute -bottom-24 right-0 h-80 w-80 rounded-full bg-orange-200/35 blur-[140px]" />

            <div className="relative flex min-h-screen items-center justify-center px-6 py-10">
                <div className="w-full max-w-[680px] rounded-[30px] border border-white/70 bg-white/90 px-8 py-8 shadow-[0_24px_70px_rgba(56,38,18,0.18)] backdrop-blur sm:px-12 sm:py-10">
                    <div className="mb-8 flex justify-center">
                        <Link href="/" className="inline-flex items-center justify-center">
                            <ApplicationLogo className="h-14 w-14 fill-current text-gray-500" />
                        </Link>
                    </div>

                    {children}
                </div>
            </div>
        </div>
    );
}
