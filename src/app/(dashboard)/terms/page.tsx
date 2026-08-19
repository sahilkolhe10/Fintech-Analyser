export default function TermsPage() {
    return (
        <div className="min-h-screen pt-20 px-6 max-w-4xl mx-auto text-gray-300">
            <h1 className="text-3xl font-bold text-white mb-6">Terms of Service</h1>
            <div className="space-y-4">
                <p>Last updated: {new Date().toLocaleDateString()}</p>
                <p>
                    Please read these Terms of Service carefully before using KhataHouse.
                </p>

                <h2 className="text-xl font-semibold text-white mt-8">1. Acceptance of Terms</h2>
                <p>
                    By accessing or using our service, you agree to be bound by these Terms. If you disagree with any part of the terms, you may not use the service.
                </p>

                <h2 className="text-xl font-semibold text-white mt-8">2. Use of Service</h2>
                <p>
                    KhataHouse provides financial analysis and tracking tools. You agree to use these tools only for lawful purposes and in accordance with these Terms.
                </p>

                <h2 className="text-xl font-semibold text-white mt-8">3. Financial Disclaimer</h2>
                <p>
                    The insights and analysis provided by KhataHouse are for informational purposes only and do not constitute professional financial advice. Always consult with a qualified financial advisor before making investment decisions.
                </p>

                <h2 className="text-xl font-semibold text-white mt-8">4. Changes to Terms</h2>
                <p>
                    We reserve the right to modify or replace these Terms at any time. We will try to provide at least 30 days&apos; notice prior to any new terms taking effect.
                </p>
            </div>
        </div>
    );
}
