import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — TechnicalAI",
  description: "Privacy Policy for TechnicalAI. Learn how we collect, use, and protect your data.",
};

export default function PrivacyPage() {
  const effective = "March 14, 2026";
  return (
    <div className="min-h-screen bg-noise bg-grid text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-16">

        <Link href="/" className="text-xs text-muted-foreground hover:text-foreground mb-8 inline-block">
          ← Back to TechnicalAI
        </Link>

        <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mb-10">Effective date: {effective}</p>

        <div className="prose prose-invert prose-sm max-w-none flex flex-col gap-8 text-muted-foreground leading-relaxed">

          {/* 1 */}
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">1. Overview</h2>
            <p>
              TechnicalAI ("we", "our", "us") is committed to protecting your privacy. This Privacy Policy explains what data we collect, how we use it, and your rights regarding that data when you use the Platform.
            </p>
          </section>

          {/* 2 */}
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">2. Data We Collect</h2>

            <h3 className="text-sm font-semibold text-foreground mt-3 mb-1">2.1 Account Information (via Google Sign-In)</h3>
            <p>
              When you sign in with Google, we receive and store:
            </p>
            <ul className="list-disc pl-5 mt-1 flex flex-col gap-1">
              <li>Your Google account ID (used as your unique user identifier)</li>
              <li>Your name and email address</li>
              <li>Your Google profile picture URL</li>
            </ul>
            <p className="mt-2 text-xs">
              We do not receive or store your Google account password.
            </p>

            <h3 className="text-sm font-semibold text-foreground mt-4 mb-1">2.2 User-Generated Data</h3>
            <p>Data you create while using the Platform, stored in our database:</p>
            <ul className="list-disc pl-5 mt-1 flex flex-col gap-1">
              <li>Your watchlist (tickers you add)</li>
              <li>Screener results and AI-generated top picks cached per session</li>
              <li>Tracked trade setups (ticker, entry/stop/target prices, pattern, status)</li>
            </ul>

            <h3 className="text-sm font-semibold text-foreground mt-4 mb-1">2.3 Local Storage</h3>
            <p>
              We store a consent acknowledgement flag in your browser&apos;s local storage (<code className="text-xs bg-surface-elevated px-1 py-0.5 rounded">technicalai_consent_v1</code>) to remember that you have accepted these terms. No personal data is stored in local storage.
            </p>

            <h3 className="text-sm font-semibold text-foreground mt-4 mb-1">2.4 Usage Data</h3>
            <p>
              We may log server-side events (ticker lookups, scan initiations) for debugging and service reliability. These logs do not contain personally identifiable information beyond your user ID.
            </p>
          </section>

          {/* 3 */}
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">3. How We Use Your Data</h2>
            <ul className="list-disc pl-5 flex flex-col gap-1">
              <li>To authenticate you and maintain your session</li>
              <li>To store and display your personal watchlist and trade setups</li>
              <li>To cache screener results for faster load times</li>
              <li>To operate, maintain, and improve the Platform</li>
              <li>To monitor for abuse or misuse of the service</li>
            </ul>
            <p className="mt-2">
              We do <strong className="text-foreground">not</strong> sell, rent, or share your personal data with third parties for marketing purposes.
            </p>
          </section>

          {/* 4 */}
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">4. Third-Party Services</h2>
            <p>The Platform uses the following third-party services that may process your data:</p>
            <ul className="list-disc pl-5 mt-2 flex flex-col gap-2">
              <li>
                <strong className="text-foreground">Google OAuth</strong> — handles authentication. Governed by{" "}
                <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Google&apos;s Privacy Policy</a>.
              </li>
              <li>
                <strong className="text-foreground">Supabase</strong> — our database provider (PostgreSQL). Your data is stored on Supabase-managed infrastructure. See{" "}
                <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Supabase&apos;s Privacy Policy</a>.
              </li>
              <li>
                <strong className="text-foreground">Google Gemini API</strong> — AI analysis. Chart data (OHLCV bars and tickers) is sent to Google&apos;s Gemini API for pattern analysis. No personally identifiable information is included in these requests. Governed by{" "}
                <a href="https://ai.google.dev/terms" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Google AI Terms</a>.
              </li>
              <li>
                <strong className="text-foreground">Yahoo Finance</strong> — market data provider. Stock price and OHLCV data is fetched from Yahoo Finance&apos;s public API. No user data is sent to Yahoo Finance.
              </li>
            </ul>
          </section>

          {/* 5 */}
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">5. Data Security</h2>
            <p>
              We take reasonable measures to protect your data, including encrypted database connections (SSL/TLS) and secure authentication via industry-standard OAuth 2.0. However, no method of transmission over the internet or electronic storage is 100% secure, and we cannot guarantee absolute security.
            </p>
          </section>

          {/* 6 */}
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">6. Data Retention</h2>
            <p>
              We retain your data for as long as your account is active or as needed to provide the service. Watchlist entries, trade setups, and cached results are stored indefinitely unless you delete them or request account deletion.
            </p>
          </section>

          {/* 7 */}
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">7. Your Rights</h2>
            <p>Depending on your jurisdiction, you may have the right to:</p>
            <ul className="list-disc pl-5 mt-2 flex flex-col gap-1">
              <li>Access the personal data we hold about you</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of your account and associated data</li>
              <li>Object to or restrict certain processing of your data</li>
              <li>Data portability (receive your data in a structured format)</li>
            </ul>
            <p className="mt-2">
              To exercise any of these rights, contact us through the Platform.
            </p>
          </section>

          {/* 8 */}
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">8. Children&apos;s Privacy</h2>
            <p>
              The Platform is not directed to individuals under the age of 18. We do not knowingly collect personal data from minors. If you believe a minor has provided us with personal data, please contact us and we will delete it.
            </p>
          </section>

          {/* 9 */}
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">9. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of significant changes by updating the effective date above. Continued use of the Platform after changes are posted constitutes acceptance of the revised policy.
            </p>
          </section>

          {/* 10 */}
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">10. Contact</h2>
            <p>
              If you have any questions or concerns about this Privacy Policy, please contact us through the Platform.
            </p>
          </section>

          <div className="border-t border-border pt-6 text-xs text-muted-foreground/60">
            <Link href="/legal/terms" className="text-accent hover:underline">Terms of Service</Link>
            {" · "}
            <Link href="/" className="text-accent hover:underline">Back to TechnicalAI</Link>
          </div>

        </div>
      </div>
    </div>
  );
}
